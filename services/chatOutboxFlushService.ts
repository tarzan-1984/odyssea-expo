import type { FileData } from '@/utils/chatAttachmentHelpers';
import { uploadAttachmentFiles } from '@/utils/chatAttachmentHelpers';
import {
	createClientDiagFlowId,
	reportClientDiag,
	reportClientError,
} from '@/utils/reportClientError';
import { formatUploadErrorMessage } from '@/utils/mimeTypeUpload';
import { fileLogger } from '@/utils/fileLogger';
import { chatApi } from '@/app-api/chatApi';
import { useChatStore } from '@/stores/chatStore';
import { eventBus, AppEvents } from '@/services/EventBus';
import {
	chatOutboxService,
	type ChatOutboxItem,
	type OutboxUploadedAttachment,
} from '@/services/chatOutboxService';
import { withChatUploadKeepAlive } from '@/services/chatUploadBackgroundKeeper';
import {
	beginOutboxMediaUpload,
	endOutboxMediaUpload,
	isOutboxMediaUploadActive,
} from '@/services/outboxUploadLock';

/** Max automatic foreground retries for items marked failed. */
const MAX_FAILED_AUTO_RETRY = 3;

export type FlushOutboxOptions = {
	/** Only HTTP-send items that already have uploadedAttachments (or text). */
	sendOnly?: boolean;
};

const inFlight = new Map<string, number>();
let flushPromise: Promise<{ processed: number; sent: number; failed: number }> | null =
	null;

/** Claims older than this are considered stuck (JS suspended mid-send). */
const STALE_CLAIM_TTL_MS = 35_000;

export function isOutboxItemInFlight(clientMessageId: string): boolean {
	return inFlight.has(clientMessageId);
}

/** Claim exclusive processing for an outbox item. Returns false if already claimed. */
export function claimOutboxItem(clientMessageId: string): boolean {
	if (inFlight.has(clientMessageId)) return false;
	inFlight.set(clientMessageId, Date.now());
	return true;
}

export function releaseOutboxItem(clientMessageId: string): void {
	inFlight.delete(clientMessageId);
}

/** Release only stale claims so a full flush can take over stuck work without stealing live sends. */
export function releaseStaleOutboxClaims(ttlMs: number = STALE_CLAIM_TTL_MS): void {
	const now = Date.now();
	let released = 0;
	for (const [id, startedAt] of inFlight) {
		if (now - startedAt >= ttlMs) {
			inFlight.delete(id);
			released += 1;
		}
	}
	if (released > 0) {
		fileLogger.info('ChatOutboxFlush', 'RELEASE_STALE_CLAIMS', {
			count: released,
			ttlMs,
		});
	}
}

/** @deprecated Prefer releaseStaleOutboxClaims — clearing all claims races in-flight HTTP. */
export function releaseAllOutboxClaims(): void {
	if (inFlight.size > 0) {
		fileLogger.info('ChatOutboxFlush', 'RELEASE_ALL_CLAIMS', {
			count: inFlight.size,
		});
	}
	inFlight.clear();
}

function localFilesToFileData(
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

function shouldAutoFlush(item: ChatOutboxItem): boolean {
	if (item.serverMessageId) return false;
	if (item.status === 'uploading' || item.status === 'sending') return true;
	if (item.status === 'failed' && (item.retryCount ?? 0) < MAX_FAILED_AUTO_RETRY) {
		return true;
	}
	return false;
}

async function sendItemViaHttp(
	item: ChatOutboxItem,
	uploaded?: OutboxUploadedAttachment[],
): Promise<void> {
	const attachments = uploaded ?? item.uploadedAttachments;
	const multi = attachments && attachments.length >= 2 ? attachments : null;

	const newMessage = await chatApi.sendMessage({
		chatRoomId: item.chatRoomId,
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
			: attachments?.[0]
				? {
						fileUrl: attachments[0].fileUrl,
						fileName: attachments[0].fileName,
						fileSize: attachments[0].fileSize,
					}
				: {}),
	});

	useChatStore.getState().addMessage(item.chatRoomId, newMessage);
	await chatOutboxService.remove(item.clientMessageId);
	eventBus.emit(AppEvents.ChatOutboxItemFlushed, {
		clientMessageId: item.clientMessageId,
		chatRoomId: item.chatRoomId,
		messageId: newMessage.id,
	});
}

