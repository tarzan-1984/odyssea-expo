import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MOBILE_DEVICE_CONTEXT_KEY = '@mobile_device_context_v1';

export type MobileDeviceContext = {
	deviceId: string;
	platform: string;
	deviceName?: string;
	model?: string;
	osVersion?: string;
	appVersion?: string;
};

let cachedDeviceId: string | null = null;

/** Stable per-installation id (Android ID / iOS IDFV via react-native-device-info). */
export async function resolveStableDeviceId(): Promise<string> {
	if (cachedDeviceId) {
		return cachedDeviceId;
	}
	const id = (await DeviceInfo.getUniqueId()).trim();
	if (!id) {
		throw new Error('resolveStableDeviceId: empty device id');
	}
	cachedDeviceId = id;
	return id;
}

export async function buildMobileDeviceContext(): Promise<MobileDeviceContext> {
	const deviceId = await resolveStableDeviceId();
	return {
		deviceId,
		platform: Platform.OS,
		deviceName: Device.deviceName ?? undefined,
		model: Device.modelName ?? undefined,
		osVersion: Device.osVersion ?? undefined,
		appVersion:
			Application.nativeApplicationVersion ||
			Application.nativeBuildVersion ||
			undefined,
	};
}

/** Persist device metadata for background location task (AsyncStorage works in headless JS). */
export async function cacheMobileDeviceContextForBackground(): Promise<MobileDeviceContext> {
	const ctx = await buildMobileDeviceContext();
	await AsyncStorage.setItem(MOBILE_DEVICE_CONTEXT_KEY, JSON.stringify(ctx));
	return ctx;
}

export async function loadMobileDeviceContextForBackground(): Promise<MobileDeviceContext | null> {
	try {
		const raw = await AsyncStorage.getItem(MOBILE_DEVICE_CONTEXT_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as MobileDeviceContext;
			if (parsed?.deviceId?.trim()) {
				return parsed;
			}
		}
	} catch {
		// fall through to live read
	}
	try {
		return await buildMobileDeviceContext();
	} catch {
		return null;
	}
}

export function formatMobileDeviceLabel(ctx: {
	model?: string | null;
	deviceName?: string | null;
	deviceId?: string | null;
}): string | null {
	const model = ctx.model?.trim();
	const deviceName = ctx.deviceName?.trim();
	if (model && deviceName && deviceName.toLowerCase() !== model.toLowerCase()) {
		return `${deviceName} (${model})`;
	}
	if (model) {
		return model;
	}
	if (deviceName) {
		return deviceName;
	}
	const id = ctx.deviceId?.trim();
	return id ? id.slice(0, 8) : null;
}
