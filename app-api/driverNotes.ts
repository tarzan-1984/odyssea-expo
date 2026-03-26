/**
 * TMS driver notices — same contract as Next.js /api/users/drivers/notes (TMS proxy).
 */

const DEFAULT_NOTES_URL =
  'https://www.endurance-tms.com/wp-json/tms/v1/driver/notes';
const DEFAULT_NOTICE_URL =
  'https://www.endurance-tms.com/wp-json/tms/v1/driver/notice';

export interface DriverNotice {
  id?: string | number;
  name?: string;
  date?: string;
  message?: string;
  [key: string]: unknown;
}

export interface DriverNotesPagePayload {
  notices?: DriverNotice[];
  total?: number;
  total_pages?: number;
  current_page?: number;
  page?: number;
  per_page?: number;
  data?: { notes?: DriverNotice[] } | DriverNotice[];
  [key: string]: unknown;
}

function getNotesUrl(): string {
  return (
    process.env.EXPO_PUBLIC_TMS_DRIVER_NOTES_URL?.trim() || DEFAULT_NOTES_URL
  );
}

function getNoticeUrl(): string {
  return (
    process.env.EXPO_PUBLIC_TMS_DRIVER_NOTICE_URL?.trim() || DEFAULT_NOTICE_URL
  );
}

function getTmsApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_TMS_API_KEY?.trim() || 'tms_api_key_2024_driver_access'
  );
}

export function extractNoticesFromResponse(payload: unknown): DriverNotice[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as DriverNotesPagePayload;
  const d = p.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object' && Array.isArray(d.notes)) return d.notes;
  if (Array.isArray(p.notices)) return p.notices;
  return [];
}

export function getNotesPagination(payload: unknown): {
  totalPages: number;
  currentPage: number;
  count: number;
} {
  if (!payload || typeof payload !== 'object') {
    return { totalPages: 0, currentPage: 1, count: 0 };
  }
  const p = payload as Record<string, unknown>;
  const d =
    p.data && typeof p.data === 'object' && !Array.isArray(p.data)
      ? (p.data as Record<string, unknown>)
      : undefined;
  const totalPages = Number(p.total_pages ?? d?.total_pages ?? 0) || 0;
  const currentPage =
    Number(p.current_page ?? p.page ?? d?.page ?? d?.current_page ?? 1) || 1;
  const arr = extractNoticesFromResponse(payload);
  return { totalPages, currentPage, count: arr.length };
}

export async function getDriverNotes(params: {
  driverId: string;
  perPage?: number;
  page?: number;
}): Promise<DriverNotesPagePayload> {
  const { driverId, perPage = 20, page = 1 } = params;
  const url = `${getNotesUrl()}?driver_id=${encodeURIComponent(driverId)}&per_page=${encodeURIComponent(
    String(perPage)
  )}&page=${encodeURIComponent(String(page))}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getTmsApiKey(),
    },
  });
  const data = (await res.json().catch(() => ({}))) as DriverNotesPagePayload & {
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Failed to load driver notes'
    );
  }
  return data;
}

export async function postDriverNotice(params: {
  driverId: string;
  userId: string;
  message: string;
}): Promise<void> {
  const { driverId, userId, message } = params;
  const res = await fetch(getNoticeUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': getTmsApiKey(),
    },
    body: JSON.stringify({
      driver_id: Number(driverId),
      id_user: Number(userId),
      message: message.trim(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    const msg = data.error ?? data.message ?? 'Failed to add notice';
    throw new Error(typeof msg === 'string' ? msg : 'Failed to add notice');
  }
}

/** Display mm/dd/YY — same as Next formatNoticeDate */
export function formatNoticeDate(
  dateStr: string | number | null | undefined
): string {
  if (dateStr == null) return '';
  let d: Date;
  if (
    typeof dateStr === 'number' ||
    (typeof dateStr === 'string' && /^\d+$/.test(dateStr))
  ) {
    const sec = typeof dateStr === 'number' ? dateStr : parseInt(dateStr, 10);
    d = new Date(sec * 1000);
  } else if (typeof dateStr === 'string') {
    d = new Date(dateStr.replace(/\s+/, 'T'));
  } else {
    return '';
  }
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const yy = d.getFullYear().toString().slice(-2);
  return `${mm}/${dd}/${yy}`;
}
