import { API_BASE_URL } from '@/lib/config';
import { secureStorage } from '@/utils/secureStorage';

export type TmsLoadLocationPoint = {
  short_address?: string;
};

export type YourLoadItem = {
  tms_load_id: string;
  load_status: string;
  from_short_address: string;
  to_short_address: string;
  driver_rate: number | null;
  loaded_miles: number | null;
};

export type YourLoadsResponse = {
  items: YourLoadItem[];
  tms: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function tryParseJsonArray(value: unknown): TmsLoadLocationPoint[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is TmsLoadLocationPoint => x != null && typeof x === 'object' && !Array.isArray(x));
  } catch {
    return [];
  }
}

function parseNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseIntOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeTmsLoadRow(raw: Record<string, unknown>): YourLoadItem {
  const idRaw = raw.id;
  const tms_load_id = idRaw != null ? String(idRaw).trim() : '';

  const meta = asRecord(raw.meta_data) ?? {};
  const load_status = meta.load_status != null ? String(meta.load_status).trim() : '';

  const pu = tryParseJsonArray(meta.pick_up_location);
  const del = tryParseJsonArray(meta.delivery_location);

  const from_short_address = pu[0]?.short_address != null ? String(pu[0].short_address).trim() : '';
  const to_short_address =
    del.length > 0 && del[del.length - 1]?.short_address != null
      ? String(del[del.length - 1].short_address).trim()
      : '';

  return {
    tms_load_id,
    load_status,
    from_short_address,
    to_short_address,
    driver_rate: parseNumberOrNull(meta.driver_rate),
    loaded_miles: parseNumberOrNull(meta.all_miles),
  };
}

export async function getYourLoads(params: {
  role: string;
  /** TMS external id for DRIVER / non-admin staff; may be empty for ADMINISTRATOR. */
  externalId: string;
  /** ADMINISTRATOR only: selected user's externalId for TMS `user_id`; omit / empty = all loads */
  adminUserTmsId?: string;
  load_status?: string; // omit for "All loads"
  page?: number;
  per_page?: number;
}): Promise<YourLoadsResponse> {
  if (!API_BASE_URL) {
    throw new Error('API_BASE_URL is not configured');
  }

  const accessToken = await secureStorage.getItemAsync('accessToken');
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const page = params.page ?? 1;
  const perPage = params.per_page ?? 20;

  const searchParams = new URLSearchParams();
  searchParams.set('project', 'odysseia');
  searchParams.set('sort_by', 'date_created');
  searchParams.set('sort_order', 'desc');
  searchParams.set('page', String(page));
  searchParams.set('per_page', String(perPage));

  const role = params.role.trim().toUpperCase();
  if (role === 'ADMINISTRATOR') {
    const uid = params.adminUserTmsId?.trim();
    if (uid) {
      searchParams.set('user_id', uid);
    }
  } else if (role === 'DRIVER') {
    searchParams.set('driver_id', params.externalId.trim());
  } else {
    searchParams.set('user_id', params.externalId.trim());
  }

  if (params.load_status != null && params.load_status.trim() !== '') {
    searchParams.set('load_status', params.load_status.trim());
  }

  const url = `${API_BASE_URL}/v1/tms/driver/loads?${searchParams.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg =
      typeof (errorData as { message?: unknown }).message === 'string'
        ? String((errorData as { message: unknown }).message)
        : `Failed to load your loads. Status: ${response.status}`;
    throw new Error(msg);
  }

  const raw: unknown = await response.json();
  // Backend wraps responses in `{ data: ... }`. TMS itself also uses `{ success, data, pagination }`.
  const wrapped = asRecord(raw) ?? {};
  const tmsEnvelope = asRecord(wrapped.data) ?? wrapped;
  const tmsData = asRecord(tmsEnvelope.data) ?? {};

  const loadsRaw = tmsData.loads;
  const loads = Array.isArray(loadsRaw)
    ? loadsRaw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
    : [];

  const pagination = asRecord(tmsEnvelope.pagination) ?? {};
  const totalPages =
    parseIntOrUndefined(tmsData.total_pages) ??
    parseIntOrUndefined(pagination.total_pages) ??
    1;
  const total =
    parseIntOrUndefined(tmsData.total_items) ??
    parseIntOrUndefined(pagination.total_items) ??
    loads.length;
  const currentPage =
    parseIntOrUndefined(pagination.current_page) ??
    parseIntOrUndefined(tmsData.page) ??
    page;

  return {
    items: loads.map(normalizeTmsLoadRow),
    tms: {
      total,
      page: currentPage,
      per_page: perPage,
      total_pages: totalPages,
    },
  };
}

