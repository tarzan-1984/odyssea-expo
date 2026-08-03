import { Platform, AppState } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import { fileLogger } from '@/utils/fileLogger';

const SLEEP_MS = 1000;

let activeScopes = 0;
let startPromise: Promise<void> | null = null;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Headless/background task body: keeps the Android FGS (and iOS background task)
 * alive until BackgroundService.stop() is called after work finishes.
 */
async function keepAliveTask(): Promise<void> {
	while (BackgroundService.isRunning()) {
		await sleep(SLEEP_MS);
	}
}

async function startKeepAlive(): Promise<void> {
	if (BackgroundService.isRunning()) return;
	if (startPromise) {
		await startPromise;
		return;
	}

	startPromise = (async () => {
		try {
			await BackgroundService.start(keepAliveTask, {
				taskName: 'OdysseaChatOutbox',
				taskTitle: 'Sending messages',
				taskDesc: 'Finishing chat send in the background',
				taskIcon: {
					name: 'ic_launcher',
					type: 'mipmap',
				},
				color: '#292966',
				linkingURI: 'odyssea://',
				parameters: {},
				...(Platform.OS === 'android'
					? { foregroundServiceType: ['dataSync'] as ('dataSync')[] }
					: {}),
			});

			BackgroundService.on('expiration', () => {
				fileLogger.warn('ChatUploadKeepAlive', 'IOS_BACKGROUND_EXPIRED', {
					activeScopes,
				});
			});

			fileLogger.info('ChatUploadKeepAlive', 'STARTED', {
				platform: Platform.OS,
				appState: AppState.currentState,
			});
		} catch (error) {
			fileLogger.warn('ChatUploadKeepAlive', 'START_FAILED', {
				platform: Platform.OS,
				appState: AppState.currentState,
				error: error instanceof Error ? error.message : String(error),
			});
			// Non-fatal: HTTP flush still runs in the short OS background window.
		} finally {
			startPromise = null;
		}
	})();

	await startPromise;
}

async function stopKeepAlive(): Promise<void> {
	if (!BackgroundService.isRunning()) return;
	try {
		await BackgroundService.stop();
		fileLogger.info('ChatUploadKeepAlive', 'STOPPED', {
			platform: Platform.OS,
		});
	} catch (error) {
		fileLogger.warn('ChatUploadKeepAlive', 'STOP_FAILED', {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Begin a keep-alive scope (refcount). First scope starts Android FGS / iOS bg task.
 */
export async function beginChatUploadKeepAlive(): Promise<void> {
	activeScopes += 1;
	if (activeScopes === 1) {
		await startKeepAlive();
	}
}

/**
 * End a keep-alive scope. Stops the service when the last upload finishes.
 */
export async function endChatUploadKeepAlive(): Promise<void> {
	activeScopes = Math.max(0, activeScopes - 1);
	if (activeScopes === 0) {
		await stopKeepAlive();
	}
}

/**
 * Run work while holding a background keep-alive (upload + send).
 * Safe to nest — uses a refcount.
 */
export async function withChatUploadKeepAlive<T>(
	fn: () => Promise<T>,
): Promise<T> {
	await beginChatUploadKeepAlive();
	try {
		return await fn();
	} finally {
		await endChatUploadKeepAlive();
	}
}

export function isChatUploadKeepAliveRunning(): boolean {
	return BackgroundService.isRunning();
}

/** Exposed for tests / diagnostics. */
export function getChatUploadKeepAliveScopeCount(): number {
	return activeScopes;
}
