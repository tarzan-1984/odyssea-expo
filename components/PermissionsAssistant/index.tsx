import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Platform, Linking, ScrollView } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import DeviceInfo from "react-native-device-info";
import styles from "./styles";
import { openBatterySettings, openAutoStartSettings } from "./utils";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PermissionsAssistant({ onComplete }: { onComplete: () => void }) {
	const insets = useSafeAreaInsets();
	const [locationAlways, setLocationAlways] = useState(false);
	const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(false);
	const [autoStartEnabled, setAutoStartEnabled] = useState(false);
	const [batterySettings, setOpenBatterySettings] = useState(false);
  const [isMiuiBrand, setIsMiuiBrand] = useState(false); // Xiaomi / Redmi / POCO
	
	const checkPermissions = async () => {
		const loc = await Location.getForegroundPermissionsAsync();
		const locAlways = await Location.getBackgroundPermissionsAsync();
		setLocationAlways(loc.granted && locAlways.granted);
		
		const notif = await Notifications.getPermissionsAsync();
		setNotificationsAllowed(notif.granted);
		
    if (Platform.OS === "android") {
      const providers = await Location.getProviderStatusAsync();
      setGpsEnabled(Boolean(providers.gpsAvailable));
    } else {
      setGpsEnabled(true);
    }
	};
	
	const requestLocation = async () => {
		await Location.requestForegroundPermissionsAsync();
		await Location.requestBackgroundPermissionsAsync();
		checkPermissions();
	};
	
	const requestNotifications = async () => {
		await Notifications.requestPermissionsAsync();
		checkPermissions();
	};
	
	const gotoGpsSettings = () => {
		if (Platform.OS === "android") {
			Linking.openURL("android.settings.LOCATION_SOURCE_SETTINGS");
		} else {
			Linking.openSettings();
		}
	};
	
	const handleAutoStartPress = async () => {
		await openAutoStartSettings();
		setAutoStartEnabled(true);
	};
	
	const handleBattery = async () => {
		await openBatterySettings();
		setOpenBatterySettings(true);
	};
	
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
	
  const effectiveAutoStart = isMiuiBrand ? true : autoStartEnabled;

	const allGranted =
    locationAlways &&
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
        
        {/* GPS Enabled */}
        {!gpsEnabled && (
          <TouchableOpacity style={styles.block} onPress={gotoGpsSettings}>
            <Text style={styles.label}>Turn on GPS</Text>
            <Text style={styles.status}>Open Settings</Text>
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