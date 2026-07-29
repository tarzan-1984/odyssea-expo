import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { normalizeUploadMimeType } from '@/utils/mimeTypeUpload';
import {
	detectImageContainerFormat,
	HEIC_JPEG_QUALITY,
	inferFormatFromFilename,
	inferFormatFromMime,
	needsDeviceJpegConversion,
	logImageFormatConversion,
	toJpegFilename,
	type ImageFormatLabel,
} from '@/utils/heicUpload';

/** Max long edge for chat photos (smaller = faster encode + upload; still sharp on mobile). */
export const CHAT_IMAGE_MAX_EDGE = 1920;

/** Parallel device prepare jobs (resize / HEIC → JPEG). */
export const CHAT_IMAGE_PREPARE_CONCURRENCY = 4;

/** Samsung / Android 16: manipulateAsync can hang forever on some content:// URIs. */
const MANIPULATE_TIMEOUT_MS = 25_000;

export type ChatImagePrepareInput = {
	uri: string;
	name: string;
	mimeType?: string;
	size?: number;
	originalName?: string;
	width?: number;
	height?: number;
};

export type PreparedChatImageFile = ChatImagePrepareInput;

type ResizeAction = ImageManipulator.Action;

async function getFileSize(fileUri: string, fallback = 0): Promise<number> {
	const info = await FileSystem.getInfoAsync(fileUri);
	if (info.exists && 'size' in info && typeof info.size === 'number') {
		return info.size;
	}
	return fallback;
}

function uriScheme(uri: string): string {
	const idx = uri.indexOf(':');
	return idx > 0 ? uri.slice(0, idx) : 'unknown';
}

function extensionForCopy(name: string, mimeType?: string): string {
	const fromName = name.split('.').pop()?.toLowerCase();
	if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) {
		return fromName;
	}
	if (mimeType?.includes('png')) return 'png';
	if (mimeType?.includes('heic') || mimeType?.includes('heif')) return 'heic';
	if (mimeType?.includes('webp')) return 'webp';
	return 'jpg';
}

/**
 * Copy content:// (and similar) picker URIs into app cache so ImageManipulator
 * and upload can reliably open the file on Android 15/16 / Samsung.
 */
export async function ensureLocalFileUri(
	input: ChatImagePrepareInput,
	index = 0,
): Promise<ChatImagePrepareInput> {
	const scheme = uriScheme(input.uri);
	if (scheme === 'file' || input.uri.startsWith(FileSystem.cacheDirectory ?? 'file://')) {
		return input;
	}

	const cacheRoot = FileSystem.cacheDirectory;
	if (!cacheRoot) {
		return input;
	}

	const ext = extensionForCopy(input.name, input.mimeType);
	const dest = `${cacheRoot}chat-pick-${Date.now()}-${index}.${ext}`;

	try {
		await FileSystem.copyAsync({ from: input.uri, to: dest });
		const size = await getFileSize(dest, input.size ?? 0);
		console.log('[ChatImagePrepare] copied picker URI to cache', {
			fromScheme: scheme,
			destPreview: dest.slice(0, 120),
			size,
		});
		return {
			...input,
			uri: dest,
			size: size || input.size,
		};
	} catch (error) {
		console.warn('[ChatImagePrepare] Failed to copy picker URI to cache:', {
			scheme,
			error: error instanceof Error ? error.message : String(error),
		});
		return input;
	}
}

function buildResizeActions(width: number, height: number): ResizeAction[] {
	if (width <= 0 || height <= 0) {
		return [];
	}
	if (width <= CHAT_IMAGE_MAX_EDGE && height <= CHAT_IMAGE_MAX_EDGE) {
		return [];
	}
	if (width >= height) {
		return [{ resize: { width: CHAT_IMAGE_MAX_EDGE } }];
	}
	return [{ resize: { height: CHAT_IMAGE_MAX_EDGE } }];
}

