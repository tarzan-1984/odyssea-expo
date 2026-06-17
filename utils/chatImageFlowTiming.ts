import { getMessageMultiAttachments } from '@/utils/messageAttachments';

const CHAT_IMAGE_CONVERT_LOG = '[ChatImageConvert]';
const MESSAGE_APPEAR_TIMEOUT_MS = 60_000;

export type ImagePickSource = 'gallery' | 'camera' | 'files';

type MessageLike = {
	id?: string;
	fileUrl?: string;
	fileName?: string;
	fileSize?: number;
	attachments?: unknown;
};

type ActiveImageFlow = {
	source: ImagePickSource;
	conversionDurationMs?: number;
	fileCount: number;
	fileNames: string[];
	heicConvertedCount?: number;
	sendStartedAt?: number;
	uploadCompletedAt?: number;
	wsSentAt?: number;
	expectedFileUrls?: string[];
	messageAppearTimeoutId?: ReturnType<typeof setTimeout>;
};

let activeFlow: ActiveImageFlow | null = null;

function logFlowTiming(message: string, details?: Record<string, unknown>): void {
	if (details) {
		console.log(CHAT_IMAGE_CONVERT_LOG, message, details);
		return;
	}
	console.log(CHAT_IMAGE_CONVERT_LOG, message);
}

function formatMs(ms: number): string {
	return `${(ms / 1000).toFixed(2)}s (${ms}ms)`;
}

function clearActiveFlow(): void {
	if (activeFlow?.messageAppearTimeoutId) {
		clearTimeout(activeFlow.messageAppearTimeoutId);
	}
	activeFlow = null;
}

function normalizeFileUrl(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) return '';
	try {
		return new URL(trimmed).pathname;
	} catch {
		return trimmed.split('?')[0] ?? trimmed;
	}
}

function getMessageFileUrls(message: MessageLike): string[] {
	const multi = getMessageMultiAttachments(message);
	if (multi?.length) {
		return multi.map((item) => item.fileUrl);
	}
	if (message.fileUrl?.trim()) {
		return [message.fileUrl.trim()];
	}
	return [];
}

function urlsMatchExpected(messageUrls: string[], expectedUrls: string[]): boolean {
	if (expectedUrls.length === 0 || messageUrls.length === 0) {
		return false;
	}
	if (expectedUrls.length !== messageUrls.length) {
		return false;
	}
	const normalizedMessage = messageUrls.map(normalizeFileUrl).sort();
	const normalizedExpected = expectedUrls.map(normalizeFileUrl).sort();
	return normalizedExpected.every((url, index) => url === normalizedMessage[index]);
}

/** Track attachment flow metadata (no timer — gallery browsing is excluded). */
export function beginImageAttachmentFlow(source: ImagePickSource): void {
	clearActiveFlow();
	activeFlow = {
		source,
		fileCount: 0,
		fileNames: [],
	};
}

export function cancelImageAttachmentFlow(reason: 'canceled' | 'empty' | 'error'): void {
	if (!activeFlow) return;
	logFlowTiming('Вложения не добавлены', {
		source: activeFlow.source,
		reason,
	});
	clearActiveFlow();
}

export function completeDevicePickerExportFlow(params: {
	fileCount: number;
	fileNames: string[];
	exportDurationMs: number;
	includesGallerySelection?: boolean;
}): void {
	if (!activeFlow) {
		activeFlow = {
			source: 'gallery',
			fileCount: params.fileCount,
			fileNames: params.fileNames,
		};
	}

	activeFlow.fileCount = params.fileCount;
	activeFlow.fileNames = params.fileNames;

	const message = params.includesGallerySelection
		? 'Выбор фото в галерее завершён (без конвертации в пикере)'
		: 'Камера: снимок получен';

	logFlowTiming(message, {
		source: activeFlow.source,
		fileCount: params.fileCount,
		fileNames: params.fileNames,
		pickerDurationMs: params.exportDurationMs,
		duration: formatMs(params.exportDurationMs),
		where: 'device-picker',
		includesGallerySelection: params.includesGallerySelection ?? false,
	});
}

export function completeDeviceImagePrepareFlow(params: {
	fileCount: number;
	fileNames: string[];
	prepareDurationMs: number;
	pickerDurationMs?: number;
	heicConvertedCount?: number;
}): void {
	if (!activeFlow) {
		activeFlow = {
			source: 'gallery',
			fileCount: params.fileCount,
			fileNames: params.fileNames,
		};
	}

	activeFlow.fileCount = params.fileCount;
	activeFlow.fileNames = params.fileNames;
	activeFlow.heicConvertedCount = params.heicConvertedCount;
	activeFlow.conversionDurationMs =
		(params.pickerDurationMs ?? 0) + params.prepareDurationMs;

	logFlowTiming('Подготовка фото завершена (resize + JPEG на устройстве)', {
		source: activeFlow.source,
		fileCount: params.fileCount,
		fileNames: params.fileNames,
		prepareDurationMs: params.prepareDurationMs,
		prepareDuration: formatMs(params.prepareDurationMs),
		pickerDurationMs: params.pickerDurationMs,
		pickerDuration:
			params.pickerDurationMs != null ? formatMs(params.pickerDurationMs) : undefined,
		totalPrepareMs: activeFlow.conversionDurationMs,
		totalPrepare:
			activeFlow.conversionDurationMs != null
				? formatMs(activeFlow.conversionDurationMs)
				: undefined,
		heicConvertedCount: params.heicConvertedCount,
		where: 'device',
	});
}

