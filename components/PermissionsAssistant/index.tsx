import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Platform, Linking, ScrollView, AppState } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import DeviceInfo from "react-native-device-info";
import styles from "./styles";
import { openBatterySettings, openAutoStartSettings, checkBatteryOptimizationStatus } from "./utils";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocationPermission } from "@/hooks/useLocationPermission";

export default function PermissionsAssistant({ onComplete }: { onComplete: () => void }) {
	const insets = useSafeAreaInsets();
	const { openLocationSettings, openAppSettings, openAppLocationPermissionSettings } = useLocationPermission();
	const [locationAlways, setLocationAlways] = useState(false);
	const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(false);
	const [autoStartEnabled, setAutoStartEnabled] = useState(false);
	const [batterySettings, setOpenBatterySettings] = useState(false);
  const [isMiuiBrand, setIsMiuiBrand] = useState(false); // Xiaomi / Redmi / POCO
	const appState = useRef(AppState.currentState);
	
	const checkPermissions = useCallback(async () => {
		// Check location permissions - different logic for Android and iOS
		let hasLocationAlways = false;
		
		if (Platform.OS === "android") {
			// For Android: check both foreground and background permissions
			const fg = await Location.getForegroundPermissionsAsync();
			const bg = await Location.getBackgroundPermissionsAsync();
			hasLocationAlways = fg.granted && bg.granted;
		} else {
			// For iOS: check background permissions and scope
			const bg = await Location.getBackgroundPermissionsAsync();
			if (bg.ios?.scope === 'always') {
				hasLocationAlways = true;
			}
		}
		
		setLocationAlways(hasLocationAlways);
		
		// Check GPS enabled - only for Android
		if (Platform.OS === "android") {
			const providers = await Location.getProviderStatusAsync();
			const gpsAvailable = Boolean(providers.gpsAvailable);
			setGpsEnabled(gpsAvailable);
		} else {
			// For iOS, GPS is always considered enabled (handled by system)
			setGpsEnabled(true);
		}
		
		// Check notifications
		const notif = await Notifications.getPermissionsAsync();
		setNotificationsAllowed(notif.granted);
		
		// Check battery optimization status - only for Android
		if (Platform.OS === "android") {
			const batteryOptimized = await checkBatteryOptimizationStatus();
			setOpenBatterySettings(batteryOptimized);
		} else {
			// For iOS, battery optimization doesn't exist
			setOpenBatterySettings(true);
		}
	}, []);
	
	const requestLocation = async () => {
		try {
			// First check current permissions
			let hasLocationAlways = false;
			
			if (Platform.OS === "android") {
				const fg = await Location.getForegroundPermissionsAsync();
				const bg = await Location.getBackgroundPermissionsAsync();
				hasLocationAlways = fg.granted && bg.granted;
			} else {
				const bg = await Location.getBackgroundPermissionsAsync();
				if (bg.ios?.scope === 'always') {
					hasLocationAlways = true;
				}
			}
			
			// If already granted "Always", just re-check
			if (hasLocationAlways) {
				checkPermissions();
				return;
			}
			
			// Try to request permissions
			// First request foreground permission
			const fgResult = await Location.requestForegroundPermissionsAsync();
			
			if (!fgResult.granted) {
				// Foreground permission denied, open app location permission settings
				await openAppLocationPermissionSettings();
				return;
			}
			
			// Then request background permission
			const bgResult = await Location.requestBackgroundPermissionsAsync();
			
			// Check if background permission was granted
			if (Platform.OS === "android") {
				if (!bgResult.granted) {
					// Background permission not granted, open app location permission settings
					await openAppLocationPermissionSettings();
					return;
				}
			} else {
				// For iOS, check if scope is 'always'
				if (bgResult.ios?.scope !== 'always') {
					// User selected "While Using App" instead of "Always", open app location permission settings
					await openAppLocationPermissionSettings();
					return;
				}
			}
			
			// Permissions granted, re-check
			checkPermissions();
			setTimeout(() => {
				checkPermissions();
			}, 500);
		} catch (error) {
			console.error("[PermissionsAssistant] Failed to request location permissions:", error);
			// Fallback: open app location permission settings
			try {
				await openAppLocationPermissionSettings();
			} catch (fallbackError) {
				console.error("[PermissionsAssistant] Failed to open app location permission settings:", fallbackError);
			}
		}
	};
	
	const requestNotifications = async () => {
		await Notifications.requestPermissionsAsync();
		checkPermissions();
	};
	
	const gotoGpsSettings = async () => {
		try {
			// Use the hook's method which has better fallbacks for different devices
			await openLocationSettings();
			// After opening settings, check again when app returns to foreground
			// This is handled by the AppState listener below
		} catch (error) {
			console.error("[PermissionsAssistant] Failed to open GPS settings:", error);
			// Fallback to general settings
			try {
				await Linking.openSettings();
			} catch (fallbackError) {
				console.error("[PermissionsAssistant] Failed to open settings:", fallbackError);
			}
		}
	};
	
	const handleAutoStartPress = async () => {
		try {
			await openAutoStartSettings();
			// Don't automatically set to enabled - let user actually enable it in settings
			// We'll check again when app returns to foreground
		} catch (error) {
			console.error("[PermissionsAssistant] Failed to open autostart settings:", error);
			// Fallback to general app settings
			try {
				await Linking.openSettings();
			} catch (fallbackError) {
				console.error("[PermissionsAssistant] Failed to open settings:", fallbackError);
			}
		}
	};
	
	const handleBattery = async () => {
		try {
			await openBatterySettings();
			// Don't automatically set to enabled - let user actually enable it in settings
			// We'll check again when app returns to foreground
		} catch (error) {
			// Silent fail
		}
	};
	
	// Check permissions on mount
	useEffect(() => {
		checkPermissions();
	}, []);

  // Detect Xiaomi / Redmi / POCO brand on Android
  useEffect(() => {
    if (Platform.OS !== "android") return;
    try {
      const brand = DeviceInfo.getBrand();
      const b = brand?.toLowerCase?.() ?? "";
      if (b === "xiaomi" || b === "redmi" || b === "poco") {
        setIsMiuiBrand(true);
      }
    } catch {
      // Ignore detection errors; fallback is non-MIUI behavior
    }
  }, []);

	// Check permissions when app returns to foreground
	// This ensures we detect if user disabled location services while app was in background
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState) => {
			// When app transitions from background/inactive to active
			if (
				appState.current.match(/inactive|background/) &&
				nextAppState === 'active'
			) {
				// Wait a bit for system settings to apply (especially for battery settings on some devices)
				setTimeout(() => {
					checkPermissions();
				}, 1000);
			}
			appState.current = nextAppState;
		});

		return () => {
			subscription?.remove();
		};
	}, [checkPermissions]);
	
  const effectiveAutoStart = isMiuiBrand ? true : autoStartEnabled;

	// For iOS, only check location and notifications (GPS is always enabled on iOS)
	// For Android, check all settings including GPS, battery and autostart
	const allGranted = Platform.OS === "ios"
		? locationAlways && notificationsAllowed
		: locationAlways &&
		  notificationsAllowed &&
		  gpsEnabled &&
		  effectiveAutoStart &&
		  batterySettings;
	
	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Mandatory system settings</Text>
        
        {/* Location Always */}
        <TouchableOpacity
          style={[styles.block, locationAlways && styles.completeBlock]}
          onPress={requestLocation}
        >
          <Text style={styles.label}>Always allow location detection</Text>
          <Text style={styles.status}>
            {locationAlways ? "✓ Allowed" : "Click to allow"}
          </Text>
        </TouchableOpacity>
        
        {/* Notifications */}
        <TouchableOpacity
          style={[styles.block, notificationsAllowed && styles.completeBlock]}
          onPress={requestNotifications}
        >
          <Text style={styles.label}>Allow notifications</Text>
          <Text style={styles.status}>
            {notificationsAllowed ? "✓ Allowed" : "Click to allow"}
          </Text>
        </TouchableOpacity>
        
        {/* GPS Enabled - Only show for Android */}
        {Platform.OS === "android" && (
          <TouchableOpacity
            style={[styles.block, gpsEnabled && styles.completeBlock]}
            onPress={gotoGpsSettings}
          >
            <Text style={styles.label}>Turn on GPS</Text>
            <Text style={styles.status}>
              {gpsEnabled ? "✓ Enabled" : "Open Settings"}
            </Text>
          </TouchableOpacity>
        )}
        
        {/* Battery Optimization */}
        {Platform.OS === "android" && (
          <TouchableOpacity
            style={[styles.block, batterySettings && styles.completeBlock]}
            onPress={handleBattery}
          >
            <Text style={styles.label}>Remove battery limitation</Text>
            <Text style={styles.status}>Necessary for stable operation</Text>
          </TouchableOpacity>
        )}
        
        {/* Auto Start */}
        {Platform.OS === "android" && (
          <View>
            {/* For non‑Xiaomi/Redmi/POCO devices show interactive auto‑start option */}
            {!isMiuiBrand && (
              <TouchableOpacity
                style={[styles.block, autoStartEnabled && styles.completeBlock]}
                onPress={handleAutoStartPress}
              >
                <Text style={styles.label}>Allow background autostart (required for stable operation)</Text>
                <Text style={styles.status}>
                  {autoStartEnabled ? "✓ Marked as enabled" : "Click and enable autorun."}
                </Text>
              </TouchableOpacity>
            )}

            {/* Xiaomi / Redmi / POCO specific manual instructions only */}
            {isMiuiBrand && (
              <Text style={styles.hint}>
                📌 On Xiaomi / Redmi / POCO phones:{"\n"}
                Open → Settings → Applications → Autostart →{"\n"}
                Find the Odysseia app and enable it
              </Text>
            )}
          </View>
        )}
        
        <TouchableOpacity
          style={[styles.button, !allGranted && styles.buttonDisabled]}
          disabled={!allGranted}
          onPress={onComplete}
        >
          <Text style={styles.buttonText}>
            {allGranted ? "Continue" : "Complete all steps"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
		</View>
	);
}