function resolveOriginalFormat(params: {
	containerFormat: ImageFormatLabel;
	filename: string;
	mimeType?: string;
	originalName?: string;
}): ImageFormatLabel {
	if (params.originalName) {
		const fromOriginal = inferFormatFromFilename(params.originalName);
		if (fromOriginal === 'HEIC' || fromOriginal === 'HEIF' || fromOriginal === 'DNG') {
			return fromOriginal;
		}
	}
	if (params.containerFormat !== 'UNKNOWN') {
		return params.containerFormat;
	}
	return inferFormatFromMime(params.mimeType) ?? inferFormatFromFilename(params.filename);
}

function needsJpegOutput(params: {
	containerFormat: ImageFormatLabel;
	filename: string;
	mimeType?: string;
}): boolean {
	if (
		params.containerFormat === 'HEIC' ||
		params.containerFormat === 'HEIF' ||
		params.containerFormat === 'DNG'
	) {
		return true;
	}
	return needsDeviceJpegConversion(params.filename, params.mimeType);
}

async function runWithConcurrency<T>(
	count: number,
	concurrency: number,
	fn: (index: number) => Promise<T>,
): Promise<T[]> {
	const results: T[] = new Array(count);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (true) {
			const index = nextIndex++;
			if (index >= count) {
				return;
			}
			results[index] = await fn(index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, count) }, () => worker()),
	);
	return results;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`${label} timed out after ${ms}ms`));
		}, ms);
		promise
			.then((value) => {
				clearTimeout(timer);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timer);
				reject(error);
			});
	});
}

/**
 * Resize and/or transcode a gallery/camera image to JPEG before upload.
 * Requires ExpoImageManipulator in the native binary (rebuild dev client after adding the package).
 */
export async function prepareChatImageForUpload(
	input: ChatImagePrepareInput,
	index?: number,
): Promise<PreparedChatImageFile> {
	const localized = await ensureLocalFileUri(input, index ?? 0);

	const containerFormat = await detectImageContainerFormat(localized.uri);
	const originalFormat = resolveOriginalFormat({
		containerFormat,
		filename: localized.name,
		mimeType: localized.mimeType,
		originalName: localized.originalName,
	});

	const resizeActions = buildResizeActions(localized.width ?? 0, localized.height ?? 0);
	const mustEncodeJpeg = needsJpegOutput({
		containerFormat,
		filename: localized.name,
		mimeType: localized.mimeType,
	});
	const effectiveResizeActions =
		resizeActions.length > 0
			? resizeActions
			: mustEncodeJpeg && !(localized.width && localized.height)
				? [{ resize: { width: CHAT_IMAGE_MAX_EDGE } }]
				: resizeActions;

	if (!mustEncodeJpeg && effectiveResizeActions.length === 0 && containerFormat === 'JPEG') {
		logImageFormatConversion({
			stage: 'Prepare',
			index,
			originalFormat,
			resultFormat: 'JPEG',
			where: 'unchanged',
			filename: localized.name,
			originalFilename: localized.originalName,
			sizeBytes: localized.size,
		});
		return {
			...localized,
			mimeType: normalizeUploadMimeType(localized.name, localized.mimeType ?? 'image/jpeg'),
		};
	}

	if (!mustEncodeJpeg && effectiveResizeActions.length === 0) {
		logImageFormatConversion({
			stage: 'Prepare',
			index,
			originalFormat,
			resultFormat: originalFormat,
			where: 'unchanged',
			filename: localized.name,
			originalFilename: localized.originalName,
			sizeBytes: localized.size,
		});
		return {
			...localized,
			mimeType: normalizeUploadMimeType(localized.name, localized.mimeType),
		};
	}

	const saveFormat = mustEncodeJpeg
		? ImageManipulator.SaveFormat.JPEG
		: containerFormat === 'PNG'
			? ImageManipulator.SaveFormat.PNG
			: ImageManipulator.SaveFormat.JPEG;

	const scheme = uriScheme(localized.uri);

	let result: ImageManipulator.ImageResult;
	try {
		result = await withTimeout(
			ImageManipulator.manipulateAsync(localized.uri, effectiveResizeActions, {
				compress: HEIC_JPEG_QUALITY,
				format: saveFormat,
			}),
			MANIPULATE_TIMEOUT_MS,
			'manipulateAsync',
		);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`manipulateAsync failed (${originalFormat}, scheme=${scheme}, mime=${localized.mimeType ?? 'n/a'}): ${reason}`,
		);
	}

	const jpegName = mustEncodeJpeg ? toJpegFilename(localized.name) : localized.name;
	const fileSize = await getFileSize(result.uri, localized.size ?? 0);
	const resultFormat: ImageFormatLabel =
		saveFormat === ImageManipulator.SaveFormat.JPEG ? 'JPEG' : 'PNG';

	logImageFormatConversion({
		stage: 'Prepare',
		index,
		originalFormat,
		resultFormat,
		where: 'device',
		filename: jpegName,
		originalFilename: localized.originalName ?? localized.name,
		sizeBytes: fileSize,
	});

	return {
		uri: result.uri,
		name: jpegName,
		mimeType:
			saveFormat === ImageManipulator.SaveFormat.JPEG
				? 'image/jpeg'
				: normalizeUploadMimeType(localized.name, localized.mimeType),
		size: fileSize,
		originalName:
			localized.originalName ??
			(localized.name !== jpegName ||
			/\.(heic|heif|dng)$/i.test(localized.name)
				? localized.name
				: undefined),
		width: localized.width,
		height: localized.height,
	};
}

