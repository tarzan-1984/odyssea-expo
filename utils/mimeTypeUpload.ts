const IOS_UTI_TO_MIME: Record<string, string> = {
	'public.jpeg': 'image/jpeg',
	'public.jpg': 'image/jpeg',
	'public.png': 'image/png',
	'public.gif': 'image/gif',
	'public.webp': 'image/webp',
	'public.heic': 'image/heic',
	'public.heif': 'image/heif',
	'public.avif': 'image/avif',
	'public.bmp': 'image/bmp',
	'public.tiff': 'image/tiff',
	'com.compuserve.gif': 'image/gif',
	'com.microsoft.bmp': 'image/bmp',
	'com.adobe.pdf': 'application/pdf',
	'public.pdf': 'application/pdf',
	'public.plain-text': 'text/plain',
	'public.text': 'text/plain',
	'public.utf8-plain-text': 'text/plain',
};

const EXTENSION_TO_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	jpe: 'image/jpeg',
	jfif: 'image/jpeg',
	pjpg: 'image/jpeg',
	pjpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
	hif: 'image/heif',
	avif: 'image/avif',
	bmp: 'image/bmp',
	tiff: 'image/tiff',
	tif: 'image/tiff',
	ico: 'image/x-icon',
	svg: 'image/svg+xml',
	dng: 'image/x-adobe-dng',
	raw: 'image/x-raw',
	cr2: 'image/x-canon-cr2',
	nef: 'image/x-nikon-nef',
	arw: 'image/x-sony-arw',
	pdf: 'application/pdf',
	txt: 'text/plain',
	text: 'text/plain',
	md: 'text/markdown',
	markdown: 'text/markdown',
	csv: 'text/csv',
	tsv: 'text/tab-separated-values',
	json: 'text/plain',
	xml: 'text/xml',
	html: 'text/html',
	htm: 'text/html',
	log: 'text/plain',
	rtf: 'text/rtf',
	yaml: 'text/yaml',
	yml: 'text/yaml',
	ini: 'text/plain',
	cfg: 'text/plain',
	conf: 'text/plain',
	sql: 'text/plain',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const IMAGE_EXTENSIONS = new Set(
	Object.entries(EXTENSION_TO_MIME)
		.filter(([, mime]) => mime.startsWith('image/'))
		.map(([ext]) => ext),
);

const TEXT_EXTENSIONS = new Set(
	Object.entries(EXTENSION_TO_MIME)
		.filter(([, mime]) => mime.startsWith('text/'))
		.map(([ext]) => ext),
);

function extensionFromFilename(filename: string): string {
	const base = filename.split('/').pop() || filename;
	const dot = base.lastIndexOf('.');
	if (dot <= 0 || dot === base.length - 1) {
		return '';
	}
	return base.slice(dot + 1).toLowerCase();
}

/**
 * Normalize MIME from iOS UTTypes, standard types, or file extension before presign/upload.
 */
export function normalizeUploadMimeType(
	filename: string,
	mimeType?: string,
): string {
	const raw = String(mimeType || '')
		.trim()
		.toLowerCase()
		.split(';')[0]
		.trim();

	if (raw) {
		if (IOS_UTI_TO_MIME[raw]) {
			return IOS_UTI_TO_MIME[raw];
		}
		if (raw.startsWith('image/') || raw.startsWith('text/')) {
			return raw;
		}
		if (EXTENSION_TO_MIME[raw.replace(/^\./, '')]) {
			return EXTENSION_TO_MIME[raw.replace(/^\./, '')];
		}
		if (
			raw === 'application/pdf' ||
			raw === 'application/msword' ||
			raw ===
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		) {
			return raw;
		}
	}

	const ext = extensionFromFilename(filename);
	if (ext && EXTENSION_TO_MIME[ext]) {
		return EXTENSION_TO_MIME[ext];
	}

	if (ext === 'pdf') {
		return 'application/pdf';
	}

	if (ext && IMAGE_EXTENSIONS.has(ext)) {
		return 'image/jpeg';
	}

	if (ext && TEXT_EXTENSIONS.has(ext)) {
		return 'text/plain';
	}

	return 'application/octet-stream';
}

export function formatUploadErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		const msg = error.message.trim();
		if (msg.includes('File type not allowed')) {
			return 'This file type is not supported.';
		}
		if (msg.includes('Selected file is missing')) {
			return 'Could not read the selected file. Try taking a new photo or re-selecting it.';
		}
		if (msg.includes('Failed to get presigned')) {
			return 'Server rejected the upload. Check your connection and try again.';
		}
		if (msg.includes('Upload failed')) {
			return 'Upload to storage failed. Check your internet connection and try again.';
		}
		if (msg.includes('Authentication required')) {
			return 'Please sign in again and retry.';
		}
		return msg;
	}
	return 'Failed to upload one or more files. Please try again.';
}
