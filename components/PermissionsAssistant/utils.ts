import { Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import DeviceInfo from "react-native-device-info";
import { BatteryOptEnabled, OpenOptimizationSettings } from "react-native-battery-optimization-check";

const BATTERY_UNRESTRICTED_CONFIRMED_KEY = "@odyssea_battery_unrestricted_confirmed";

/** Android 14+ / OEM "App battery usage" often does not update PowerManager whitelist APIs. */
export async function isAndroidBatteryCheckUnreliable(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}
	if (typeof Platform.Version === "number" && Platform.Version >= 34) {
		return true;
	}
	try {
		const brand = (await DeviceInfo.getBrand()).toLowerCase();
		return brand === "motorola";
	} catch {
		return false;
	}
}

export async function markBatterySettingsManuallyConfirmed(): Promise<void> {
	await AsyncStorage.setItem(BATTERY_UNRESTRICTED_CONFIRMED_KEY, "true");
}

export async function clearBatterySettingsManualConfirmation(): Promise<void> {
	await AsyncStorage.removeItem(BATTERY_UNRESTRICTED_CONFIRMED_KEY);
}

async function isBatterySettingsManuallyConfirmed(): Promise<boolean> {
	const value = await AsyncStorage.getItem(BATTERY_UNRESTRICTED_CONFIRMED_KEY);
	return value === "true";
}

/** Raw PowerManager check — true when app is on the ignore-battery-optimizations whitelist. */
export async function isPowerManagerIgnoringBatteryOptimizations(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return true;
	}

	try {
		const isOptimized = await BatteryOptEnabled();
		return !isOptimized;
	} catch (error) {
		console.warn(`[isPowerManagerIgnoringBatteryOptimizations] Error:`, error);
		return false;
	}
}

export async function checkBatteryOptimizationStatus(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return true;
	}

	if (await isPowerManagerIgnoringBatteryOptimizations()) {
		return true;
	}

	if (await isBatterySettingsManuallyConfirmed()) {
		return true;
	}

	return false;
}

/**
 * After the user opened battery settings on devices where PowerManager is unreliable,
 * treat the step as complete when they return to the app.
 */
export async function confirmBatterySettingsAfterSettingsVisit(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}

	if (await isPowerManagerIgnoringBatteryOptimizations()) {
		await clearBatterySettingsManualConfirmation();
		return true;
	}

	if (!(await isAndroidBatteryCheckUnreliable())) {
		return false;
	}

	await markBatterySettingsManuallyConfirmed();
	return true;
}

/**
 * Check if battery optimization settings are available on this device
 */
export async function isBatteryOptimizationAvailable(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}

	try {
		await BatteryOptEnabled();
		return true;
	} catch {
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

		const intentsToCheck: string[] = [];

		if (brand === "xiaomi" || brand === "redmi" || brand === "poco") {
			intentsToCheck.push(
				"miui.intent.action.OP_AUTO_START",
				"miui.intent.action.APP_PERM_EDITOR",
				"miui.intent.action.privacycenter",
				"package:com.miui.securitycenter",
				"package:com.miui.powerkeeper",
			);
		}

		if (brand === "samsung") {
			intentsToCheck.push(
				"package:com.samsung.android.lool",
				"package:com.samsung.android.sm",
				"package:com.samsung.android.app.boostmanager",
				"package:com.samsung.android.settings",
			);
		}

		if (brand === "huawei") {
			intentsToCheck.push("package:com.huawei.systemmanager");
		}

		intentsToCheck.push("android.settings.APPLICATION_DETAILS_SETTINGS");

		for (const url of intentsToCheck) {
			try {
				const supported = await Linking.canOpenURL(url);
				if (supported) {
					console.log(`[isAutoStartAvailable] Autostart available via: ${url}`);
					return true;
				}
			} catch {
				// Continue checking other intents
			}
		}

		console.log(`[isAutoStartAvailable] Autostart not available on ${brand}`);
		return false;
	} catch (error) {
		console.warn(`[isAutoStartAvailable] Error checking availability:`, error);
		return false;
	}
}

export async function requiresAutostartWarning(): Promise<boolean> {
	if (Platform.OS !== "android") {
		return false;
	}

	try {
		const brand = (await DeviceInfo.getBrand()).toLowerCase();
		const brandsRequiringWarning = [
			"xiaomi",
			"redmi",
			"poco",
			"huawei",
			"oppo",
			"vivo",
			"realme",
			"honor",
		];
		return brandsRequiringWarning.includes(brand);
	} catch (error) {
		console.warn(`[requiresAutostartWarning] Error checking brand:`, error);
		return false;
	}
}

async function openIntentWithPackage(action: string): Promise<boolean> {
	const packageName = Application.applicationId;
	if (!packageName) {
		return false;
	}
	try {
		await IntentLauncher.startActivityAsync(action, {
			data: `package:${packageName}`,
		});
		return true;
	} catch (error) {
		console.warn(`[openBatterySettings] Failed intent ${action}:`, error);
		return false;
	}
}

export async function openBatterySettings() {
	if (Platform.OS !== "android") return;

	// Per-app battery screen (Motorola / Android 14+ "App battery usage", "Always allow")
	if (typeof Platform.Version === "number" && Platform.Version >= 31) {
		if (await openIntentWithPackage("android.settings.APP_BATTERY_SETTINGS")) {
			return;
		}
	}

	// System dialog to whitelist app from Doze / classic battery optimization list
	if (
		await openIntentWithPackage(
			IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
		)
	) {
		return;
	}

	if (
		await openIntentWithPackage(
			IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
		)
	) {
		return;
	}

	try {
		OpenOptimizationSettings();
	} catch {
		try {
			await Linking.openSettings();
		} catch {
			// Silent fail
		}
	}
}

export async function openAutoStartSettings() {
	if (Platform.OS !== "android") return;

	const brand = (await DeviceInfo.getBrand()).toLowerCase();

	console.log("Device brand:", brand);

	if (brand === "xiaomi" || brand === "redmi" || brand === "poco") {
		const intents = [
			"miui.intent.action.OP_AUTO_START",
			"miui.intent.action.APP_PERM_EDITOR",
			"miui.intent.action.privacycenter",
			"package:com.miui.securitycenter",
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

	if (brand === "huawei") {
		try {
			return Linking.openURL("package:com.huawei.systemmanager");
		} catch {}
	}

	if (brand === "samsung") {
		const samsungIntents = [
			"package:com.samsung.android.lool",
			"package:com.samsung.android.sm",
			"package:com.samsung.android.app.boostmanager",
			"package:com.samsung.android.settings",
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
