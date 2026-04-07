import { API_BASE_URL } from '@/lib/config';
import { buildMobileDevicePayload } from '@/utils/mobileDevicePayload';

/**
 * Saves a device snapshot to user_devices after login (requires users.externalId on server).
 * Push delivery continues to use push_tokens; pushToken here is analytics copy only.
 */
export async function registerMobileDeviceAfterLogin(
	accessToken: string,
	extra?: { pushToken?: string | null },
): Promise<void> {
	const apiBase = API_BASE_URL;
	if (!apiBase || !accessToken) {
		return;
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
		}
	} catch (e) {
		console.warn('[mobileDeviceApi] register error:', e);
	}
}
