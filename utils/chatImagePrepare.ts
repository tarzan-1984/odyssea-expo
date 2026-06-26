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

/**
 * Resize and/or transcode a gallery/camera image to JPEG before upload.
 * Requires ExpoImageManipulator in the native binary (rebuild dev client after adding the package).
 */
export async function prepareChatImageForUpload(
	input: ChatImagePrepareInput,
	index?: number,
): Promise<PreparedChatImageFile> {
	const containerFormat = await detectImageContainerFormat(input.uri);
	const originalFormat = resolveOriginalFormat({
		containerFormat,
		filename: input.name,
		mimeType: input.mimeType,
		originalName: input.originalName,
	});

	const resizeActions = buildResizeActions(input.width ?? 0, input.height ?? 0);
	const mustEncodeJpeg = needsJpegOutput({
		containerFormat,
		filename: input.name,
		mimeType: input.mimeType,
	});
	const effectiveResizeActions =
		resizeActions.length > 0
			? resizeActions
			: mustEncodeJpeg && !(input.width && input.height)
				? [{ resize: { width: CHAT_IMAGE_MAX_EDGE } }]
				: resizeActions;

	if (!mustEncodeJpeg && effectiveResizeActions.length === 0 && containerFormat === 'JPEG') {
		logImageFormatConversion({
			stage: 'Prepare',
			index,
			originalFormat,
			resultFormat: 'JPEG',
			where: 'unchanged',
			filename: input.name,
			originalFilename: input.originalName,
			sizeBytes: input.size,
		});
		return {
			...input,
			mimeType: normalizeUploadMimeType(input.name, input.mimeType ?? 'image/jpeg'),
		};
	}

	if (!mustEncodeJpeg && effectiveResizeActions.length === 0) {
		logImageFormatConversion({
			stage: 'Prepare',
			index,
			originalFormat,
			resultFormat: originalFormat,
			where: 'unchanged',
			filename: input.name,
			originalFilename: input.originalName,
			sizeBytes: input.size,
		});
		return {
			...input,
			mimeType: normalizeUploadMimeType(input.name, input.mimeType),
		};
	}

	const saveFormat = mustEncodeJpeg
		? ImageManipulator.SaveFormat.JPEG
		: containerFormat === 'PNG'
			? ImageManipulator.SaveFormat.PNG
			: ImageManipulator.SaveFormat.JPEG;

	const result = await ImageManipulator.manipulateAsync(input.uri, effectiveResizeActions, {
		compress: HEIC_JPEG_QUALITY,
		format: saveFormat,
	});

	const jpegName = mustEncodeJpeg ? toJpegFilename(input.name) : input.name;
	const fileSize = await getFileSize(result.uri, input.size ?? 0);
	const resultFormat: ImageFormatLabel =
		saveFormat === ImageManipulator.SaveFormat.JPEG ? 'JPEG' : 'PNG';

	logImageFormatConversion({
		stage: 'Prepare',
		index,
		originalFormat,
		resultFormat,
		where: 'device',
		filename: jpegName,
		originalFilename: input.originalName ?? input.name,
		sizeBytes: fileSize,
	});

	return {
		uri: result.uri,
		name: jpegName,
		mimeType:
			saveFormat === ImageManipulator.SaveFormat.JPEG
				? 'image/jpeg'
				: normalizeUploadMimeType(input.name, input.mimeType),
		size: fileSize,
		originalName:
			input.originalName ??
			(input.name !== jpegName ||
			/\.(heic|heif|dng)$/i.test(input.name)
				? input.name
				: undefined),
	};
}

/** Prepare multiple images in parallel (after fast gallery pick). */
export async function prepareChatImagesForUpload(
	inputs: ChatImagePrepareInput[],
	concurrency: number = CHAT_IMAGE_PREPARE_CONCURRENCY,
): Promise<PreparedChatImageFile[]> {
	if (inputs.length === 0) {
		return [];
	}
	return runWithConcurrency(inputs.length, concurrency, (index) =>
		prepareChatImageForUpload(inputs[index], index),
	);
}
