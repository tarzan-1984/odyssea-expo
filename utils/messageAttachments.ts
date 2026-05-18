/** Pipe-delimited multiple files (aligned indexes in fileUrl and fileName). */
export const MESSAGE_MULTI_FILE_SEPARATOR = '|';

export type ChatMessageAttachment = {
  fileUrl: string;
  fileName: string;
  fileSize?: number;
};

type MessageLike = {
  attachments?: unknown;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
};

/** 2+ attachments: legacy JSON array or pipe-separated fileUrl/fileName. */
export function getMessageMultiAttachments(message: MessageLike): ChatMessageAttachment[] | null {
  const raw = message.attachments;
  if (Array.isArray(raw) && raw.length >= 2) {
    const out: ChatMessageAttachment[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const fileUrl = typeof o.fileUrl === 'string' ? o.fileUrl : '';
      const fileName = typeof o.fileName === 'string' ? o.fileName : '';
      if (!fileUrl || !fileName) continue;
      const fileSize = typeof o.fileSize === 'number' ? o.fileSize : undefined;
      out.push({ fileUrl, fileName, fileSize });
    }
    if (out.length >= 2) return out;
  }

  const urlStr = message.fileUrl?.trim();
  const nameStr = message.fileName?.trim();
  if (!urlStr || !nameStr) return null;
  const urls = urlStr.split(MESSAGE_MULTI_FILE_SEPARATOR);
  const names = nameStr.split(MESSAGE_MULTI_FILE_SEPARATOR);
  if (urls.length < 2 || urls.length !== names.length) return null;

  const out: ChatMessageAttachment[] = [];
  for (let i = 0; i < urls.length; i++) {
    const fileUrl = urls[i]?.trim() ?? '';
    const fileName = names[i]?.trim() ?? '';
    if (!fileUrl || !fileName) continue;
    const fileSize = i === 0 && typeof message.fileSize === 'number' ? message.fileSize : undefined;
    out.push({ fileUrl, fileName, fileSize });
  }
  return out.length >= 2 ? out : null;
}
