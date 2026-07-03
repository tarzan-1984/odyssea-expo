import { eventBus, AppEvents } from '@/services/EventBus';

export const DEVICE_BLOCKED_USER_MESSAGE =
	'This device has been blocked and cannot be used to sign in.';

let loginDeviceReactivationInProgress = false;

export class DeviceBlockedError extends Error {
	constructor(message = DEVICE_BLOCKED_USER_MESSAGE) {
		super(message);
		this.name = 'DeviceBlockedError';
	}
}

export function beginLoginDeviceReactivation(): void {
	loginDeviceReactivationInProgress = true;
}

export function endLoginDeviceReactivation(): void {
	loginDeviceReactivationInProgress = false;
}

export function emitForceDeviceLogout(reason = 'device_deactivated'): void {
	if (loginDeviceReactivationInProgress) {
		console.log(
			'[forceDeviceLogout] Skipped during login device reactivation:',
			reason,
		);
		return;
	}
	eventBus.emit(AppEvents.ForceLogout, { reason });
}

export function isDeviceBlockedApiError(
	status: number,
	bodyText: string,
): boolean {
	if (status !== 403) {
		return false;
	}
	const t = bodyText.toLowerCase();
	return (
		t.includes('device_blocked') ||
		t.includes('deviceblocked') ||
		(t.includes('blocked') && t.includes('device'))
	);
}

export function isDeviceDeactivatedApiError(
	status: number,
	bodyText: string,
): boolean {
	if (status !== 403) {
		return false;
	}
	const t = bodyText.toLowerCase();
	return (
		t.includes('device_deactivated') || t.includes('forcedevicelogout')
	);
}

export function parseDeviceBlockedMessage(bodyText: string): string {
	try {
		const json = JSON.parse(bodyText) as {
			message?: string | { message?: string };
			data?: { message?: string | { message?: string } };
		};
		const raw = json.data?.message ?? json.message;
		const code =
			typeof raw === 'string'
				? raw
				: typeof raw === 'object' && raw && 'message' in raw
					? String((raw as { message?: string }).message ?? '')
					: '';
		if (code.toUpperCase() === 'DEVICE_BLOCKED') {
			return DEVICE_BLOCKED_USER_MESSAGE;
		}
	} catch {
		// ignore
	}
	if (isDeviceBlockedApiError(403, bodyText)) {
		return DEVICE_BLOCKED_USER_MESSAGE;
	}
	return DEVICE_BLOCKED_USER_MESSAGE;
}