/**
 * Process one outbox item: upload media if needed, then send via HTTP.
 * Safe to call from background-resume / global flush (no WS required).
 * Holds Android FGS / iOS background task for the whole upload+send.
 */
export async function processOutboxItem(
	item: ChatOutboxItem,
	options?: FlushOutboxOptions,
): Promise<'sent' | 'skipped' | 'failed'> {
	return withChatUploadKeepAlive(() => processOutboxItemInner(item, options));
}

async function processOutboxItemInner(
	item: ChatOutboxItem,
	options?: FlushOutboxOptions,
): Promise<'sent' | 'skipped' | 'failed'> {
	if (!claimOutboxItem(item.clientMessageId)) {
		return 'skipped';
	}

	const flowId = createClientDiagFlowId('flush');
	const sendOnly = Boolean(options?.sendOnly);
	let ownsUpload = false;

	try {
		// Re-read after claim — another path may have finished while we waited.
		const latest =
			(await chatOutboxService.getAll()).find(
				(row) => row.clientMessageId === item.clientMessageId,
			) ?? null;
		if (!latest) {
			return 'skipped';
		}
		if (latest.serverMessageId) {
			await chatOutboxService.remove(latest.clientMessageId);
			eventBus.emit(AppEvents.ChatOutboxItemFlushed, {
				clientMessageId: latest.clientMessageId,
				chatRoomId: latest.chatRoomId,
				messageId: latest.serverMessageId,
			});
			return 'skipped';
		}

		item = latest;

		let uploaded: OutboxUploadedAttachment[] | undefined = item.uploadedAttachments;

		if (item.kind === 'media') {
			if (!uploaded?.length) {
				// Another path (dispatch) already uploading — do not start a second S3 PUT.
				if (isOutboxMediaUploadActive(item.clientMessageId)) {
					fileLogger.info('ChatOutboxFlush', 'SKIP_UPLOAD_IN_PROGRESS', {
						clientMessageId: item.clientMessageId,
					});
					return 'skipped';
				}

				// On leave-active, only send already-uploaded media; let dispatch finish PUT.
				if (sendOnly) {
					fileLogger.info('ChatOutboxFlush', 'SKIP_SEND_ONLY_NO_UPLOAD', {
						clientMessageId: item.clientMessageId,
					});
					return 'skipped';
				}

				const files = localFilesToFileData(item.localFiles ?? []);
				if (files.length === 0) {
					await reportClientError({
						feature: 'chat_photo_upload',
						stage: 'flush_missing_files',
						message: 'Missing local files for outbox flush',
						flowId,
						details: {
							chatRoomId: item.chatRoomId,
							clientMessageId: item.clientMessageId,
						},
					});
					await chatOutboxService.markFailed(item.clientMessageId);
					eventBus.emit(AppEvents.ChatOutboxItemFailed, {
						clientMessageId: item.clientMessageId,
						chatRoomId: item.chatRoomId,
					});
					return 'failed';
				}

				if (!beginOutboxMediaUpload(item.clientMessageId)) {
					fileLogger.info('ChatOutboxFlush', 'SKIP_UPLOAD_RACE', {
						clientMessageId: item.clientMessageId,
					});
					return 'skipped';
				}
				ownsUpload = true;

				await chatOutboxService.patch(item.clientMessageId, { status: 'uploading' });
				await reportClientDiag({
					feature: 'chat_photo_upload',
					stage: 'flush_upload_start',
					message: `Outbox flush upload start (${files.length})`,
					flowId,
					details: {
						chatRoomId: item.chatRoomId,
						clientMessageId: item.clientMessageId,
						fileCount: files.length,
					},
				});

				uploaded = await uploadAttachmentFiles(files, undefined, { flowId });
				await chatOutboxService.patch(item.clientMessageId, {
					uploadedAttachments: uploaded,
					status: 'sending',
				});

				await reportClientDiag({
					feature: 'chat_photo_upload',
					stage: 'flush_upload_done',
					message: `Outbox flush upload done (${uploaded.length})`,
					flowId,
					details: {
						chatRoomId: item.chatRoomId,
						clientMessageId: item.clientMessageId,
						uploadedCount: uploaded.length,
					},
				});
			}

			if (!uploaded?.length) {
				await chatOutboxService.markFailed(item.clientMessageId);
				eventBus.emit(AppEvents.ChatOutboxItemFailed, {
					clientMessageId: item.clientMessageId,
					chatRoomId: item.chatRoomId,
				});
				return 'failed';
			}
		} else {
			await chatOutboxService.patch(item.clientMessageId, { status: 'sending' });
		}

		await sendItemViaHttp(item, uploaded);

		if (item.kind === 'media') {
			await reportClientDiag({
				feature: 'chat_photo_upload',
				stage: 'flush_sent',
				message: 'Outbox flush media sent via HTTP',
				flowId,
				details: {
					chatRoomId: item.chatRoomId,
					clientMessageId: item.clientMessageId,
					uploadedCount: uploaded?.length ?? 0,
				},
			});
		}

		fileLogger.info('ChatOutboxFlush', 'ITEM_SENT', {
			clientMessageId: item.clientMessageId,
			chatRoomId: item.chatRoomId,
			kind: item.kind,
		});

		return 'sent';
	} catch (error) {
		console.warn('[ChatOutboxFlush] process failed:', error);
		if (item.kind === 'media') {
			await reportClientError({
				feature: 'chat_photo_upload',
				stage: 'flush_dispatch',
				message: formatUploadErrorMessage(error),
				error,
				flowId,
				details: {
					chatRoomId: item.chatRoomId,
					clientMessageId: item.clientMessageId,
					hasUploaded: Boolean(item.uploadedAttachments?.length),
				},
			});
		}
		await chatOutboxService.markFailed(item.clientMessageId);
		eventBus.emit(AppEvents.ChatOutboxItemFailed, {
			clientMessageId: item.clientMessageId,
			chatRoomId: item.chatRoomId,
		});
		fileLogger.error('ChatOutboxFlush', 'ITEM_FAILED', {
			clientMessageId: item.clientMessageId,
			chatRoomId: item.chatRoomId,
			error: error instanceof Error ? error.message : String(error),
		});
		return 'failed';
	} finally {
		if (ownsUpload) {
			endOutboxMediaUpload(item.clientMessageId);
		}
		releaseOutboxItem(item.clientMessageId);
	}
}

