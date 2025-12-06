import { Linking, Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { BatteryOptEnabled, OpenOptimizationSettings } from "react-native-battery-optimization-check";

export async function checkBatteryOptimizationStatus(): Promise<boolean> {
	if (Platform.OS !== "android") {
		// iOS doesn't have battery optimization settings
		return true;
	}

	try {
		// BatteryOptEnabled() returns true if optimization is ENABLED (bad for us)
		// We need to return true if optimization is DISABLED (good for us)
		// So we invert the result
		const isOptimized = await BatteryOptEnabled();
		const isIgnoring = !isOptimized; // If optimization is disabled, we're ignoring it (good)
		return isIgnoring;
	} catch (error) {
		// If check fails, assume it's not optimized (user needs to enable it)
		return false;
	}
}

export async function openBatterySettings() {
	if (Platform.OS !== "android") return;
	
	try {
		// Use the library's function to open battery optimization settings
		OpenOptimizationSettings();
	} catch (error) {
		// Fallback to app settings
		try {
			await Linking.openSettings();
		} catch (e) {
			// Silent fail
		}
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
	
	// Samsung specific intents for auto-start/battery optimization
	if (brand === "samsung") {
		const samsungIntents = [
			"package:com.samsung.android.lool", // Device Care / Battery optimization
			"package:com.samsung.android.sm", // Smart Manager
			"package:com.samsung.android.app.boostmanager", // Boost Manager
			"package:com.samsung.android.settings", // Samsung Settings
		];
		
		for (const url of samsungIntents) {
			try {
				const supported = await Linking.canOpenURL(url);
				if (supported) {
					console.log("Opening Samsung AutoStart using:", url);
					await Linking.openURL(url);
					return;
				}
			} catch (e) {
				console.warn(`[PermissionsAssistant] Failed to open Samsung intent ${url}:`, e);
			}
		}
		
		// Try direct settings intents
		try {
			await Linking.openURL("android.settings.APPLICATION_DETAILS_SETTINGS");
			return;
		} catch (e) {
			console.warn("[PermissionsAssistant] Failed to open application details:", e);
		}
	}
	
	console.log("Fallback: opening general app settings");
	try {
		await Linking.openSettings();
	} catch (e) {
		console.error("[PermissionsAssistant] Failed to open settings:", e);
	}
}