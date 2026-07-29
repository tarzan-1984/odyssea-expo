import { API_BASE_URL } from '@/lib/config';
import { fileLogger } from '@/utils/fileLogger';
import { buildMobileDeviceContext } from '@/utils/mobileDeviceIdentity';
import { secureStorage } from '@/utils/secureStorage';

export type ClientDiagLevel = 'error' | 'warn' | 'info';

export type ReportClientErrorParams = {
	feature: string;
	message: string;
	stage?: string;
	error?: unknown;
	details?: Record<string, unknown>;
	/** Default: error. Use info/warn for breadcrumbs that are not failures. */
	level?: ClientDiagLevel;
	/** Correlates steps of one attach/upload attempt in Render. */
	flowId?: string;
};

type DeviceContext = Awaited<ReturnType<typeof buildMobileDeviceContext>>;

let cachedDevice: DeviceContext | null = null;
let cachedDeviceAt = 0;
const DEVICE_CACHE_MS = 60_000;

async function getDeviceContext(): Promise<DeviceContext | null> {
	const now = Date.now();
	if (cachedDevice && now - cachedDeviceAt < DEVICE_CACHE_MS) {
		return cachedDevice;
	}
	cachedDevice = await buildMobileDeviceContext().catch(() => null);
	cachedDeviceAt = now;
	return cachedDevice;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === 'string' && error.trim()) {
		return error;
	}
	return 'Unknown error';
}

function errorStack(error: unknown): string | undefined {
	if (error instanceof Error && error.stack) {
		return error.stack.slice(0, 4000);
	}
	return undefined;
}

/** Short id to group breadcrumbs of one attach attempt. */
export function createClientDiagFlowId(prefix = 'chat'): string {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeClientDiagToDeviceFile(
	level: ClientDiagLevel,
	payload: Record<string, unknown>,
): void {
	const tag = String(payload.feature || 'ClientDiag');
	const stage = payload.stage ? ` [${payload.stage}]` : '';
	const message = `${payload.message ?? ''}${stage}`;
	const fileData = {
		flowId: payload.flowId ?? null,
		level,
		appVersion: payload.appVersion ?? null,
		model: payload.model ?? null,
		platform: payload.platform ?? null,
		details: payload.details ?? null,
		stack: payload.stack ?? null,
	};

	if (level === 'error') {
		fileLogger.error(tag, message, fileData);
	} else if (level === 'warn') {
		fileLogger.warn(tag, message, fileData);
	} else {
		fileLogger.info(tag, message, fileData);
	}
}

/**
 * Log to on-device shareable file + POST to /v1/client-errors (Render).
 * Used for both failures ([ClientError]) and breadcrumbs ([ClientDiag]).
 */
export async function reportClientError(
	params: ReportClientErrorParams,
): Promise<void> {
	const level: ClientDiagLevel = params.level ?? 'error';
	const message = params.message || errorMessage(params.error);
	const stack = errorStack(params.error);
	const device = await getDeviceContext();

	const payload = {
		feature: params.feature,
		message,
		stage: params.stage,
		level,
		flowId: params.flowId,
		stack,
		platform: device?.platform,
		osVersion: device?.osVersion,
		model: device?.model,
		deviceName: device?.deviceName,
		deviceId: device?.deviceId,
		appVersion: device?.appVersion,
		details: params.details,
	};

	// Always persist locally first so Share logs works even if remote report fails.
	// fileLogger also mirrors to console.
	writeClientDiagToDeviceFile(level, payload);

	const tag = level === 'error' ? '[ClientError]' : '[ClientDiag]';

	const apiBase = API_BASE_URL;
	if (!apiBase) {
		console.warn(tag, 'No API_BASE_URL, skipped remote report');
		return;
	}

	try {
		const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
		if (!token) {
			console.warn(tag, 'No access token, skipped remote report');
			return;
		}

		const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		const timeoutId = controller
			? setTimeout(() => controller.abort(), 8_000)
			: null;

		try {
			const res = await fetch(`${apiBase}/v1/client-errors`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(payload),
				signal: controller?.signal,
			});

			if (!res.ok) {
				const body = await res.text().catch(() => '');
				console.warn(tag, 'Remote report failed:', res.status, body);
				fileLogger.warn('ClientDiag', 'Remote report failed', {
					status: res.status,
					body: body.slice(0, 500),
					feature: params.feature,
					stage: params.stage,
				});
			}
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
		}
	} catch (reportError) {
		console.warn(tag, 'Remote report error:', reportError);
		fileLogger.warn('ClientDiag', 'Remote report error', {
			error: errorMessage(reportError),
			feature: params.feature,
			stage: params.stage,
		});
	}
}

/**
 * Fire-and-forget breadcrumb (still awaited when diagnostics must land before next step).
 */
export function reportClientDiag(
	params: Omit<ReportClientErrorParams, 'level'> & { level?: ClientDiagLevel },
): Promise<void> {
	return reportClientError({
		...params,
		level: params.level ?? 'info',
	});
}

/** Short Alert text for photo flow failures. */
export function formatPhotoFlowErrorMessage(error: unknown): string {
	const msg = errorMessage(error);
	if (/permission/i.test(msg)) {
		return msg;
	}
	if (/manipulat|heic|heif|decode|load image|unable to load/i.test(msg)) {
		return `Could not process the photo on this device.\n\n${msg}`;
	}
	return msg.length > 280 ? `${msg.slice(0, 280)}…` : msg;
}
