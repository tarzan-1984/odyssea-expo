import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';
import type { Message, User } from '@/components/ChatListItem';
import type { FileData } from '@/utils/chatAttachmentHelpers';
import { uploadAttachmentFiles } from '@/utils/chatAttachmentHelpers';
import {
	beginImageSendFlow,
	completeImageUploadFlow,
	markImageMessageWsSent,
} from '@/utils/chatImageFlowTiming';
import {
	createClientDiagFlowId,
	reportClientDiag,
	reportClientError,
} from '@/utils/reportClientError';
import { formatUploadErrorMessage } from '@/utils/mimeTypeUpload';
import { fileLogger } from '@/utils/fileLogger';
import {
	chatOutboxService,
	createClientMessageId,
	type ChatOutboxItem,
	type OutboxUploadedAttachment,
} from '@/services/chatOutboxService';
import {
	claimOutboxItem,
	releaseOutboxItem,
} from '@/services/chatOutboxFlushService';
import {
	beginChatUploadKeepAlive,
	endChatUploadKeepAlive,
	withChatUploadKeepAlive,
} from '@/services/chatUploadBackgroundKeeper';
import {
	beginOutboxMediaUpload,
	endOutboxMediaUpload,
	isOutboxMediaUploadActive,
} from '@/services/outboxUploadLock';
import {
	createOptimisticPhotoMessage,
	createOptimisticTextMessage,
	messageReplacesOptimistic,
	outboxItemToOptimisticMessage,
	patchOptimisticMessage,
	patchOptimisticUploadStatus,
	pendingIdForClientMessage,
	removeOptimisticByClientMessageId,
} from '@/utils/optimisticChatMessage';
import { eventBus, AppEvents } from '@/services/EventBus';
import { chatApi } from '@/app-api/chatApi';
import { useChatStore } from '@/stores/chatStore';

const SEND_ACK_TIMEOUT_MS = 60_000;

type SendMessageFn = (
	content: string,
	fileData?: { fileUrl: string; fileName: string; fileSize: number },
	replyData?: Message['replyData'],
	attachments?: { fileUrl: string; fileName: string; fileSize?: number }[],
	clientMessageId?: string,
) => Promise<void>;

type Params = {
	chatRoomId?: string;
	sender?: User;
	isConnected: boolean;
	socket: Socket | null;
	sendMessage: SendMessageFn;
	optimisticMessages: Message[];
	setOptimisticMessages: Dispatch<SetStateAction<Message[]>>;
	serverMessages: Message[];
	currentUserId?: string;
	onUploadStateChange?: (uploading: boolean) => void;
};

function filesToOutboxLocal(files: FileData[]) {
	return files.map((file) => ({
		uri: file.uri,
		name: file.name,
		mimeType: file.mimeType,
		size: file.size,
		originalName: file.originalName,
	}));
}

function outboxLocalToFileData(
	localFiles: NonNullable<ChatOutboxItem['localFiles']>,
): FileData[] {
	return localFiles.map((file) => ({
		uri: file.uri,
		name: file.name,
		mimeType: file.mimeType,
		size: file.size,
		originalName: file.originalName,
	}));
}

