import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/config';
import {
	buildMobileDevicePayload,
	getMobileDeviceAppFingerprint,
} from '@/utils/mobileDevicePayload';

const MOBILE_DEVICE_SYNC_FINGERPRINT_KEY = '@mobile_device_sync_fingerprint';

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
	extra?: { pushToken?: string | null },
): Promise<boolean> {
	const apiBase = API_BASE_URL;
	if (!apiBase || !accessToken) {
		return false;
	}

	const body = {
		...buildMobileDevicePayload(),
		...(extra?.pushToken ? { pushToken: extra.pushToken } : {}),
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
	const ok = await submitMobileDeviceSnapshot(accessToken, extra);
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
