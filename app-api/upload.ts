import * as FileSystem from 'expo-file-system/legacy';
import { ensureHeicUploadMetadata } from '@/utils/heicUpload';
import { normalizeUploadMimeType } from '@/utils/mimeTypeUpload';

type PresignResponse = {
	uploadUrl: string;
	fileUrl: string;
	key: string;
};

export type UploadedChatFile = {
	fileUrl: string;
	fileName: string;
	fileSize: number;
};

type PreparedUploadFile = {
	fileUri: string;
	filename: string;
	mimeType: string;
	fileSize: number;
};

const DEFAULT_UPLOAD_CONCURRENCY = 3;

async function getPresignedUpload(params: {
	filename: string;
	mimeType: string;
	accessToken: string;
}): Promise<PresignResponse> {
	const { filename, mimeType, accessToken } = params;
	const presignRes = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/v1/storage/presign`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ filename, contentType: mimeType }),
	});

	if (!presignRes.ok) {
		const t = await presignRes.text().catch(() => '');
		throw new Error(`Failed to get presigned URL: ${presignRes.status} ${t}`);
	}

	const data = await presignRes.json();
	return data.data || data;
}

async function getPresignedUploadBatch(params: {
	files: { filename: string; mimeType: string }[];
	accessToken: string;
}): Promise<PresignResponse[]> {
	const { files, accessToken } = params;

	const presignRes = await fetch(
		`${process.env.EXPO_PUBLIC_API_BASE_URL}/v1/storage/presign-batch`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({
				files: files.map((f) => ({
					filename: f.filename,
					contentType: f.mimeType,
				})),
			}),
		},
	);

	// Fallback for older backend builds that only expose single presign.
	if (presignRes.status === 404 || presignRes.status === 405) {
		return Promise.all(
			files.map((f) =>
				getPresignedUpload({
					filename: f.filename,
					mimeType: f.mimeType,
					accessToken,
				}),
			),
		);
	}

	if (!presignRes.ok) {
		const t = await presignRes.text().catch(() => '');
		throw new Error(`Failed to get presigned URLs: ${presignRes.status} ${t}`);
	}

	const data = await presignRes.json();
	const items: PresignResponse[] = data.data || data;
	if (!Array.isArray(items) || items.length !== files.length) {
		throw new Error('Invalid presign batch response');
	}
	return items;
}

async function uploadLocalFileToPresignedUrl(params: {
	fileUri: string;
	uploadUrl: string;
	mimeType: string;
}): Promise<void> {
	const result = await FileSystem.uploadAsync(params.uploadUrl, params.fileUri, {
		httpMethod: 'PUT',
		uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
		headers: {
			'Content-Type': params.mimeType || 'application/octet-stream',
		},
	});

	if (result.status < 200 || result.status >= 300) {
		throw new Error(`Upload failed: ${result.status} ${result.body || ''}`.trim());
	}
}

async function prepareUploadFile(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
}): Promise<PreparedUploadFile> {
	const fileInfo = await FileSystem.getInfoAsync(params.fileUri);
	if (!fileInfo.exists) {
		throw new Error('Selected file is missing or could not be read');
	}

	const heicMeta = await ensureHeicUploadMetadata({
		fileUri: params.fileUri,
		filename: params.filename,
		mimeType: params.mimeType,
	});
	const mimeType = normalizeUploadMimeType(heicMeta.filename, heicMeta.mimeType);

	return {
		fileUri: params.fileUri,
		filename: heicMeta.filename,
		mimeType,
		fileSize: fileInfo.size || 0,
	};
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
			const i = nextIndex++;
			if (i >= count) return;
			results[i] = await fn(i);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, count) }, () => worker()),
	);
	return results;
}

/**
 * Upload multiple chat attachments: one presign-batch request, then parallel S3 PUTs.
 * Falls back to per-file presign if the batch endpoint is unavailable (older backend).
 */
export async function uploadChatFilesBatch(params: {
	files: { fileUri: string; filename: string; mimeType?: string }[];
	accessToken: string;
	concurrency?: number;
	onFileComplete?: (index: number, success: boolean) => void;
}): Promise<UploadedChatFile[]> {
	const { files, accessToken, onFileComplete } = params;
	if (files.length === 0) return [];

	const concurrency = params.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY;
	const prepared = await Promise.all(files.map((f) => prepareUploadFile(f)));

	const presigned = await getPresignedUploadBatch({
		files: prepared.map((f) => ({ filename: f.filename, mimeType: f.mimeType })),
		accessToken,
	});

	type UploadOutcome =
		| { ok: true; file: UploadedChatFile }
		| { ok: false; index: number; error: unknown };

	const outcomes = await runWithConcurrency<UploadOutcome>(
		prepared.length,
		concurrency,
		async (index) => {
			const file = prepared[index];
			const { uploadUrl, fileUrl } = presigned[index];
			try {
				await uploadLocalFileToPresignedUrl({
					fileUri: file.fileUri,
					uploadUrl,
					mimeType: file.mimeType,
				});
				onFileComplete?.(index, true);
				return {
					ok: true,
					file: {
						fileUrl,
						fileName: file.filename,
						fileSize: file.fileSize,
					},
				};
			} catch (error) {
				onFileComplete?.(index, false);
				return { ok: false, index, error };
			}
		},
	);

	const failed = outcomes.filter((o): o is Extract<UploadOutcome, { ok: false }> => !o.ok);
	if (failed.length > 0) {
		const firstError = failed[0].error;
		const message =
			firstError instanceof Error
				? firstError.message
				: `Failed to upload ${failed.length} file(s)`;
		throw new Error(message);
	}

	return outcomes.map((o) => (o as Extract<UploadOutcome, { ok: true }>).file);
}

/**
 * Upload a chat attachment via presigned URL.
 * HEIC/HEIF files are stored as-is; conversion happens on the server when viewing/downloading.
 */
export async function uploadChatFileViaPresign(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
	accessToken: string;
}): Promise<UploadedChatFile> {
	const [uploaded] = await uploadChatFilesBatch({
		files: [
			{
				fileUri: params.fileUri,
				filename: params.filename,
				mimeType: params.mimeType,
			},
		],
		accessToken: params.accessToken,
		concurrency: 1,
	});
	return uploaded;
}

export async function uploadImageViaPresign(params: {
	fileUri: string;
	filename: string;
	mimeType: string;
	accessToken: string;
}): Promise<string> {
	const uploaded = await uploadChatFileViaPresign({
		fileUri: params.fileUri,
		filename: params.filename,
		mimeType: params.mimeType,
		accessToken: params.accessToken,
	});
	return uploaded.fileUrl;
}

/**
 * Generic file upload via presigned URL (any mime type).
 */
export async function uploadFileViaPresign(params: {
	fileUri: string;
	filename: string;
	mimeType?: string;
	accessToken: string;
}): Promise<string> {
	const uploaded = await uploadChatFileViaPresign(params);
	return uploaded.fileUrl;
}

export async function updateUserAvatarOnBackend(params: {
	userId: string;
	avatarUrl: string;
	accessToken: string;
}): Promise<void> {
	const { userId, avatarUrl, accessToken } = params;

	const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/v1/users/${userId}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ profilePhoto: avatarUrl }),
	});
	if (!res.ok) {
		const t = await res.text().catch(() => '');
		throw new Error(`Failed to update avatar: ${res.status} ${t}`);
	}
}
