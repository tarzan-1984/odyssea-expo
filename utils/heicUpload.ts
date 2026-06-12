import * as FileSystem from 'expo-file-system/legacy';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { normalizeUploadMimeType } from '@/utils/mimeTypeUpload';

const HEIC_FTYP_BRANDS = new Set([
	'heic',
	'heix',
	'hevc',
	'hevx',
	'heim',
	'heis',
	'heif',
	'mif1',
	'msf1',
]);

/** Filename / MIME based HEIC check. */
export function isHeicFile(filename: string, mimeType?: string): boolean {
	const lowerName = filename.toLowerCase();
	const lowerType = String(mimeType || '').toLowerCase();
	return (
		lowerName.endsWith('.heic') ||
		lowerName.endsWith('.heif') ||
		lowerType === 'image/heic' ||
		lowerType === 'image/heif' ||
		lowerType === 'image/heif-sequence' ||
		lowerType === 'public.heic' ||
		lowerType === 'public.heif' ||
		lowerType.includes('heic') ||
		lowerType.includes('heif')
	);
}

/** Read ISO BMFF `ftyp` brand from file header (iOS often lies about MIME). */
export async function detectHeicFromUri(fileUri: string): Promise<boolean> {
	try {
		const headerB64 = await FileSystem.readAsStringAsync(fileUri, {
			encoding: FileSystem.EncodingType.Base64,
			length: 24,
			position: 0,
		});
		const binary = atob(headerB64);
		if (binary.length < 12) {
			return false;
		}
		const ftyp = binary.slice(4, 8);
		if (ftyp !== 'ftyp') {
			return false;
		}
		const majorBrand = binary.slice(8, 12);
		if (HEIC_FTYP_BRANDS.has(majorBrand)) {
			return true;
		}
		// Compatible brands may follow at offset 16
		if (binary.length >= 20) {
			const compat = binary.slice(16, 20);
			if (HEIC_FTYP_BRANDS.has(compat)) {
				return true;
			}
		}
		return false;
	} catch {
		return false;
	}
}

export async function isHeicAttachment(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
}): Promise<boolean> {
	if (isHeicFile(params.filename, params.mimeType)) {
		return true;
	}
	return detectHeicFromUri(params.fileUri);
}

/** @deprecated Use isHeicAttachment — kept for older imports. */
export async function shouldConvertHeicToJpeg(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
}): Promise<boolean> {
	return isHeicAttachment(params);
}

/** Ensure HEIC files keep a correct filename and MIME for direct cloud upload. */
export async function ensureHeicUploadMetadata(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
}): Promise<{ filename: string; mimeType: string }> {
	const isHeic = await isHeicAttachment(params);
	if (!isHeic) {
		return {
			filename: params.filename,
			mimeType: normalizeUploadMimeType(params.filename, params.mimeType),
		};
	}

	const filename = /\.(heic|heif)$/i.test(params.filename)
		? params.filename
		: params.filename.includes('.')
			? params.filename.replace(/\.[^.]+$/, '.heic')
			: `${params.filename}.heic`;

	return {
		filename,
		mimeType: 'image/heic',
	};
}

export type PreparedHeicUploadFile = {
	fileUri: string;
	filename: string;
	mimeType: string;
	fileSize: number;
};

/**
 * Convert HEIC/HEIF to JPEG via backend before uploading to object storage.
 * Non-HEIC files are returned unchanged.
 */
export async function convertHeicAttachmentForUpload(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
	accessToken: string;
}): Promise<PreparedHeicUploadFile> {
	const fileInfo = await FileSystem.getInfoAsync(params.fileUri);
	if (!fileInfo.exists) {
		throw new Error('Selected file is missing or could not be read');
	}

	const isHeic = await isHeicAttachment(params);
	if (!isHeic) {
		return {
			fileUri: params.fileUri,
			filename: params.filename,
			mimeType: normalizeUploadMimeType(params.filename, params.mimeType),
			fileSize: fileInfo.size || 0,
		};
	}

	const uploadName = /\.(heic|heif)$/i.test(params.filename)
		? params.filename
		: params.filename.includes('.')
			? params.filename.replace(/\.[^.]+$/, '.heic')
			: `${params.filename}.heic`;

	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	if (!base) {
		throw new Error('API base URL is not configured');
	}

	const response = await ReactNativeBlobUtil.config({
		fileCache: true,
		appendExt: 'jpg',
	})
		.fetch(
			'POST',
			`${base}/v1/storage/convert-heic`,
			{
				Authorization: `Bearer ${params.accessToken}`,
				'Content-Type': 'multipart/form-data',
			},
			[
				{
					name: 'file',
					filename: uploadName,
					type: 'image/heic',
					data: ReactNativeBlobUtil.wrap(params.fileUri),
				},
			],
		)
		.catch((error: unknown) => {
			throw new Error(
				error instanceof Error ? error.message : 'Failed to convert HEIC image',
			);
		});

	const status = response.info().status;
	if (status < 200 || status >= 300) {
		throw new Error(`Failed to convert HEIC image (${status})`);
	}

	const jpegUri = response.path();
	const jpegInfo = await FileSystem.getInfoAsync(jpegUri);
	const jpegFilename = toJpegFilename(params.filename);

	return {
		fileUri: jpegUri.startsWith('file://') ? jpegUri : `file://${jpegUri}`,
		filename: jpegFilename,
		mimeType: 'image/jpeg',
		fileSize: jpegInfo.exists && 'size' in jpegInfo ? jpegInfo.size : fileInfo.size || 0,
	};
}

export function getHeicConvertApiUrl(fileUrl: string): string {
	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	return `${base}/v1/storage/convert-heic?url=${encodeURIComponent(fileUrl)}`;
}

export function toJpegFilename(filename: string): string {
	if (/\.(heic|heif)$/i.test(filename)) {
		return filename.replace(/\.(heic|heif)$/i, '.jpg');
	}
	return `${filename.replace(/\.[^/.]+$/, '') || 'image'}.jpg`;
}
