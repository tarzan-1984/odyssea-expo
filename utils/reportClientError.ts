import { API_BASE_URL } from '@/lib/config';
import { buildMobileDeviceContext } from '@/utils/mobileDeviceIdentity';
import { secureStorage } from '@/utils/secureStorage';

export type ReportClientErrorParams = {
	feature: string;
	message: string;
	stage?: string;
	error?: unknown;
	details?: Record<string, unknown>;
};

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

/**
 * Log locally and POST to /v1/client-errors so the failure is visible in Render
 * even when the upload never reaches storage.
 */
export async function reportClientError(
	params: ReportClientErrorParams,
): Promise<void> {
	const message = params.message || errorMessage(params.error);
	const stack = errorStack(params.error);
	const device = await buildMobileDeviceContext().catch(() => null);

	const payload = {
		feature: params.feature,
		message,
		stage: params.stage,
		stack,
		platform: device?.platform,
		osVersion: device?.osVersion,
		model: device?.model,
		deviceName: device?.deviceName,
		deviceId: device?.deviceId,
		appVersion: device?.appVersion,
		details: params.details,
	};

	console.error('[ClientError]', payload);

	const apiBase = API_BASE_URL;
	if (!apiBase) {
		return;
	}

	try {
		const token = await secureStorage.getItemAsync('accessToken').catch(() => null);
		if (!token) {
			console.warn('[ClientError] No access token, skipped remote report');
			return;
		}

		const res = await fetch(`${apiBase}/v1/client-errors`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			console.warn('[ClientError] Remote report failed:', res.status, body);
		}
	} catch (reportError) {
		console.warn('[ClientError] Remote report error:', reportError);
	}
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
