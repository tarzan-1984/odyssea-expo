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

function isHeicFile(filename: string, mimeType?: string): boolean {
  const lowerName = filename.toLowerCase();
  const lowerType = String(mimeType || '').toLowerCase();
  return (
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif') ||
    lowerType === 'image/heic' ||
    lowerType === 'image/heif'
  );
}

function toJpegFilename(filename: string): string {
  if (/\.(heic|heif)$/i.test(filename)) {
    return filename.replace(/\.(heic|heif)$/i, '.jpg');
  }
  return `${filename.replace(/\.[^/.]+$/, '') || 'image'}.jpg`;
}

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

async function putBlobToStorage(params: {
  uploadUrl: string;
  blob: Blob;
  mimeType: string;
}): Promise<void> {
  const putRes = await fetch(params.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': params.mimeType || 'application/octet-stream' },
    body: params.blob,
  });
  if (!putRes.ok) {
    const et = await putRes.text().catch(() => '');
    throw new Error(`Upload failed: ${putRes.status} ${et}`);
  }
}

async function convertHeicFileToJpegBlob(params: {
  fileUri: string;
  filename: string;
  mimeType?: string;
  accessToken: string;
}): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', {
    uri: params.fileUri,
    name: params.filename,
    type: params.mimeType || 'image/heic',
  } as unknown as Blob);

  const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/v1/storage/convert-heic`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const t = await response.text().catch(() => '');
    throw new Error(`Failed to convert HEIC image: ${response.status} ${t}`);
  }

  return response.blob();
}

export async function uploadImageViaPresign(params: {
  fileUri: string;
  filename: string;
  mimeType: string;
  accessToken: string;
}): Promise<string> {
  const { fileUri, filename, mimeType, accessToken } = params;

  // 1) Ask backend for presigned URL
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
  
  const uploadUrl = data.data.uploadUrl;
  const fileUrl = data.data.fileUrl;
  
  // 2) Read file and PUT to storage
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType || 'application/octet-stream' },
    body: blob,
  });
  if (!putRes.ok) {
    const et = await putRes.text().catch(() => '');
    throw new Error(`Upload failed: ${putRes.status} ${et}`);
  }

  return fileUrl;
}

/**
 * Generic file upload via presigned URL (any mime type).
 * Returns the final public file URL.
 */
export async function uploadFileViaPresign(params: {
  fileUri: string;
  filename: string;
  mimeType?: string;
  accessToken: string;
}): Promise<string> {
  const { fileUri, filename, mimeType, accessToken } = params;

  const presignRes = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/v1/storage/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ filename, contentType: mimeType || 'application/octet-stream' }),
  });

  if (!presignRes.ok) {
    const t = await presignRes.text().catch(() => '');
    throw new Error(`Failed to get presigned URL: ${presignRes.status} ${t}`);
  }

  const data = await presignRes.json();
  const uploadUrl = data.data.uploadUrl as string;
  const fileUrl = data.data.fileUrl as string;

  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType || 'application/octet-stream' },
    body: blob,
  });
  if (!putRes.ok) {
    const et = await putRes.text().catch(() => '');
    throw new Error(`Upload failed: ${putRes.status} ${et}`);
  }

  return fileUrl;
}

export async function uploadChatFileViaPresign(params: {
  fileUri: string;
  filename: string;
  mimeType?: string;
  accessToken: string;
}): Promise<UploadedChatFile> {
  const shouldConvert = isHeicFile(params.filename, params.mimeType);
  const fileName = shouldConvert ? toJpegFilename(params.filename) : params.filename;
  const mimeType = shouldConvert ? 'image/jpeg' : params.mimeType || 'application/octet-stream';
  const blob = shouldConvert
    ? await convertHeicFileToJpegBlob(params)
    : await fetch(params.fileUri).then((response) => response.blob());

  const { uploadUrl, fileUrl } = await getPresignedUpload({
    filename: fileName,
    mimeType,
    accessToken: params.accessToken,
  });

  await putBlobToStorage({ uploadUrl, blob, mimeType });

  return {
    fileUrl,
    fileName,
    fileSize: blob.size || 0,
  };
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


