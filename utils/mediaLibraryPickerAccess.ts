import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/**
 * Android Photo Picker does not need READ_MEDIA_* permissions (blocked in app.json
 * for Google Play). Requesting them returns denied and blocks gallery selection.
 * iOS still needs media library permission for the picker.
 */
export async function ensureMediaLibraryAccessForPicker(): Promise<boolean> {
	if (Platform.OS === 'android') {
		return true;
	}

	const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
	return status === 'granted';
}