export function useChatOutboxSend({
	chatRoomId,
	sender,
	isConnected,
	socket,
	sendMessage,
	optimisticMessages,
	setOptimisticMessages,
	serverMessages,
	currentUserId,
	onUploadStateChange,
}: Params) {
	const awaitingAckRef = useRef<Set<string>>(new Set());
	const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const optimisticMessagesRef = useRef(optimisticMessages);
	const appStateRef = useRef<AppStateStatus>(AppState.currentState);

	useEffect(() => {
		optimisticMessagesRef.current = optimisticMessages;
	}, [optimisticMessages]);

	const markOptimisticFailed = useCallback(
		(clientMessageId: string) => {
			void chatOutboxService.markFailed(clientMessageId);
			awaitingAckRef.current.delete(clientMessageId);
			setOptimisticMessages((prev) =>
				prev.map((msg) =>
					msg.pendingOutgoing?.clientMessageId === clientMessageId
						? patchOptimisticMessage(msg, { status: 'failed' })
						: msg,
				),
			);
		},
		[setOptimisticMessages],
	);

	const clearAckTimer = useCallback((clientMessageId: string) => {
		const timer = ackTimersRef.current.get(clientMessageId);
		if (timer) {
			clearTimeout(timer);
			ackTimersRef.current.delete(clientMessageId);
		}
	}, []);

	const removeConfirmedOptimistic = useCallback(
		async (clientMessageId: string) => {
			clearAckTimer(clientMessageId);
			releaseOutboxItem(clientMessageId);
			awaitingAckRef.current.delete(clientMessageId);
			await chatOutboxService.remove(clientMessageId);
			setOptimisticMessages((prev) => removeOptimisticByClientMessageId(prev, clientMessageId));
		},
		[clearAckTimer, setOptimisticMessages],
	);

	const tryHttpFallback = useCallback(
		async (
			clientMessageId: string,
			overrides?: {
				uploadedAttachments?: OutboxUploadedAttachment[];
				content?: string;
			},
			options?: { alreadyClaimed?: boolean },
		): Promise<boolean> => {
			if (!chatRoomId) return false;

			// Exclusive ownership — do not race global flush / another fallback.
			let ownsClaim = Boolean(options?.alreadyClaimed);
			if (!ownsClaim) {
				if (!claimOutboxItem(clientMessageId)) {
					fileLogger.info('ChatOutbox', 'HTTP_FALLBACK_SKIPPED_IN_FLIGHT', {
						chatRoomId,
						clientMessageId,
					});
					return false;
				}
				ownsClaim = true;
			}

			try {
				const item = (await chatOutboxService.getAll()).find(
					(row) => row.clientMessageId === clientMessageId,
				);
				if (!item) return false;
				if (item.serverMessageId) {
					await removeConfirmedOptimistic(clientMessageId);
					ownsClaim = false; // released inside removeConfirmedOptimistic
					return true;
				}

				const uploaded =
					overrides?.uploadedAttachments ?? item.uploadedAttachments;
				const content =
					overrides?.content !== undefined ? overrides.content : item.content;

				// Photo-only messages have empty content — never HTTP-send media without files.
				if (item.kind === 'media' && !uploaded?.length) {
					fileLogger.warn('ChatOutbox', 'HTTP_FALLBACK_SKIPPED_NO_UPLOAD', {
						chatRoomId,
						clientMessageId,
					});
					return false;
				}
				if (
					!(content ?? '').trim() &&
					!(uploaded && uploaded.length > 0)
				) {
					fileLogger.warn('ChatOutbox', 'HTTP_FALLBACK_SKIPPED_EMPTY', {
						chatRoomId,
						clientMessageId,
						kind: item.kind,
					});
					return false;
				}

				try {
					const multi = uploaded && uploaded.length >= 2 ? uploaded : null;
					const newMessage = await chatApi.sendMessage({
						chatRoomId,
						content: content ?? '',
						clientMessageId: item.clientMessageId,
						replyData: item.replyData,
						...(multi
							? {
									attachments: multi,
									fileUrl: multi[0].fileUrl,
									fileName: multi[0].fileName,
									fileSize: multi[0].fileSize,
								}
							: uploaded?.[0]
								? {
										fileUrl: uploaded[0].fileUrl,
										fileName: uploaded[0].fileName,
										fileSize: uploaded[0].fileSize,
									}
								: {}),
					});
					useChatStore.getState().addMessage(chatRoomId, newMessage);
					await removeConfirmedOptimistic(clientMessageId);
					ownsClaim = false;
					return true;
				} catch (error) {
					console.warn('[useChatOutboxSend] HTTP fallback failed:', error);
					fileLogger.error('ChatOutbox', 'HTTP_FALLBACK_FAILED', {
						chatRoomId,
						clientMessageId,
						kind: item.kind,
						hasUploaded: Boolean(uploaded?.length),
						error: error instanceof Error ? error.message : String(error),
					});
					return false;
				}
			} finally {
				if (ownsClaim) {
					releaseOutboxItem(clientMessageId);
				}
			}
		},
		[chatRoomId, removeConfirmedOptimistic],
	);

	const recoverViaHttpOrFail = useCallback(
		(clientMessageId: string) => {
			awaitingAckRef.current.delete(clientMessageId);
			void tryHttpFallback(clientMessageId).then((recovered) => {
				if (!recovered) {
					markOptimisticFailed(clientMessageId);
				}
			});
		},
		[tryHttpFallback, markOptimisticFailed],
	);

	const scheduleAckTimeout = useCallback(
		(clientMessageId: string) => {
			clearAckTimer(clientMessageId);
			const timer = setTimeout(() => {
				ackTimersRef.current.delete(clientMessageId);
				recoverViaHttpOrFail(clientMessageId);
			}, SEND_ACK_TIMEOUT_MS);
			ackTimersRef.current.set(clientMessageId, timer);
		},
		[clearAckTimer, recoverViaHttpOrFail],
	);

	const dispatchOutboxSend = useCallback(
		async (item: ChatOutboxItem) => {
			if (!chatRoomId || !sender) return;

			// Lock before any await so leave-active flush cannot race a second PUT.
			let ownsUploadLock = false;
			if (item.kind === 'media' && !item.uploadedAttachments?.length) {
				ownsUploadLock = beginOutboxMediaUpload(item.clientMessageId);
			}

			try {
			await withChatUploadKeepAlive(async () => {
			let uploaded: OutboxUploadedAttachment[] | undefined =
				item.uploadedAttachments;
			let sendClaimed = false;

			try {
				const flowId = createClientDiagFlowId('outbox');

				// Upload WITHOUT exclusive claim so background flush can take over if JS suspends.
				if (item.kind === 'media') {
					if (!uploaded?.length) {
						onUploadStateChange?.(true);
						beginImageSendFlow();
						const files = outboxLocalToFileData(item.localFiles ?? []);
						if (files.length === 0) {
							await reportClientError({
								feature: 'chat_photo_upload',
								stage: 'outbox_missing_files',
								message: 'Missing local files for media retry',
								flowId,
								details: {
									chatRoomId,
									clientMessageId: item.clientMessageId,
								},
							});
							throw new Error('Missing local files for media retry');
						}

						const optimisticId = pendingIdForClientMessage(item.clientMessageId);

						if (!ownsUploadLock) {
							const deadline = Date.now() + 60_000;
							while (Date.now() < deadline) {
								const rows = await chatOutboxService.getAll();
								const row = rows.find(
									(r) => r.clientMessageId === item.clientMessageId,
								);
								if (row?.uploadedAttachments?.length) {
									uploaded = row.uploadedAttachments;
									break;
								}
								if (!isOutboxMediaUploadActive(item.clientMessageId)) {
									uploaded = row?.uploadedAttachments;
									break;
								}
								await new Promise((r) => setTimeout(r, 500));
							}
						} else {
							await reportClientDiag({
								feature: 'chat_photo_upload',
								stage: 'outbox_upload_start',
								message: `Outbox media upload start (${files.length})`,
								flowId,
								details: {
									chatRoomId,
									clientMessageId: item.clientMessageId,
									fileCount: files.length,
									fileNames: files.map((f) => f.name).slice(0, 10),
									mimeTypes: files.map((f) => f.mimeType).slice(0, 10),
								},
							});

							try {
								uploaded = await uploadAttachmentFiles(
									files,
									(index, status) => {
										setOptimisticMessages((prev) =>
											prev.map((msg) => {
												if (msg.id !== optimisticId) return msg;
												const uploadStatus =
													status === 'uploading'
														? 'uploading'
														: status === 'done'
															? 'done'
															: 'error';
												return patchOptimisticUploadStatus(
													msg,
													index,
													uploadStatus,
												);
											}),
										);
									},
									{ flowId },
								);
							} finally {
								endOutboxMediaUpload(item.clientMessageId);
								ownsUploadLock = false;
							}
						}

						if (!uploaded?.length) {
							throw new Error('Media upload did not complete');
						}

						completeImageUploadFlow(uploaded.length);
						await chatOutboxService.patch(item.clientMessageId, {
							uploadedAttachments: uploaded,
							status: 'sending',
						});
						setOptimisticMessages((prev) =>
							prev.map((msg) =>
								msg.pendingOutgoing?.clientMessageId === item.clientMessageId
									? patchOptimisticMessage(msg, {
											status: 'sending',
											expectedFileUrls: uploaded!.map((row) => row.fileUrl),
											localAttachments:
												msg.pendingOutgoing?.localAttachments.map((row) => ({
													...row,
													uploadStatus: 'done' as const,
												})) ?? [],
										})
									: msg,
							),
						);
						onUploadStateChange?.(false);
					}

					if (!uploaded?.length) {
						await reportClientError({
							feature: 'chat_photo_upload',
							stage: 'outbox_empty_upload',
							message: 'Upload produced no files',
							flowId,
							details: {
								chatRoomId,
								clientMessageId: item.clientMessageId,
							},
						});
						throw new Error('Upload produced no files');
					}

					await chatOutboxService.patch(item.clientMessageId, {
						uploadedAttachments: uploaded,
						status: 'sending',
					});
				}

				// Flush may have already finished this item while we were uploading.
				const latest = (await chatOutboxService.getAll()).find(
					(row) => row.clientMessageId === item.clientMessageId,
				);
				if (!latest) {
					setOptimisticMessages((prev) =>
						removeOptimisticByClientMessageId(prev, item.clientMessageId),
					);
					return;
				}
				if (latest.uploadedAttachments?.length) {
					uploaded = latest.uploadedAttachments;
				}

				if (!claimOutboxItem(item.clientMessageId)) {
					// Another path owns this item — wait for it to finish, then retry once.
					const peerDeadline = Date.now() + 8_000;
					let peerDone = false;
					while (Date.now() < peerDeadline) {
						const rows = await chatOutboxService.getAll();
						const row = rows.find(
							(r) => r.clientMessageId === item.clientMessageId,
						);
						if (!row || row.serverMessageId) {
							peerDone = true;
							break;
						}
						if (claimOutboxItem(item.clientMessageId)) {
							sendClaimed = true;
							break;
						}
						await new Promise((r) => setTimeout(r, 250));
					}
					if (peerDone) {
						setOptimisticMessages((prev) =>
							removeOptimisticByClientMessageId(prev, item.clientMessageId),
						);
						return;
					}
					if (!sendClaimed) {
						// Last resort: force-take ownership so foreground send is not stuck.
						releaseOutboxItem(item.clientMessageId);
						if (!claimOutboxItem(item.clientMessageId)) {
							fileLogger.warn('ChatOutbox', 'CLAIM_GIVE_UP', {
								chatRoomId,
								clientMessageId: item.clientMessageId,
							});
							return;
						}
						sendClaimed = true;
					}
				} else {
					sendClaimed = true;
				}

				const preferHttp =
					AppState.currentState !== 'active' || !isConnected;

				if (preferHttp) {
					const recovered = await tryHttpFallback(
						item.clientMessageId,
						{
							uploadedAttachments: uploaded,
							content: item.content,
						},
						{ alreadyClaimed: true },
					);
					sendClaimed = false; // claim released inside tryHttpFallback
					if (!recovered) {
						throw new Error(
							AppState.currentState !== 'active'
								? 'HTTP send failed while app backgrounded'
								: 'HTTP send failed (WebSocket disconnected)',
						);
					}
					return;
				}

				if (item.kind === 'media') {
					const mediaUploaded = uploaded!;
					if (mediaUploaded.length >= 2) {
						await sendMessage(
							item.content,
							undefined,
							item.replyData,
							mediaUploaded,
							item.clientMessageId,
						);
					} else {
						await sendMessage(
							item.content,
							mediaUploaded[0],
							item.replyData,
							undefined,
							item.clientMessageId,
						);
					}
					await reportClientDiag({
						feature: 'chat_photo_upload',
						stage: 'outbox_ws_sent',
						message: `Outbox media WS send dispatched (${mediaUploaded.length})`,
						flowId,
						details: {
							chatRoomId,
							clientMessageId: item.clientMessageId,
							uploadedCount: mediaUploaded.length,
						},
					});
					markImageMessageWsSent(mediaUploaded.map((row) => row.fileUrl));
				} else {
					await sendMessage(
						item.content,
						undefined,
						item.replyData,
						undefined,
						item.clientMessageId,
					);
				}

				await chatOutboxService.patch(item.clientMessageId, { status: 'sending' });
				setOptimisticMessages((prev) =>
					prev.map((msg) =>
						msg.pendingOutgoing?.clientMessageId === item.clientMessageId
							? patchOptimisticMessage(msg, { status: 'sending' })
							: msg,
					),
				);
				awaitingAckRef.current.add(item.clientMessageId);
				scheduleAckTimeout(item.clientMessageId);
				// Release claim so leave-active global flush can HTTP-send if ack is lost.
				// Room hook must NOT also HTTP on leave-active (that caused duplicates).
			} catch (error) {
				console.warn('[useChatOutboxSend] WebSocket dispatch failed:', error);
				if (item.kind === 'media') {
					await reportClientError({
						feature: 'chat_photo_upload',
						stage: 'outbox_dispatch',
						message: formatUploadErrorMessage(error),
						error,
						details: {
							chatRoomId,
							clientMessageId: item.clientMessageId,
							hasUploaded: Boolean(
								uploaded?.length || item.uploadedAttachments?.length,
							),
							localFileCount: item.localFiles?.length ?? 0,
							appState: AppState.currentState,
						},
					});
				}

				const stillQueued = (await chatOutboxService.getAll()).find(
					(row) => row.clientMessageId === item.clientMessageId,
				);
				if (!stillQueued) return;

				const recovered = await tryHttpFallback(
					item.clientMessageId,
					{
						uploadedAttachments: uploaded ?? stillQueued.uploadedAttachments,
						content: item.content,
					},
					{ alreadyClaimed: sendClaimed },
				);
				if (recovered) {
					sendClaimed = false;
					return;
				}
				sendClaimed = false; // released inside tryHttpFallback when alreadyClaimed

				if (
					item.kind === 'media' &&
					!(uploaded?.length || stillQueued.uploadedAttachments?.length)
				) {
					await chatOutboxService.patch(item.clientMessageId, {
						status: 'uploading',
					});
					fileLogger.warn('ChatOutbox', 'KEEP_QUEUED_UNTIL_UPLOAD', {
						chatRoomId,
						clientMessageId: item.clientMessageId,
						appState: AppState.currentState,
					});
					return;
				}

				markOptimisticFailed(item.clientMessageId);
				throw error;
			} finally {
				if (sendClaimed) {
					releaseOutboxItem(item.clientMessageId);
				}
				onUploadStateChange?.(false);
			}
			});
			} finally {
				if (ownsUploadLock) {
					endOutboxMediaUpload(item.clientMessageId);
				}
			}
		},
		[
			chatRoomId,
			sender,
			isConnected,
			sendMessage,
			markOptimisticFailed,
			tryHttpFallback,
			onUploadStateChange,
			scheduleAckTimeout,
			setOptimisticMessages,
		],
	);

	const sendTextMessage = useCallback(
		async (content: string, replyData?: Message['replyData']) => {
			if (!chatRoomId || !sender) return;

			// Start FGS/bg-task ASAP so minimize mid-send still has keep-alive.
			void beginChatUploadKeepAlive();

			const clientMessageId = createClientMessageId();
			const optimistic = createOptimisticTextMessage({
				clientMessageId,
				chatRoomId,
				sender,
				content,
				replyData,
			});

			setOptimisticMessages((prev) => [...prev, optimistic]);

			await chatOutboxService.upsert({
				clientMessageId,
				chatRoomId,
				kind: 'text',
				content,
				replyData,
				status: 'sending',
				createdAt: optimistic.createdAt,
				retryCount: 0,
			});

			try {
				await dispatchOutboxSend({
					clientMessageId,
					chatRoomId,
					kind: 'text',
					content,
					replyData,
					status: 'sending',
					createdAt: optimistic.createdAt,
					retryCount: 0,
				});
			} finally {
				void endChatUploadKeepAlive();
			}
		},
		[chatRoomId, sender, dispatchOutboxSend, setOptimisticMessages],
	);

	const sendMediaMessage = useCallback(
		async (content: string, files: FileData[], replyData?: Message['replyData']) => {
			if (!chatRoomId || !sender || files.length === 0) {
				await reportClientDiag({
					feature: 'chat_photo_upload',
					stage: 'send_media_skipped',
					message: 'sendMediaMessage skipped',
					level: 'warn',
					details: {
						hasChatRoomId: Boolean(chatRoomId),
						hasSender: Boolean(sender),
						fileCount: files.length,
					},
				});
				return;
			}

			const clientMessageId = createClientMessageId();
			await reportClientDiag({
				feature: 'chat_photo_upload',
				stage: 'send_media_queued',
				message: `Media message queued (${files.length})`,
				flowId: clientMessageId,
				details: {
					chatRoomId,
					clientMessageId,
					fileCount: files.length,
					fileNames: files.map((f) => f.name).slice(0, 10),
					mimeTypes: files.map((f) => f.mimeType).slice(0, 10),
				},
			});

			const optimistic = createOptimisticPhotoMessage({
				clientMessageId,
				chatRoomId,
				sender,
				content,
				files,
				replyData,
			});

			setOptimisticMessages((prev) => [...prev, optimistic]);

			const outboxItem = {
				clientMessageId,
				chatRoomId,
				kind: 'media' as const,
				content,
				replyData,
				localFiles: filesToOutboxLocal(files),
				status: 'uploading' as const,
				createdAt: optimistic.createdAt,
				retryCount: 0,
			};

			void beginChatUploadKeepAlive();
			await chatOutboxService.upsert(outboxItem);
			try {
				await dispatchOutboxSend(outboxItem);
			} finally {
				void endChatUploadKeepAlive();
			}
		},
		[chatRoomId, sender, dispatchOutboxSend, setOptimisticMessages],
	);

	const retryOptimisticMessage = useCallback(
		async (message: Message) => {
			const clientMessageId = message.pendingOutgoing?.clientMessageId;
			if (!clientMessageId || !chatRoomId) return;

			const item = (await chatOutboxService.getAll()).find(
				(row) => row.clientMessageId === clientMessageId,
			);
			if (!item) return;

			await chatOutboxService.patch(clientMessageId, { status: 'sending' });
			setOptimisticMessages((prev) =>
				prev.map((msg) =>
					msg.pendingOutgoing?.clientMessageId === clientMessageId
						? patchOptimisticMessage(msg, {
								status:
									item.kind === 'media' && !item.uploadedAttachments?.length
										? 'uploading'
										: 'sending',
							})
						: msg,
				),
			);
			await dispatchOutboxSend({ ...item, status: 'sending' });
		},
		[chatRoomId, dispatchOutboxSend, setOptimisticMessages],
	);

	const discardFailedOptimisticMessage = useCallback(
		async (message: Message) => {
			const clientMessageId = message.pendingOutgoing?.clientMessageId;
			if (!clientMessageId) return;
			endOutboxMediaUpload(clientMessageId);
			await removeConfirmedOptimistic(clientMessageId);
		},
		[removeConfirmedOptimistic],
	);

	const hydrateRoomOutbox = useCallback(async () => {
		if (!chatRoomId || !sender) return;
		const items = await chatOutboxService.getForRoom(chatRoomId);
		if (items.length === 0) return;

		setOptimisticMessages((prev) => {
			const existingIds = new Set(
				prev.map((msg) => msg.pendingOutgoing?.clientMessageId).filter(Boolean),
			);
			const fromOutbox = items
				.filter((item) => !existingIds.has(item.clientMessageId))
				.map((item) => outboxItemToOptimisticMessage(item, sender));
			return fromOutbox.length > 0 ? [...prev, ...fromOutbox] : prev;
		});

		for (const item of items) {
			if (item.serverMessageId || awaitingAckRef.current.has(item.clientMessageId)) {
				continue;
			}
			if (
				item.status === 'uploading' ||
				item.status === 'sending' ||
				(item.status === 'failed' && (item.retryCount ?? 0) < 3)
			) {
				void dispatchOutboxSend({
					...item,
					status:
						item.kind === 'media' && !item.uploadedAttachments?.length
							? 'uploading'
							: 'sending',
				}).catch(() => {});
			}
		}
	}, [chatRoomId, sender, dispatchOutboxSend, setOptimisticMessages]);

	useEffect(() => {
		void hydrateRoomOutbox();
	}, [hydrateRoomOutbox]);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (next) => {
			const prev = appStateRef.current;
			if (prev === 'active' && next.match(/inactive|background/)) {
				// Hand off to global flush: stop waiting for WS ack, keep outbox items
				// flushable. Do NOT HTTP-send here (raced flush and duplicated messages).
				const pendingIds = Array.from(awaitingAckRef.current);
				for (const clientMessageId of pendingIds) {
					clearAckTimer(clientMessageId);
					awaitingAckRef.current.delete(clientMessageId);
					releaseOutboxItem(clientMessageId);
				}
			}
			if (prev.match(/inactive|background/) && next === 'active') {
				void hydrateRoomOutbox();
			}
			appStateRef.current = next;
		});
		return () => subscription.remove();
	}, [hydrateRoomOutbox, clearAckTimer]);

	useEffect(() => {
		if (!chatRoomId) return;

		const onFlushed = (payload: {
			clientMessageId?: string;
			chatRoomId?: string;
		}) => {
			if (payload.chatRoomId !== chatRoomId || !payload.clientMessageId) return;
			clearAckTimer(payload.clientMessageId);
			awaitingAckRef.current.delete(payload.clientMessageId);
			setOptimisticMessages((prev) =>
				removeOptimisticByClientMessageId(prev, payload.clientMessageId!),
			);
		};

		const onFailed = (payload: {
			clientMessageId?: string;
			chatRoomId?: string;
		}) => {
			if (payload.chatRoomId !== chatRoomId || !payload.clientMessageId) return;
			clearAckTimer(payload.clientMessageId);
			awaitingAckRef.current.delete(payload.clientMessageId);
			setOptimisticMessages((prev) =>
				prev.map((msg) =>
					msg.pendingOutgoing?.clientMessageId === payload.clientMessageId
						? patchOptimisticMessage(msg, { status: 'failed' })
						: msg,
				),
			);
		};

		const offFlushed = eventBus.on(AppEvents.ChatOutboxItemFlushed, onFlushed);
		const offFailed = eventBus.on(AppEvents.ChatOutboxItemFailed, onFailed);
		return () => {
			offFlushed();
			offFailed();
		};
	}, [chatRoomId, clearAckTimer, setOptimisticMessages]);

	useEffect(() => {
		if (!currentUserId || optimisticMessages.length === 0) return;
		const confirmed = optimisticMessages.filter((opt) =>
			messageReplacesOptimistic(opt, serverMessages, currentUserId),
		);
		if (confirmed.length === 0) return;
		void Promise.all(
			confirmed.map((msg) =>
				removeConfirmedOptimistic(msg.pendingOutgoing!.clientMessageId),
			),
		);
	}, [serverMessages, optimisticMessages, currentUserId, removeConfirmedOptimistic]);

	useEffect(() => {
		if (!socket || !chatRoomId) return;

		const resolveClientMessageId = (data: {
			clientMessageId?: string;
			messageId?: string;
		}): string | null => {
			if (data.clientMessageId) return data.clientMessageId;
			const pending = optimisticMessagesRef.current.filter(
				(msg) =>
					msg.chatRoomId === chatRoomId &&
					msg.pendingOutgoing &&
					(msg.pendingOutgoing.status === 'sending' ||
						msg.pendingOutgoing.status === 'uploading' ||
						msg.pendingOutgoing.status === 'acknowledged'),
			);
			if (pending.length !== 1) return null;
			return pending[0].pendingOutgoing?.clientMessageId ?? null;
		};

		const onMessageSent = (data: {
			chatRoomId?: string;
			clientMessageId?: string;
			messageId?: string;
		}) => {
			if (data?.chatRoomId !== chatRoomId || !data.messageId) return;
			const clientMessageId = resolveClientMessageId(data);
			if (!clientMessageId) return;

			clearAckTimer(clientMessageId);
			awaitingAckRef.current.delete(clientMessageId);
			void chatOutboxService.markAcknowledged(clientMessageId, data.messageId);
			setOptimisticMessages((prev) =>
				prev.map((msg) =>
					msg.pendingOutgoing?.clientMessageId === clientMessageId
						? patchOptimisticMessage(msg, {
								status: 'acknowledged',
								serverMessageId: data.messageId,
							})
						: msg,
				),
			);
		};

		const onNewMessage = (
			data:
				| { chatRoomId?: string; message?: Message }
				| [{ chatRoomId?: string; message?: Message }],
		) => {
			const messageData = Array.isArray(data) ? data[0] : data;
			if (messageData?.chatRoomId !== chatRoomId || !messageData.message) return;
			if (messageData.message.senderId !== currentUserId) return;

			const clientMessageId = messageData.message.clientMessageId;
			if (clientMessageId) {
				clearAckTimer(clientMessageId);
				const hasOptimistic = optimisticMessagesRef.current.some(
					(msg) => msg.pendingOutgoing?.clientMessageId === clientMessageId,
				);
				if (hasOptimistic) {
					void removeConfirmedOptimistic(clientMessageId);
				}
				return;
			}

			const optimistic = optimisticMessagesRef.current.find(
				(msg) =>
					msg.pendingOutgoing?.serverMessageId === messageData.message?.id,
			);
			if (optimistic?.pendingOutgoing?.clientMessageId) {
				clearAckTimer(optimistic.pendingOutgoing.clientMessageId);
				void removeConfirmedOptimistic(optimistic.pendingOutgoing.clientMessageId);
			}
		};

		socket.on('messageSent', onMessageSent);
		socket.on('newMessage', onNewMessage);
		return () => {
			socket.off('messageSent', onMessageSent);
			socket.off('newMessage', onNewMessage);
		};
	}, [socket, chatRoomId, currentUserId, clearAckTimer, removeConfirmedOptimistic, setOptimisticMessages]);

	useEffect(() => {
		const off = eventBus.on(AppEvents.WebSocketReconnected, () => {
			void hydrateRoomOutbox();
		});
		return off;
	}, [hydrateRoomOutbox]);

	useEffect(() => {
		return () => {
			for (const timer of ackTimersRef.current.values()) {
				clearTimeout(timer);
			}
			ackTimersRef.current.clear();
		};
	}, []);

	return {
		sendTextMessage,
		sendMediaMessage,
		retryOptimisticMessage,
		discardFailedOptimisticMessage,
	};
}
