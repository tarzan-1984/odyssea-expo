import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isInitialized = false;
let soundObject: Audio.Sound | null = null;
let lastPlayAt = 0;
let loadPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
	if (isInitialized) return;
	try {
		if (__DEV__) console.log('[SoundManager] configuring audio mode...');
		await Audio.setAudioModeAsync({
			playsInSilentModeIOS: true,
			allowsRecordingIOS: false,
			staysActiveInBackground: false,
			shouldDuckAndroid: true,
			playThroughEarpieceAndroid: false,
		});
		if (__DEV__) console.log('[SoundManager] audio mode configured');
	} catch (e) {
		console.warn('[SoundManager] setAudioModeAsync failed, proceeding anyway:', e);
	}
	isInitialized = true;
}

async function areNotificationsEnabled(): Promise<boolean> {
	try {
		const settingsStr = await AsyncStorage.getItem('@odyssea_app_settings');
		if (settingsStr) {
			const settings = JSON.parse(settingsStr);
			return settings.notificationsEnabled !== false; // Default to true if not set
		}
		return true; // Default to enabled
	} catch {
		return true; // Default to enabled on error
	}
}

export async function playIncomingMessageSound(): Promise<void> {
	try {
		// Check if notifications are enabled in settings
		const enabled = await areNotificationsEnabled();
		if (!enabled) {
			if (__DEV__) console.log('[SoundManager] Notifications disabled in settings, skipping sound');
			return;
		}

		if (__DEV__) console.log('[SoundManager] playIncomingMessageSound() called');
		await ensureInitialized();
		if (__DEV__) console.log('[SoundManager] after ensureInitialized');

		// Throttle: avoid overlapping when many messages arrive at once
		const now = Date.now();
		if (now - lastPlayAt < 350) return;
		lastPlayAt = now;

		// Load once and reuse
		if (!soundObject) {
			if (!loadPromise) {
				loadPromise = (async () => {
					if (__DEV__) console.log('[SoundManager] creating sound...');
					const { sound } = await Audio.Sound.createAsync(
						require('../assets/sounds/livechat.wav'),
						{
							shouldPlay: false,
							isLooping: false,
							volume: 1.0,
						},
						undefined,
						false
					);
					if (__DEV__) console.log('[SoundManager] sound created');
					soundObject = sound;
				})();
			}
			await loadPromise.catch(() => {});
			loadPromise = null;
		}

		if (!soundObject) return;
		try { await soundObject.setPositionAsync(0); } catch (e) { if (__DEV__) console.warn('[SoundManager] setPositionAsync failed', e); }
		if (__DEV__) console.log('[SoundManager] playing...');
		await soundObject.playAsync();
		if (__DEV__) console.log('[SoundManager] playAsync resolved');
	} catch {
		// Fail silently to avoid breaking UX
	}
}

export async function unloadIncomingMessageSound(): Promise<void> {
	try {
		if (soundObject) {
			await soundObject.unloadAsync();
			soundObject = null;
		}
	} catch {}
}


