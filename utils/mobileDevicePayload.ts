import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import {
	buildMobileDeviceContext,
	type MobileDeviceContext,
} from '@/utils/mobileDeviceIdentity';

export type MobileDevicePayload = {
	deviceId: string;
	platform: string;
	appVersion?: string;
	deviceName?: string;
	model?: string;
	osVersion?: string;
};

export async function buildMobileDevicePayload(): Promise<MobileDevicePayload> {
	const ctx = await buildMobileDeviceContext();
	return {
		deviceId: ctx.deviceId,
		platform: ctx.platform,
		appVersion: ctx.appVersion,
		deviceName: ctx.deviceName,
		model: ctx.model,
		osVersion: ctx.osVersion,
	};
}

/** Best-effort payload for legacy/partial builds (platform always set). */
export async function tryBuildMobileDevicePayload(): Promise<
	Partial<MobileDevicePayload> & { platform: string }
> {
	try {
		return await buildMobileDevicePayload();
	} catch {
		return { platform: Platform.OS };
	}
}

/** Version + native build — used to detect App Store / Play updates without re-login. */
export function getMobileDeviceAppFingerprint(): string {
	const v = Application.nativeApplicationVersion ?? '';
	const b = Application.nativeBuildVersion ?? '';
	return `${v}|${b}`;
}

export async function buildMobileDeviceQueryString(
	extra?: { pushToken?: string | null },
): Promise<string | null> {
	const payload = await tryBuildMobileDevicePayload();
	const deviceId = payload.deviceId?.trim();
	if (!deviceId) {
		return null;
	}

	const params = new URLSearchParams();
	params.set('deviceId', deviceId);
	params.set('platform', payload.platform);
	if (payload.appVersion) {
		params.set('appVersion', payload.appVersion);
	}
	if (payload.deviceName) {
		params.set('deviceName', payload.deviceName);
	}
	if (payload.model) {
		params.set('model', payload.model);
	}
	if (payload.osVersion) {
		params.set('osVersion', payload.osVersion);
	}
	const pushToken = extra?.pushToken?.trim();
	if (pushToken) {
		params.set('pushToken', pushToken);
	}
	return params.toString();
}

export function toLocationDeviceFields(
	ctx: Partial<MobileDeviceContext> | null | undefined,
): {
	deviceId?: string;
	deviceModel?: string;
	deviceName?: string;
	devicePlatform?: string;
} {
	if (!ctx?.deviceId?.trim()) {
		return {};
	}
	return {
		deviceId: ctx.deviceId.trim(),
		deviceModel: ctx.model?.trim() || undefined,
		deviceName: ctx.deviceName?.trim() || undefined,
		devicePlatform: ctx.platform?.trim() || Platform.OS,
	};
}
