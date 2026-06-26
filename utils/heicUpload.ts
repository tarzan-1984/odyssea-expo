import * as FileSystem from 'expo-file-system/legacy';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { normalizeUploadMimeType } from '@/utils/mimeTypeUpload';

/** JPEG quality for chat HEIC → JPEG conversion (device prepare + server fallback). */
export const HEIC_JPEG_QUALITY = 0.5;

const CHAT_IMAGE_CONVERT_LOG = '[ChatImageConvert]';

function logChatImageConvert(message: string, details?: Record<string, unknown>): void {
	if (details) {
		console.log(CHAT_IMAGE_CONVERT_LOG, message, details);
		return;
	}
	console.log(CHAT_IMAGE_CONVERT_LOG, message);
}

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

export type ImageFormatLabel =
	| 'HEIC'
	| 'HEIF'
	| 'DNG'
	| 'JPEG'
	| 'PNG'
	| 'WEBP'
	| 'GIF'
	| 'OTHER'
	| 'UNKNOWN';

export type ImageConversionWhere = 'device-picker' | 'device' | 'server' | 'unchanged';

type HeicSourceFile = {
	fileUri: string;
	filename: string;
	mimeType?: string;
	/** Original name from gallery/camera before JPEG rename (e.g. IMG.heic). */
	originalFilename?: string;
};

export function inferFormatFromFilename(filename: string): ImageFormatLabel {
	const ext = filename.trim().toLowerCase().split('.').pop() ?? '';
	if (ext === 'heic') return 'HEIC';
	if (ext === 'heif' || ext === 'hif') return 'HEIF';
	if (ext === 'dng') return 'DNG';
	if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
	if (ext === 'png') return 'PNG';
	if (ext === 'webp') return 'WEBP';
	if (ext === 'gif') return 'GIF';
	return ext ? 'OTHER' : 'UNKNOWN';
}

export function inferFormatFromMime(mimeType?: string): ImageFormatLabel | null {
	const mime = String(mimeType || '').toLowerCase();
	if (!mime) return null;
	if (mime.includes('heic')) return 'HEIC';
	if (mime.includes('heif')) return 'HEIF';
	if (mime.includes('dng') || mime === 'image/x-adobe-dng') return 'DNG';
	if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPEG';
	if (mime === 'image/png') return 'PNG';
	if (mime === 'image/webp') return 'WEBP';
	if (mime === 'image/gif') return 'GIF';
	return null;
}

/** Detect on-disk container from file header (not filename/MIME). */
export async function detectImageContainerFormat(fileUri: string): Promise<ImageFormatLabel> {
	if (await detectHeicFromUri(fileUri)) {
		return 'HEIC';
	}
	try {
		const headerB64 = await FileSystem.readAsStringAsync(fileUri, {
			encoding: FileSystem.EncodingType.Base64,
			length: 16,
			position: 0,
		});
		const bytes = Uint8Array.from(atob(headerB64), (c) => c.charCodeAt(0));
		if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
			return 'JPEG';
		}
		if (
			bytes.length >= 4 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47
		) {
			return 'PNG';
		}
		if (
			bytes.length >= 4 &&
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46
		) {
			return 'WEBP';
		}
	} catch {
		// fall through
	}
	return 'UNKNOWN';
}

function resolveOriginalFormat(params: {
	filename: string;
	mimeType?: string;
	originalFilename?: string;
	containerFormat?: ImageFormatLabel;
}): ImageFormatLabel {
	if (params.originalFilename) {
		const fromOriginalName = inferFormatFromFilename(params.originalFilename);
		if (fromOriginalName === 'HEIC' || fromOriginalName === 'HEIF') {
			return fromOriginalName;
		}
	}
	const fromMime = inferFormatFromMime(params.mimeType);
	if (fromMime) return fromMime;
	if (params.containerFormat && params.containerFormat !== 'UNKNOWN') {
		return params.containerFormat;
	}
	return inferFormatFromFilename(params.filename);
}

export function logImageFormatConversion(params: {
	stage: string;
	index?: number;
	originalFormat: ImageFormatLabel;
	resultFormat: ImageFormatLabel;
	where: ImageConversionWhere;
	filename?: string;
	originalFilename?: string;
	sizeBytes?: number;
}): void {
	const whereLabel: Record<ImageConversionWhere, string> = {
		'device-picker': 'на устройстве (ImagePicker)',
		device: 'на устройстве (prepare)',
		server: 'на сервере',
		unchanged: 'без конвертации',
	};

	const conversion =
		params.originalFormat === params.resultFormat
			? String(params.resultFormat)
			: `${params.originalFormat} → ${params.resultFormat}`;

	console.log(
		CHAT_IMAGE_CONVERT_LOG,
		`[${params.stage}] ${conversion} | ${whereLabel[params.where]}`,
		{
			index: params.index,
			filename: params.filename,
			originalFilename: params.originalFilename,
			sizeBytes: params.sizeBytes,
		},
	);
}