/** @deprecated Use completeDevicePickerExportFlow */
export function completeImageConversionFlow(params: {
	fileCount: number;
	fileNames: string[];
	durationMs: number;
	heicConvertedCount?: number;
}): void {
	completeDevicePickerExportFlow({
		fileCount: params.fileCount,
		fileNames: params.fileNames,
		exportDurationMs: params.durationMs,
	});
}

export function cancelImageConversionFlow(reason: 'error'): void {
	if (!activeFlow) return;
	logFlowTiming('Конвертация фото не удалась', {
		source: activeFlow.source,
		reason,
	});
	clearActiveFlow();
}

/** @deprecated Use beginImageAttachmentFlow */
export function beginImagePickFlow(source: ImagePickSource): void {
	beginImageAttachmentFlow(source);
}

/** @deprecated Use cancelImageAttachmentFlow */
export function cancelImagePickFlow(reason: 'canceled' | 'empty' | 'error'): void {
	cancelImageAttachmentFlow(reason);
}

/** @deprecated Use completeImageConversionFlow */
export function completeImagePickFlow(params: {
	fileCount: number;
	fileNames: string[];
}): void {
	completeImageConversionFlow({
		...params,
		durationMs: 0,
	});
}

export function beginImageSendFlow(): void {
	if (!activeFlow) {
		activeFlow = {
			source: 'files',
			fileCount: 0,
			fileNames: [],
		};
	}
	activeFlow.sendStartedAt = Date.now();
}

export function completeImageUploadFlow(fileCount: number): void {
	if (!activeFlow?.sendStartedAt) return;

	const uploadCompletedAt = Date.now();
	const durationMs = uploadCompletedAt - activeFlow.sendStartedAt;
	activeFlow.uploadCompletedAt = uploadCompletedAt;

	logFlowTiming('Загрузка файлов в облако завершена', {
		fileCount,
		durationMs,
		duration: formatMs(durationMs),
	});
}

export function markImageMessageWsSent(fileUrls: string[]): void {
	if (!activeFlow) return;

	activeFlow.wsSentAt = Date.now();
	activeFlow.expectedFileUrls = fileUrls;

	if (activeFlow.messageAppearTimeoutId) {
		clearTimeout(activeFlow.messageAppearTimeoutId);
	}

	activeFlow.messageAppearTimeoutId = setTimeout(() => {
		if (!activeFlow?.expectedFileUrls) return;
		const waitedMs = Date.now() - (activeFlow.wsSentAt ?? Date.now());
		logFlowTiming('Сообщение с фото не появилось в чате за отведённое время', {
			waitedMs,
			waited: formatMs(waitedMs),
			expectedFileCount: activeFlow.expectedFileUrls.length,
		});
		clearActiveFlow();
	}, MESSAGE_APPEAR_TIMEOUT_MS);
}

export function tryCompleteImageFlowOnMessage(
	message: MessageLike,
	options: { isFromCurrentUser: boolean },
): void {
	if (!activeFlow?.wsSentAt || !options.isFromCurrentUser) return;

	const expectedUrls = activeFlow.expectedFileUrls ?? [];
	if (expectedUrls.length === 0) return;

	const messageUrls = getMessageFileUrls(message);
	if (!urlsMatchExpected(messageUrls, expectedUrls)) return;

	const now = Date.now();
	const conversionDurationMs = activeFlow.conversionDurationMs;
	const uploadDurationMs =
		activeFlow.uploadCompletedAt && activeFlow.sendStartedAt
			? activeFlow.uploadCompletedAt - activeFlow.sendStartedAt
			: undefined;
	const sendToVisibleMs = activeFlow.sendStartedAt
		? now - activeFlow.sendStartedAt
		: now - activeFlow.wsSentAt;
	const wsToVisibleMs = now - activeFlow.wsSentAt;

	logFlowTiming('Сообщение с фото появилось в чате', {
		messageId: message.id,
		source: activeFlow.source,
		fileCount: activeFlow.fileCount,
		conversionDurationMs,
		conversionDuration:
			conversionDurationMs != null ? formatMs(conversionDurationMs) : undefined,
		uploadDurationMs,
		uploadDuration: uploadDurationMs != null ? formatMs(uploadDurationMs) : undefined,
		sendToVisibleMs,
		sendToVisible: formatMs(sendToVisibleMs),
		wsToVisibleMs,
		wsToVisible: formatMs(wsToVisibleMs),
	});

	clearActiveFlow();
}
