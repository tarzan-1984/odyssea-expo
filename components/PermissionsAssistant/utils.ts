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
		console.log(`[checkBatteryOptimizationStatus] isOptimized: ${isOptimized}, isIgnoring: ${isIgnoring}`);
		return isIgnoring;
	} catch (error) {
		// If check fails, assume it's not optimized (user needs to enable it)
		console.warn(`[checkBatteryOptimizationStatus] Error checking status:`, error);
		// On some devices, if the check fails, it might mean optimization is not available
		// or the app is already optimized. Return false to show the option.
		return false;
	}
}

/**
 * Check if battery optimization settings are available on this device
 */
export async function isBatteryOptimizationAvailable(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}
	
	try {
		// Try to check if the battery optimization check function works
		// If it throws an error, the feature is likely not available
		await BatteryOptEnabled();
		return true;
	} catch (error) {
		// If check fails, battery optimization is likely not available on this device
		return false;
	}
}

/**
 * Check if autostart settings are available on this device
 * Tests actual availability by checking if any autostart intents can be opened
 */
export async function isAutoStartAvailable(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}
	
	try {
		const brand = (await DeviceInfo.getBrand()).toLowerCase();
		
		// Try all possible autostart intents for this brand
		const intentsToCheck: string[] = [];
		
		// Xiaomi / Redmi / POCO (MIUI) specific intents
		if (brand === "xiaomi" || brand === "redmi" || brand === "poco") {
			intentsToCheck.push(
				"miui.intent.action.OP_AUTO_START",
				"miui.intent.action.APP_PERM_EDITOR",
				"miui.intent.action.privacycenter",
				"package:com.miui.securitycenter",
				"package:com.miui.powerkeeper"
			);
		}
		
		// Samsung specific intents
		if (brand === "samsung") {
			intentsToCheck.push(
				"package:com.samsung.android.lool",
				"package:com.samsung.android.sm",
				"package:com.samsung.android.app.boostmanager",
				"package:com.samsung.android.settings"
			);
		}
		
		// Huawei specific intents
		if (brand === "huawei") {
			intentsToCheck.push("package:com.huawei.systemmanager");
		}
		
		// Generic Android intents (try for all devices)
		intentsToCheck.push("android.settings.APPLICATION_DETAILS_SETTINGS");
		
		// Check if any of the intents are available
		for (const url of intentsToCheck) {
			try {
				const supported = await Linking.canOpenURL(url);
				if (supported) {
					console.log(`[isAutoStartAvailable] Autostart available via: ${url}`);
					return true;
				}
			} catch (e) {
				// Continue checking other intents
			}
		}
		
		// If no intents are available, autostart is not available
		console.log(`[isAutoStartAvailable] Autostart not available on ${brand}`);
		return false;
	} catch (error) {
		// If detection fails, assume autostart is not available
		console.warn(`[isAutoStartAvailable] Error checking availability:`, error);
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