export async function logPickerImageResult(params: {
	stage: 'Camera' | 'Gallery';
	index?: number;
	originalFilename: string;
	originalMimeType?: string;
	resultUri: string;
	resultFilename: string;
	resultMimeType?: string;
	sizeBytes?: number;
}): Promise<void> {
	const containerFormat = await detectImageContainerFormat(params.resultUri);
	const resultFormat =
		containerFormat !== 'UNKNOWN'
			? containerFormat
			: inferFormatFromMime(params.resultMimeType) ??
				inferFormatFromFilename(params.resultFilename);

	const originalFormat = resolveOriginalFormat({
		filename: params.resultFilename,
		mimeType: params.originalMimeType,
		originalFilename: params.originalFilename,
	});

	logImageFormatConversion({
		stage: params.stage,
		index: params.index,
		originalFormat,
		resultFormat,
		where:
			originalFormat === resultFormat
				? 'unchanged'
				: (originalFormat === 'HEIC' || originalFormat === 'HEIF') &&
						resultFormat === 'JPEG'
					? 'device'
					: 'device',
		filename: params.resultFilename,
		originalFilename:
			params.originalFilename !== params.resultFilename
				? params.originalFilename
				: undefined,
		sizeBytes: params.sizeBytes,
	});
}

type ServerBatchConvertItem = {
	index: number;
	fileName: string;
	mimeType: string;
	size: number;
	data: string;
};

/** Filename / MIME based DNG check. */
export function isDngFile(filename: string, mimeType?: string): boolean {
	const lowerName = filename.toLowerCase();
	const lowerType = String(mimeType || '').toLowerCase();
	return (
		lowerName.endsWith('.dng') ||
		lowerType === 'image/x-adobe-dng' ||
		lowerType.includes('dng')
	);
}

/** HEIC/HEIF/DNG and other raw formats that must become JPEG before chat upload or inline preview. */
export function needsDeviceJpegConversion(filename: string, mimeType?: string): boolean {
	return isHeicFile(filename, mimeType) || isDngFile(filename, mimeType);
}

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

export async function isHeicAttachment(params: HeicSourceFile): Promise<boolean> {
	const mime = String(params.mimeType || '').toLowerCase();
	if (mime === 'image/jpeg' || mime === 'image/jpg') {
		return false;
	}
	if (isHeicFile(params.filename, params.mimeType)) {
		return true;
	}
	return detectHeicFromUri(params.fileUri);
}

/** @deprecated Use isHeicAttachment — kept for older imports. */
export async function shouldConvertHeicToJpeg(params: HeicSourceFile): Promise<boolean> {
	return isHeicAttachment(params);
}

