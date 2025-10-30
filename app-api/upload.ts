type PresignResponse = {
  uploadUrl: string;
  fileUrl: string;
  key: string;
};

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


