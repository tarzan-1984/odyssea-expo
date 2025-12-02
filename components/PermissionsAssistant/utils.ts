import { Linking, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";

export async function openBatterySettings() {
	if (Platform.OS !== "android") return;
	
	// Some devices do not support these intents at all.
	// Try them in order and fall back to generic app settings without throwing.
	try {
		await Linking.openURL("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS");
		return;
	} catch (e) {
		console.warn("[PermissionsAssistant] Failed to open REQUEST_IGNORE_BATTERY_OPTIMIZATIONS:", e);
	}

	try {
		await Linking.openURL("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
		return;
	} catch (e) {
		console.warn("[PermissionsAssistant] Failed to open IGNORE_BATTERY_OPTIMIZATION_SETTINGS:", e);
	}

	try {
		await Linking.openSettings();
	} catch (e) {
		console.warn("[PermissionsAssistant] Failed to open general app settings:", e);
	}
}

export async function openAutoStartSettings() {
	if (Platform.OS !== "android") return;
	
	const brand = (await DeviceInfo.getBrand()).toLowerCase();
	
	console.log("Device brand:", brand);
 	
 	// Xiaomi / Redmi / POCO (MIUI) specific intents for auto-start/battery settings
	if (brand === "xiaomi" || brand === "redmi" || brand === "poco") {
		const intents = [
			"miui.intent.action.OP_AUTO_START",
			"miui.intent.action.APP_PERM_EDITOR",
			"miui.intent.action.privacycenter",
			"package:com.miui.securitycenter",
 			// Direct intents to auto-start or security settings where auto-start is often located
			"package:com.miui.powerkeeper",
		];
		
		for (const url of intents) {
			try {
				const supported = await Linking.canOpenURL(url);
				if (supported) {
					console.log("Opening MIUI AutoStart using:", url);
					return Linking.openURL(url);
				}
			} catch {}
		}
	}
	
	// Huawei fallback
	if (brand === "huawei") {
		try {
			return Linking.openURL("package:com.huawei.systemmanager");
		} catch {}
	}
	
	// Samsung fallback
	if (brand === "samsung") {
		try {
			return Linking.openURL("package:com.samsung.android.lool");
		} catch {}
	}
	
	console.log("Fallback: opening general app settings");
	Linking.openSettings();
}