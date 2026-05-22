import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

export function buildMobileDevicePayload(): {
	platform: string;
	appVersion?: string;
	deviceName?: string;
	model?: string;
	osVersion?: string;
} {
	return {
		platform: Platform.OS,
		appVersion:
			Application.nativeApplicationVersion ||
			Application.nativeBuildVersion ||
			undefined,
		deviceName: Device.deviceName ?? undefined,
		model: Device.modelName ?? undefined,
		osVersion: Device.osVersion ?? undefined,
	};
}

/** Version + native build — used to detect App Store / Play updates without re-login. */
export function getMobileDeviceAppFingerprint(): string {
	const v = Application.nativeApplicationVersion ?? '';
	const b = Application.nativeBuildVersion ?? '';
	return `${v}|${b}`;
}
