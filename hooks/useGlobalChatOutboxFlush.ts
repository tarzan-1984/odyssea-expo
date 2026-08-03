import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { eventBus, AppEvents } from '@/services/EventBus';
import { flushPendingOutbox } from '@/services/chatOutboxFlushService';
import { withChatUploadKeepAlive } from '@/services/chatUploadBackgroundKeeper';
import { chatOutboxService } from '@/services/chatOutboxService';
import { hasActiveOutboxMediaUploads } from '@/services/outboxUploadLock';

const MAX_FAILED_AUTO_RETRY = 3;
/** iOS typically grants ~30s of background execution via beginBackgroundTask. */
const LEAVE_ACTIVE_KEEP_MS = 25_000;

async function hasFlushableOutboxItems(): Promise<boolean> {
	const all = await chatOutboxService.getAll();
	return all.some((item) => {
		if (item.serverMessageId) return false;
		if (item.status === 'uploading' || item.status === 'sending') return true;
		if (item.status === 'failed' && (item.retryCount ?? 0) < MAX_FAILED_AUTO_RETRY) {
			return true;
		}
		return false;
	});
}

async function sleep(ms: number): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

/**
 * Flushes pending chat outbox (text + media) via HTTP.
 * On leave-active: keep JS awake and only send already-uploaded items so we
 * don't race a second S3 upload against the in-flight dispatch path.
 */
export function useGlobalChatOutboxFlush(): void {
	const { authState } = useAuth();
	const isAuthenticated = authState.isAuthenticated;
	const appStateRef = useRef<AppStateStatus>(AppState.currentState);
	const wasInBackgroundRef = useRef(false);
	const initialFlushDoneRef = useRef(false);
	const isAuthenticatedRef = useRef(isAuthenticated);
	isAuthenticatedRef.current = isAuthenticated;
	const backgroundFlushStartedRef = useRef(false);

	const runFlush = (reason: string) => {
		if (!isAuthenticatedRef.current) return;
		void (async () => {
			try {
				const hasWork = await hasFlushableOutboxItems();
				const leaveActive = reason.startsWith('leave-active');
				if (!hasWork && !(leaveActive && hasActiveOutboxMediaUploads())) return;

				console.log(`[useGlobalChatOutboxFlush] flush (${reason})`);

				if (leaveActive) {
					// Hold keep-alive so in-flight dispatch can finish prepare+presign+PUT.
					// Do NOT start a competing upload while the lock is held.
					await withChatUploadKeepAlive(async () => {
						const deadline = Date.now() + LEAVE_ACTIVE_KEEP_MS;
						let waitedForOwner = 0;
						while (Date.now() < deadline) {
							await flushPendingOutbox({ sendOnly: true });
							const pending = await hasFlushableOutboxItems();
							const uploading = hasActiveOutboxMediaUploads();
							if (!pending && !uploading) break;
							if (pending && !uploading) {
								// Give dispatch a moment to claim the lock after KeepAlive start.
								if (waitedForOwner < 3) {
									waitedForOwner += 1;
									await sleep(1000);
									continue;
								}
								console.log(
									'[useGlobalChatOutboxFlush] orphaned outbox — full flush takeover',
								);
								await flushPendingOutbox({ sendOnly: false });
								break;
							}
							waitedForOwner = 0;
							await sleep(1000);
						}
					});
					return;
				}

				await withChatUploadKeepAlive(async () => {
					for (let attempt = 0; attempt < 6; attempt += 1) {
						await flushPendingOutbox({ sendOnly: false });
						const stillPending = await hasFlushableOutboxItems();
						if (!stillPending) break;
						await sleep(1000);
					}
				});
			} catch (error) {
				console.warn('[useGlobalChatOutboxFlush] flush failed:', error);
			}
		})();
	};

	useEffect(() => {
		if (!isAuthenticated) {
			initialFlushDoneRef.current = false;
			return;
		}
		if (initialFlushDoneRef.current) return;
		initialFlushDoneRef.current = true;
		runFlush('mount');
	}, [isAuthenticated]);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (next) => {
			const prev = appStateRef.current;

			if (prev === 'active' && next.match(/inactive|background/)) {
				wasInBackgroundRef.current = true;
				if (!backgroundFlushStartedRef.current) {
					backgroundFlushStartedRef.current = true;
					runFlush(`leave-active:${next}`);
				}
			}

			if (
				wasInBackgroundRef.current &&
				prev.match(/inactive|background/) &&
				next === 'active'
			) {
				wasInBackgroundRef.current = false;
				backgroundFlushStartedRef.current = false;
				runFlush('become-active');
			}

			appStateRef.current = next;
		});
		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (!isAuthenticated) return;
		const off = eventBus.on(AppEvents.WebSocketReconnected, () => {
			runFlush('ws-reconnected');
		});
		return off;
	}, [isAuthenticated]);
}
