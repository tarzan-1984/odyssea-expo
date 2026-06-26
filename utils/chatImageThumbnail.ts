import { secureStorage } from '@/utils/secureStorage';

export const CHAT_IMAGE_PREVIEW_MAX_WIDTH = 400;
export const CHAT_IMAGE_PREVIEW_QUALITY = 50;

const THUMBNAIL_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'webp',
	'bmp',
	'tiff',
	'heic',
	'heif',
	'gif',
	'dng',
]);

export function isChatImageThumbnailCandidate(fileName: string): boolean {
	const ext = fileName.toLowerCase().split('.').pop();
	return Boolean(ext && THUMBNAIL_EXTENSIONS.has(ext));
}

export function buildChatImageThumbnailUrl(
	fileUrl: string,
	maxWidth: number = CHAT_IMAGE_PREVIEW_MAX_WIDTH,
	quality: number = CHAT_IMAGE_PREVIEW_QUALITY,
): string | null {
	if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) {
		return null;
	}

	try {
		const parsed = new URL(fileUrl);
		const marker = '/files/';
		const filesIdx = parsed.pathname.indexOf(marker);
		if (filesIdx === -1) {
			return null;
		}

		const afterFiles = parsed.pathname.slice(filesIdx + marker.length);
		if (!afterFiles || afterFiles.startsWith('thumbs/')) {
			return fileUrl;
		}

		const withoutExt = afterFiles.replace(/\.[^./\\]+$/, '');
		const prefix = parsed.pathname.slice(0, filesIdx + marker.length);
		const thumbPath = `${prefix}thumbs/${withoutExt}_w${maxWidth}_q${quality}.jpg`;
		return `${parsed.origin}${thumbPath}`;
	} catch {
		return null;
	}
}

export function getChatImageThumbnailUrl(
	fileUrl: string,
	fileName: string,
): string | null {
	if (!fileUrl || !isChatImageThumbnailCandidate(fileName)) {
		return null;
	}
	return buildChatImageThumbnailUrl(fileUrl);
}

export function isStoredChatImageThumbnailUrl(url: string): boolean {
	return url.includes('/files/thumbs/') && /_w\d+_q\d+\.jpg(?:\?|$)/i.test(url);
}

export function isChatImageThumbnailUrl(url: string): boolean {
	return isStoredChatImageThumbnailUrl(url);
}

/** Formats that cannot render inline on device and need a server JPEG preview. */
export function needsServerImagePreview(fileName: string): boolean {
	const ext = fileName.toLowerCase().split('.').pop();
	return ext === 'heic' || ext === 'heif' || ext === 'dng';
}

export function getServerImagePreviewUrl(
	fileUrl: string,
	fileName: string,
	options?: { maxWidth?: number; quality?: number },
): string {
	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	if (!base) {
		throw new Error('API base URL is not configured');
	}

	const ext = fileName.toLowerCase().split('.').pop();
	if (ext === 'heic' || ext === 'heif') {
		return `${base}/v1/storage/convert-heic?url=${encodeURIComponent(fileUrl)}`;
	}

	const params = new URLSearchParams({ url: fileUrl });
	params.set('w', String(options?.maxWidth ?? CHAT_IMAGE_PREVIEW_MAX_WIDTH));
	params.set('q', String(options?.quality ?? CHAT_IMAGE_PREVIEW_QUALITY));
	return `${base}/v1/storage/image-preview?${params.toString()}`;
}

export async function ensureChatImageThumbnail(
	fileUrl: string,
	fileName: string,
): Promise<string> {
	const base = process.env.EXPO_PUBLIC_API_BASE_URL;
	if (!base) {
		throw new Error('API base URL is not configured');
	}

	const accessToken = await secureStorage.getItemAsync('accessToken');
	if (!accessToken) {
		throw new Error('No access token available');
	}

	const params = new URLSearchParams({
		url: fileUrl,
		fileName,
		w: String(CHAT_IMAGE_PREVIEW_MAX_WIDTH),
		q: String(CHAT_IMAGE_PREVIEW_QUALITY),
	});

	const response = await fetch(`${base}/v1/storage/ensure-thumbnail?${params.toString()}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.message || errorData.error || 'Failed to ensure thumbnail');
	}

	const raw = await response.json();
	const data = (raw?.data ?? raw) as { thumbnailUrl?: string };
	if (!data.thumbnailUrl) {
		throw new Error('Thumbnail URL missing in response');
	}

	return data.thumbnailUrl;
}

/** Fire-and-forget thumbnail generation after upload or when scrolling into view. */
export function prefetchChatImageThumbnail(fileUrl: string, fileName: string): void {
	if (!fileUrl || !isChatImageThumbnailCandidate(fileName)) {
		return;
	}
	void ensureChatImageThumbnail(fileUrl, fileName).catch(() => {});
}