/** Ensure HEIC files keep a correct filename and MIME for direct cloud upload. */
export async function ensureHeicUploadMetadata(params: HeicSourceFile): Promise<{
	filename: string;
	mimeType: string;
}> {
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

export function toJpegFilename(filename: string): string {
	if (/\.(heic|heif|dng)$/i.test(filename)) {
		return filename.replace(/\.(heic|heif|dng)$/i, '.jpg');
	}
	return `${filename.replace(/\.[^/.]+$/, '') || 'image'}.jpg`;
}

function toHeicUploadName(filename: string): string {
	if (/\.(heic|heif)$/i.test(filename)) {
		return filename;
	}
	if (filename.includes('.')) {
		return filename.replace(/\.[^.]+$/, '.heic');
	}
	return `${filename}.heic`;
}

function ensureFileUri(uri: string): string {
	return uri.startsWith('file://') ? uri : `file://${uri}`;
}

async function getFileSize(fileUri: string, fallback = 0): Promise<number> {
	const info = await FileSystem.getInfoAsync(fileUri);
	if (info.exists && 'size' in info && typeof info.size === 'number') {
		return info.size;
	}
	return fallback;
}

async function buildPreparedFile(params: {
	fileUri: string;
	filename: string;
	mimeType: string;
	fallbackSize?: number;
}): Promise<PreparedHeicUploadFile> {
	return {
		fileUri: ensureFileUri(params.fileUri),
		filename: params.filename,
		mimeType: params.mimeType,
		fileSize: await getFileSize(params.fileUri, params.fallbackSize ?? 0),
	};
}

/**
 * Prepare one attachment for upload. HEIC/HEIF uses server conversion (fallback for DocumentPicker etc.).
 * Gallery/camera images are transcoded to JPEG in `chatImagePrepare` before upload.
 * Server batch remains fallback for DocumentPicker HEIC files.
 */
export async function convertHeicAttachmentForUpload(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
	originalFilename?: string;
	accessToken: string;
}): Promise<PreparedHeicUploadFile> {
	const fileInfo = await FileSystem.getInfoAsync(params.fileUri);
	if (!fileInfo.exists) {
		throw new Error('Selected file is missing or could not be read');
	}

	const isHeic = await isHeicAttachment(params);
	if (!isHeic) {
		const mimeType = normalizeUploadMimeType(params.filename, params.mimeType);
		const containerFormat = await detectImageContainerFormat(params.fileUri);
		const originalFormat = resolveOriginalFormat({
			filename: params.filename,
			mimeType: params.mimeType,
			originalFilename: params.originalFilename,
			containerFormat,
		});
		const resultFormat =
			containerFormat !== 'UNKNOWN'
				? containerFormat
				: inferFormatFromMime(mimeType) ?? inferFormatFromFilename(params.filename);

		logImageFormatConversion({
			stage: 'Upload',
			originalFormat,
			resultFormat,
			where:
				(originalFormat === 'HEIC' || originalFormat === 'HEIF') && resultFormat === 'JPEG'
					? 'device'
					: originalFormat === resultFormat
						? 'unchanged'
						: 'device',
			filename: params.filename,
			originalFilename: params.originalFilename,
			sizeBytes: fileInfo.size || 0,
		});

		return {
			fileUri: ensureFileUri(params.fileUri),
			filename: params.filename,
			mimeType,
			fileSize: fileInfo.size || 0,
		};
	}

	const originalFormat = resolveOriginalFormat({
		filename: params.filename,
		mimeType: params.mimeType,
		originalFilename: params.originalFilename,
	});

	const converted = await convertHeicOnServerSingle({
		fileUri: params.fileUri,
		filename: params.filename,
		accessToken: params.accessToken,
	});

	logImageFormatConversion({
		stage: 'Upload',
		originalFormat: originalFormat === 'UNKNOWN' ? 'HEIC' : originalFormat,
		resultFormat: 'JPEG',
		where: 'server',
		filename: converted.filename,
		originalFilename: params.originalFilename,
		sizeBytes: converted.fileSize,
	});

	return converted;
}

/**
 * Prepare multiple attachments. Any remaining HEIC files are converted in one server batch request.
 */
export async function prepareHeicAttachmentsForUpload(params: {
	files: HeicSourceFile[];
	accessToken: string;
	logStage?: string;
}): Promise<PreparedHeicUploadFile[]> {
	const logStage = params.logStage ?? 'Upload';
	const prepared: PreparedHeicUploadFile[] = new Array(params.files.length);
	const serverFallback: {
		index: number;
		fileUri: string;
		filename: string;
		originalFilename?: string;
		originalFormat: ImageFormatLabel;
	}[] = [];

	logChatImageConvert(`Preparing ${params.files.length} attachment(s) for ${logStage.toLowerCase()}`);

	await Promise.all(
		params.files.map(async (file, index) => {
			const fileInfo = await FileSystem.getInfoAsync(file.fileUri);
			if (!fileInfo.exists) {
				throw new Error('Selected file is missing or could not be read');
			}

			const containerFormat = await detectImageContainerFormat(file.fileUri);
			const originalFormat = resolveOriginalFormat({
				filename: file.filename,
				mimeType: file.mimeType,
				originalFilename: file.originalFilename,
				containerFormat,
			});

			const isHeic = await isHeicAttachment(file);
			if (!isHeic) {
				const mimeType = normalizeUploadMimeType(file.filename, file.mimeType);
				const resultFormat =
					containerFormat !== 'UNKNOWN'
						? containerFormat
						: inferFormatFromMime(mimeType) ?? inferFormatFromFilename(file.filename);

				prepared[index] = {
					fileUri: ensureFileUri(file.fileUri),
					filename: file.filename,
					mimeType,
					fileSize: fileInfo.size || 0,
				};

				const convertedOnDevice =
					(originalFormat === 'HEIC' || originalFormat === 'HEIF') &&
					resultFormat === 'JPEG';

				logImageFormatConversion({
					stage: logStage,
					index,
					originalFormat,
					resultFormat,
					where: convertedOnDevice
						? 'device'
						: originalFormat === resultFormat
							? 'unchanged'
							: 'device',
					filename: file.filename,
					originalFilename: file.originalFilename,
					sizeBytes: fileInfo.size ?? 0,
				});
				return;
			}

			serverFallback.push({
				index,
				fileUri: file.fileUri,
				filename: file.filename,
				originalFilename: file.originalFilename,
				originalFormat,
			});
		}),
	);

	if (serverFallback.length > 0) {
		const converted = await convertHeicBatchOnServer({
			files: serverFallback,
			accessToken: params.accessToken,
		});
		for (const entry of serverFallback) {
			const result = converted.get(entry.index);
			if (!result) {
				throw new Error(`Server failed to convert HEIC image at index ${entry.index}`);
			}
			prepared[entry.index] = result;
			logImageFormatConversion({
				stage: logStage,
				index: entry.index,
				originalFormat: entry.originalFormat,
				resultFormat: 'JPEG',
				where: 'server',
				filename: result.filename,
				originalFilename: entry.originalFilename,
				sizeBytes: result.fileSize,
			});
		}
	}

	return prepared;
}

