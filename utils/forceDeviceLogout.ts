import { eventBus, AppEvents } from '@/services/EventBus';

let loginDeviceReactivationInProgress = false;

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