/**
 * Prepare one image; on failure return a local copy of the original so the
 * composer still shows a preview (upload may use server convert fallback).
 */
export async function prepareChatImageForUploadOrFallback(
	input: ChatImagePrepareInput,
	index?: number,
): Promise<{ file: PreparedChatImageFile; usedFallback: boolean; error?: string }> {
	try {
		const file = await prepareChatImageForUpload(input, index);
		return { file, usedFallback: false };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		const localized = await ensureLocalFileUri(input, index ?? 0);
		console.warn('[ChatImagePrepare] prepare failed, using local original:', reason);
		return {
			file: {
				...localized,
				mimeType: normalizeUploadMimeType(localized.name, localized.mimeType),
			},
			usedFallback: true,
			error: reason,
		};
	}
}

/** Prepare multiple images in parallel (after fast gallery pick). */
export async function prepareChatImagesForUpload(
	inputs: ChatImagePrepareInput[],
	concurrency: number = CHAT_IMAGE_PREPARE_CONCURRENCY,
): Promise<PreparedChatImageFile[]> {
	if (inputs.length === 0) {
		return [];
	}
	const results = await runWithConcurrency(inputs.length, concurrency, (index) =>
		prepareChatImageForUploadOrFallback(inputs[index], index),
	);

	const fallbacks = results.filter((r) => r.usedFallback);
	if (fallbacks.length > 0) {
		console.warn(
			`[ChatImagePrepare] ${fallbacks.length}/${results.length} image(s) used prepare fallback`,
		);
	}

	return results.map((r) => r.file);
}

/** Same as prepareChatImagesForUpload but also returns per-file fallback errors. */
export async function prepareChatImagesForUploadWithMeta(
	inputs: ChatImagePrepareInput[],
	concurrency: number = CHAT_IMAGE_PREPARE_CONCURRENCY,
): Promise<{
	files: PreparedChatImageFile[];
	fallbacks: { index: number; error: string }[];
}> {
	if (inputs.length === 0) {
		return { files: [], fallbacks: [] };
	}
	const results = await runWithConcurrency(inputs.length, concurrency, (index) =>
		prepareChatImageForUploadOrFallback(inputs[index], index),
	);
	return {
		files: results.map((r) => r.file),
		fallbacks: results
			.map((r, index) =>
				r.usedFallback && r.error ? { index, error: r.error } : null,
			)
			.filter((row): row is { index: number; error: string } => row != null),
	};
}
