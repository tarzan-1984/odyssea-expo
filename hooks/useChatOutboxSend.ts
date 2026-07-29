import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
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
	socket,
	sendMessage,
	optimisticMessages,
	setOptimisticMessages,
	serverMessages,
	currentUserId,
	onUploadStateChange,
}: Params) {
	const inFlightRef = useRef<Set<string>>(new Set());
	const awaitingAckRef = useRef<Set<string>>(new Set());
	const ackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const optimisticMessagesRef = useRef(optimisticMessages);

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
			inFlightRef.current.delete(clientMessageId);
			awaitingAckRef.current.delete(clientMessageId);
			await chatOutboxService.remove(clientMessageId);
			setOptimisticMessages((prev) => removeOptimisticByClientMessageId(prev, clientMessageId));
		},
		[clearAckTimer, setOptimisticMessages],
	);

	const tryHttpFallback = useCallback(
		async (clientMessageId: string): Promise<boolean> => {
			if (!chatRoomId) return false;
			const item = (await chatOutboxService.getAll()).find(
				(row) => row.clientMessageId === clientMessageId,
			);
			if (!item) return false;

			try {
				const uploaded = item.uploadedAttachments;
				const multi = uploaded && uploaded.length >= 2 ? uploaded : null;
				const newMessage = await chatApi.sendMessage({
					chatRoomId,
					content: item.content,
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
				return true;
			} catch (error) {
				console.warn('[useChatOutboxSend] HTTP fallback failed:', error);
				fileLogger.error('ChatOutbox', 'HTTP_FALLBACK_FAILED', {
					chatRoomId,
					clientMessageId,
					error: error instanceof Error ? error.message : String(error),
				});
				return false;
			}
		},
		[chatRoomId, removeConfirmedOptimistic],
	);

	const recoverViaHttpOrFail = useCallback(
		(clientMessageId: string) => {
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
			if (inFlightRef.current.has(item.clientMessageId)) return;
			inFlightRef.current.add(item.clientMessageId);

			try {
				let uploaded: OutboxUploadedAttachment[] | undefined = item.uploadedAttachments;
				const flowId = createClientDiagFlowId('outbox');

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

						const optimisticId = pendingIdForClientMessage(item.clientMessageId);
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
										return patchOptimisticUploadStatus(msg, index, uploadStatus);
									}),
								);
							},
							{ flowId },
						);
						completeImageUploadFlow(uploaded.length);
						void chatOutboxService.patch(item.clientMessageId, {
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

					if (uploaded.length >= 2) {
						await sendMessage(
							item.content,
							undefined,
							item.replyData,
							uploaded,
							item.clientMessageId,
						);
					} else {
						await sendMessage(
							item.content,
							uploaded[0],
							item.replyData,
							undefined,
							item.clientMessageId,
						);
					}
					await reportClientDiag({
						feature: 'chat_photo_upload',
						stage: 'outbox_ws_sent',
						message: `Outbox media WS send dispatched (${uploaded.length})`,
						flowId,
						details: {
							chatRoomId,
							clientMessageId: item.clientMessageId,
							uploadedCount: uploaded.length,
						},
					});
					markImageMessageWsSent(uploaded.map((row) => row.fileUrl));
				} else {
				await sendMessage(
					item.content,
					undefined,
					item.replyData,
					undefined,
					item.clientMessageId,
				);
				}

				void chatOutboxService.patch(item.clientMessageId, { status: 'sending' });
				setOptimisticMessages((prev) =>
					prev.map((msg) =>
						msg.pendingOutgoing?.clientMessageId === item.clientMessageId
							? patchOptimisticMessage(msg, { status: 'sending' })
							: msg,
					),
				);
				awaitingAckRef.current.add(item.clientMessageId);
				scheduleAckTimeout(item.clientMessageId);
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
							hasUploaded: Boolean(item.uploadedAttachments?.length),
							localFileCount: item.localFiles?.length ?? 0,
						},
					});
				}
				const recovered = await tryHttpFallback(item.clientMessageId);
				if (!recovered) {
					markOptimisticFailed(item.clientMessageId);
					throw error;
				}
			} finally {
				inFlightRef.current.delete(item.clientMessageId);
				onUploadStateChange?.(false);
			}
		},
		[
			chatRoomId,
			sender,
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

			const clientMessageId = createClientMessageId();
			const optimistic = createOptimisticTextMessage({
				clientMessageId,
				chatRoomId,
				sender,
				content,
				replyData,
			});

			setOptimisticMessages((prev) => [...prev, optimistic]);

			void chatOutboxService.upsert({
				clientMessageId,
				chatRoomId,
				kind: 'text',
				content,
				replyData,
				status: 'sending',
				createdAt: optimistic.createdAt,
				retryCount: 0,
			});

			void dispatchOutboxSend({
				clientMessageId,
				chatRoomId,
				kind: 'text',
				content,
				replyData,
				status: 'sending',
				createdAt: optimistic.createdAt,
				retryCount: 0,
			});
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

			void chatOutboxService.upsert(outboxItem);
			void dispatchOutboxSend(outboxItem);
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
			if (item.status === 'uploading' || item.status === 'sending') {
				void dispatchOutboxSend(item).catch(() => {});
			}
		}
	}, [chatRoomId, sender, dispatchOutboxSend, setOptimisticMessages]);

	useEffect(() => {
		void hydrateRoomOutbox();
	}, [hydrateRoomOutbox]);

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
				(msg) => msg.pendingOutgoing?.serverMessageId === messageData.message.id,
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
	};
}