/**
 * Flush all pending outbox items (text + media) via HTTP.
 * Dedupes concurrent flush calls. Safe when chat screen is not mounted.
 */
export async function flushPendingOutbox(options?: FlushOutboxOptions): Promise<{
	processed: number;
	sent: number;
	failed: number;
}> {
	if (flushPromise) {
		return flushPromise;
	}

	const sendOnly = Boolean(options?.sendOnly);

	flushPromise = (async () => {
		// Full flush may take over after JS suspended mid-send.
		// Safe now: room leave-active no longer HTTP-sends in parallel, and
		// backend idempotency keys on clientMessageId.
		if (!sendOnly) {
			releaseAllOutboxClaims();
		}

		const all = await chatOutboxService.getAll();
		const pending = all
			.filter(shouldAutoFlush)
			.sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			);

		let sent = 0;
		let failed = 0;
		let processed = 0;

		if (pending.length === 0) {
			return { processed, sent, failed };
		}

		fileLogger.info('ChatOutboxFlush', 'FLUSH_START', {
			count: pending.length,
			sendOnly,
		});

		for (const item of pending) {
			const result = await processOutboxItem(item, { sendOnly });
			if (result === 'skipped') continue;
			processed += 1;
			if (result === 'sent') sent += 1;
			else failed += 1;
		}

		eventBus.emit(AppEvents.ChatOutboxFlushCompleted, {
			processed,
			sent,
			failed,
		});

		fileLogger.info('ChatOutboxFlush', 'FLUSH_DONE', {
			processed,
			sent,
			failed,
			sendOnly,
		});
		return { processed, sent, failed };
	})().finally(() => {
		flushPromise = null;
	});

	return flushPromise;
}
