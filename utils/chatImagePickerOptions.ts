import * as ImagePicker from 'expo-image-picker';

/**
 * Fast gallery/camera pick: `.current` returns quickly (HEIC kept on iOS).
 * HEIC → JPEG + resize happens in `chatImagePrepare` (parallel, non-blocking picker).
 */
export const CHAT_IMAGE_PICKER_FAST_OPTIONS: Pick<
	ImagePicker.ImagePickerOptions,
	'allowsEditing' | 'exif' | 'preferredAssetRepresentationMode'
> = {
	allowsEditing: false,
	exif: false,
	preferredAssetRepresentationMode:
		ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};