async function writeBase64JpegToCache(base64: string, index: number): Promise<string> {
	const dest = `${FileSystem.cacheDirectory}heic-batch-${Date.now()}-${index}.jpg`;
	await FileSystem.writeAsStringAsync(dest, base64, {
		encoding: FileSystem.EncodingType.Base64,
	});
	return ensureFileUri(dest);
}

function getApiBaseUrl(): string {
	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	if (!base) {
		throw new Error('API base URL is not configured');
	}
	return base;
}

/** Server fallback: convert one HEIC file via POST /convert-heic. */
async function convertHeicOnServerSingle(params: {
	fileUri: string;
	filename: string;
	accessToken: string;
}): Promise<PreparedHeicUploadFile> {
	const uploadName = toHeicUploadName(params.filename);
	const base = getApiBaseUrl();

	logChatImageConvert('Server conversion started (single)', {
		filename: params.filename,
		endpoint: '/v1/storage/convert-heic',
	});

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

	const jpegUri = ensureFileUri(response.path());
	const jpegFilename = toJpegFilename(params.filename);

	return buildPreparedFile({
		fileUri: jpegUri,
		filename: jpegFilename,
		mimeType: 'image/jpeg',
	});
}

/** Server fallback: convert multiple HEIC files in one POST /convert-heic-batch request. */
async function convertHeicBatchOnServer(params: {
	files: { index: number; fileUri: string; filename: string }[];
	accessToken: string;
}): Promise<Map<number, PreparedHeicUploadFile>> {
	if (params.files.length === 0) {
		return new Map();
	}

	const base = getApiBaseUrl();
	const formParts = params.files.map((file) => ({
		name: 'files',
		filename: toHeicUploadName(file.filename),
		type: 'image/heic',
		data: ReactNativeBlobUtil.wrap(file.fileUri),
	}));

	logChatImageConvert('Calling server batch endpoint', {
		endpoint: '/v1/storage/convert-heic-batch',
		count: params.files.length,
		filenames: params.files.map((f) => f.filename),
	});

	const response = await ReactNativeBlobUtil.fetch(
		'POST',
		`${base}/v1/storage/convert-heic-batch`,
		{
			Authorization: `Bearer ${params.accessToken}`,
			'Content-Type': 'multipart/form-data',
		},
		formParts,
	).catch((error: unknown) => {
		throw new Error(
			error instanceof Error ? error.message : 'Failed to convert HEIC images',
		);
	});

	const status = response.info().status;
	if (status === 404 || status === 405) {
		logChatImageConvert('Batch endpoint unavailable — falling back to single requests', {
			status,
		});
		const results = new Map<number, PreparedHeicUploadFile>();
		for (const file of params.files) {
			const converted = await convertHeicOnServerSingle({
				fileUri: file.fileUri,
				filename: file.filename,
				accessToken: params.accessToken,
			});
			results.set(file.index, converted);
		}
		return results;
	}

	if (status < 200 || status >= 300) {
		throw new Error(`Failed to convert HEIC images (${status})`);
	}

	const payload = JSON.parse(response.data) as {
		data?: { items?: ServerBatchConvertItem[] };
		items?: ServerBatchConvertItem[];
	};
	const items = payload.data?.items ?? payload.items;
	if (!Array.isArray(items) || items.length !== params.files.length) {
		throw new Error('Invalid convert-heic-batch response');
	}

	const results = new Map<number, PreparedHeicUploadFile>();
	for (const item of items) {
		const source = params.files.find((f) => f.index === item.index);
		const jpegUri = await writeBase64JpegToCache(item.data, item.index);
		const prepared = await buildPreparedFile({
			fileUri: jpegUri,
			filename: item.fileName || toJpegFilename(source?.filename ?? 'image.heic'),
			mimeType: 'image/jpeg',
			fallbackSize: item.size,
		});
		results.set(item.index, prepared);
	}

	return results;
}

export function getHeicConvertApiUrl(fileUrl: string): string {
	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	return `${base}/v1/storage/convert-heic?url=${encodeURIComponent(fileUrl)}`;
}
