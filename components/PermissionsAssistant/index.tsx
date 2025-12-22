import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Platform, Linking, ScrollView, AppState } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import DeviceInfo from "react-native-device-info";
import styles from "./styles";
import { 
	openBatterySettings, 
	openAutoStartSettings, 
	checkBatteryOptimizationStatus,
	isBatteryOptimizationAvailable,
	isAutoStartAvailable,
	requiresAutostartWarning
} from "./utils";
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
	const [batteryAvailable, setBatteryAvailable] = useState(false);
	const [autoStartAvailable, setAutoStartAvailable] = useState(false);
	const [requiresAutostartWarningState, setRequiresAutostartWarningState] = useState(false);
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
			// For iOS: check both foreground and background permissions with scope
			const fg = await Location.getForegroundPermissionsAsync();
			const bg = await Location.getBackgroundPermissionsAsync();
			
			// On iOS, need both: status === 'granted' AND scope === 'always'
			// The scope is directly on bg object, not in bg.ios.scope
			// Also check 'granted' property as fallback
			const fgGranted = fg.status === 'granted' || fg.granted;
			const bgGranted = bg.status === 'granted' || bg.granted;
			// Check scope directly on bg object (not ios.scope) - this is the correct way for iOS
			const iosScopeAlways = (bg as any).scope === 'always';
			
			hasLocationAlways = fgGranted && bgGranted && iosScopeAlways;
		}
		
		setLocationAlways(hasLocationAlways);
		
		// Check GPS enabled - for both Android and iOS
		if (Platform.OS === "android") {
			const providers = await Location.getProviderStatusAsync();
			const gpsAvailable = Boolean(providers.gpsAvailable);
			setGpsEnabled(gpsAvailable);
		} else {
			// For iOS, check if Location Services are enabled globally
			const providers = await Location.getProviderStatusAsync();
			const locationServicesEnabled = Boolean(providers.locationServicesEnabled);
			setGpsEnabled(locationServicesEnabled);
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
			// For iOS: check both foreground and background permissions with scope
			const fg = await Location.getForegroundPermissionsAsync();
			const bg = await Location.getBackgroundPermissionsAsync();
			
			// On iOS, need both: status === 'granted' AND scope === 'always'
			// The scope is directly on bg object, not in bg.ios.scope
			// Also check 'granted' property as fallback
			const fgGranted = fg.status === 'granted' || fg.granted;
			const bgGranted = bg.status === 'granted' || bg.granted;
			// Check scope directly on bg object (not ios.scope) - this is the correct way for iOS
			const iosScopeAlways = (bg as any).scope === 'always';
			
			hasLocationAlways = fgGranted && bgGranted && iosScopeAlways;
		}
			
			// Always open app location permission settings when button is clicked
			// This allows user to change settings even if already granted
			await openAppLocationPermissionSettings();
			
			// Permissions will be re-checked when app returns to foreground
			// (handled by AppState listener in useEffect)
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
			// The check will happen in the AppState listener below
		} catch (error) {
			console.error("[PermissionsAssistant] Failed to open battery settings:", error);
		}
	};
	
	// Check permissions and availability on mount
	useEffect(() => {
		const checkAvailability = async () => {
			if (Platform.OS === "android") {
				const batteryAvail = await isBatteryOptimizationAvailable();
				const autoStartAvail = await isAutoStartAvailable();
				const needsWarning = await requiresAutostartWarning();
				setBatteryAvailable(batteryAvail);
				setAutoStartAvailable(autoStartAvail);
				setRequiresAutostartWarningState(needsWarning);
			}
		};
		checkAvailability();
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
			// Wait a bit for system settings to apply
			// iOS usually updates permission status quickly, so reduced delay
			// For Android battery settings, may need more time
			const delay = Platform.OS === 'ios' ? 300 : 1500;
			setTimeout(() => {
				console.log("[PermissionsAssistant] App returned to foreground, rechecking permissions...");
				checkPermissions();
			}, delay);
			}
			appState.current = nextAppState;
		});

		return () => {
			subscription?.remove();
		};
	}, [checkPermissions]);
	
  const effectiveAutoStart = isMiuiBrand ? true : autoStartEnabled;

	// For iOS, check location, notifications, and GPS (Location Services)
	// For Android, check all settings including GPS, battery and autostart
	// Only require battery and autostart if they are available on this device
	const allGranted = Platform.OS === "ios"
		? locationAlways && notificationsAllowed && gpsEnabled
		: locationAlways &&
		  notificationsAllowed &&
		  gpsEnabled &&
		  (batteryAvailable ? batterySettings : true) && // If unavailable, consider it granted
		  (autoStartAvailable ? effectiveAutoStart : true); // If unavailable, consider it granted
	
	return (
		<View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Mandatory system settings</Text>
        
        {/* Autostart Warning - Show for specific brands */}
        {Platform.OS === "android" && requiresAutostartWarningState && (
          <View style={styles.autostartWarning}>
            <Text style={styles.autostartWarningText}>
              For the app to work properly, you must enable autostart in background mode in settings
            </Text>
          </View>
        )}
        
        {/* GPS Enabled - Show for both Android and iOS (First in list) */}
        <TouchableOpacity
          style={[styles.block, gpsEnabled && styles.completeBlock]}
          onPress={gotoGpsSettings}
        >
          <Text style={styles.label}>Turn on GPS</Text>
          <Text style={styles.status}>
            {gpsEnabled ? "✓ Enabled" : "Open Settings"}
          </Text>
        </TouchableOpacity>
        
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
        
        {/* Battery Optimization - Only show if available on this device */}
        {Platform.OS === "android" && batteryAvailable && (
          <TouchableOpacity
            style={[styles.block, batterySettings && styles.completeBlock]}
            onPress={handleBattery}
          >
            <Text style={styles.label}>Remove battery limitation</Text>
            <Text style={styles.status}>Necessary for stable operation</Text>
          </TouchableOpacity>
        )}
        
        {/* Auto Start - Only show if available on this device */}
        {Platform.OS === "android" && autoStartAvailable && (
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