import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import {
	tryBuildMobileDevicePayload,
	getMobileDeviceAppFingerprint,
} from '@/utils/mobileDevicePayload';
import { secureStorage } from '@/utils/secureStorage';

const MOBILE_DEVICE_SYNC_FINGERPRINT_KEY = '@mobile_device_sync_fingerprint';

export type UserDeviceRow = {
	id: string;
	deviceId: string | null;
	platform: string;
	appVersion: string | null;
	deviceName: string | null;
	model: string | null;
	osVersion: string | null;
	lastActiveAt: string | null;
	createdAt: string;
	updatedAt: string;
};

async function getAccessToken(): Promise<string | null> {
	return secureStorage.getItemAsync('accessToken');
}

function unwrapApiListPayload<T>(json: unknown): T[] {
	if (!json || typeof json !== 'object') {
		return [];
	}
	const root = json as { data?: unknown };
	const inner = root.data;
	if (Array.isArray(inner)) {
		return inner as T[];
	}
	if (inner && typeof inner === 'object' && Array.isArray((inner as { data?: unknown }).data)) {
		return (inner as { data: T[] }).data;
	}
	return [];
}

/** Cleared on logout so the next session can sync device metadata again. */
export async function clearMobileDeviceSyncFingerprint(): Promise<void> {
	await AsyncStorage.removeItem(MOBILE_DEVICE_SYNC_FINGERPRINT_KEY);
}

async function persistMobileDeviceSyncFingerprint(): Promise<void> {
	await AsyncStorage.setItem(
		MOBILE_DEVICE_SYNC_FINGERPRINT_KEY,
		getMobileDeviceAppFingerprint(),
	);
}

async function submitMobileDeviceSnapshot(
	accessToken: string,
	extra?: { pushToken?: string | null; reactivate?: boolean },
): Promise<boolean> {
	const apiBase = API_BASE_URL;
	if (!apiBase || !accessToken) {
		return false;
	}

	const body = {
		...(await tryBuildMobileDevicePayload()),
		...(extra?.pushToken ? { pushToken: extra.pushToken } : {}),
		...(extra?.reactivate === true ? { reactivate: true } : {}),
	};

	try {
		const res = await fetch(`${apiBase}/v1/auth/mobile-device`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const t = await res.text().catch(() => '');
			const {
				isDeviceDeactivatedApiError,
				isDeviceBlockedApiError,
				emitForceDeviceLogout,
				DeviceBlockedError,
				parseDeviceBlockedMessage,
			} = await import('@/utils/forceDeviceLogout');
			if (isDeviceBlockedApiError(res.status, t)) {
				if (extra?.reactivate === true) {
					throw new DeviceBlockedError(parseDeviceBlockedMessage(t));
				}
				emitForceDeviceLogout('device_blocked');
				return false;
			}
			if (isDeviceDeactivatedApiError(res.status, t)) {
				emitForceDeviceLogout('device_deactivated');
				return false;
			}
			console.warn(
				'[mobileDeviceApi] register failed:',
				res.status,
				t,
			);
			return false;
		}
		return true;
	} catch (e) {
		console.warn('[mobileDeviceApi] register error:', e);
		return false;
	}
}

/**
 * Saves a device snapshot to user_devices after login (requires users.externalId on server).
 * Push delivery continues to use push_tokens; pushToken here is analytics copy only.
 * On success persists version/build fingerprint for syncMobileDeviceIfFingerprintChanged.
 */
export async function registerMobileDeviceAfterLogin(
	accessToken: string,
	extra?: { pushToken?: string | null },
): Promise<void> {
	const ok = await submitMobileDeviceSnapshot(accessToken, {
		...extra,
		reactivate: true,
	});
	if (ok) {
		await persistMobileDeviceSyncFingerprint();
	}
}

/**
 * POST /mobile-device only when native app version or build changed vs last successful sync.
 * Updates user_devices (appVersion, device fields) and backend updatedAt via Prisma @updatedAt.
 */
export async function syncMobileDeviceIfFingerprintChanged(
	accessToken: string | null | undefined,
	extra?: { pushToken?: string | null },
): Promise<void> {
	if (!accessToken) {
		return;
	}

	const current = getMobileDeviceAppFingerprint();
	let prev: string | null = null;
	try {
		prev = await AsyncStorage.getItem(MOBILE_DEVICE_SYNC_FINGERPRINT_KEY);
	} catch {
		prev = null;
	}

	if (prev === current) {
		return;
	}

	const ok = await submitMobileDeviceSnapshot(accessToken, extra);
	if (ok) {
		await persistMobileDeviceSyncFingerprint();
	}
}

export async function fetchActiveUserDevices(): Promise<UserDeviceRow[]> {
	const apiBase = API_BASE_URL;
	const accessToken = await getAccessToken();
	if (!apiBase || !accessToken) {
		return [];
	}

	try {
		const res = await fetch(`${apiBase}/v1/auth/mobile-devices`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		if (!res.ok) {
			const t = await res.text().catch(() => '');
			console.warn('[mobileDeviceApi] list failed:', res.status, t);
			throw new Error(`Failed to load devices (${res.status})`);
		}
		const json = await res.json();
		return unwrapApiListPayload<UserDeviceRow>(json);
	} catch (e) {
		console.warn('[mobileDeviceApi] list error:', e);
		return [];
	}
}

export async function deactivateUserDevice(deviceRowId: string): Promise<boolean> {
	const apiBase = API_BASE_URL;
	const accessToken = await getAccessToken();
	if (!apiBase || !accessToken || !deviceRowId) {
		return false;
	}

	try {
		const res = await fetch(
			`${apiBase}/v1/auth/mobile-devices/${encodeURIComponent(deviceRowId)}`,
			{
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);
		if (!res.ok) {
			const t = await res.text().catch(() => '');
			console.warn('[mobileDeviceApi] deactivate failed:', res.status, t);
			return false;
		}
		return true;
	} catch (e) {
		console.warn('[mobileDeviceApi] deactivate error:', e);
		return false;
	}
}
