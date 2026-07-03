/** Display separator for optional end time, e.g. "4 June 2026 8 AM — 12 PM" */
export const OFFER_DATETIME_RANGE_SEP = ' — ';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function monthIndexFromName(name: string): number {
  return MONTH_NAMES.findIndex((month) => month.toLowerCase() === name.toLowerCase());
}

function parse12hClock(
  hour: number,
  minute: number,
  period: string,
): { hour: number; minute: number } {
  let h = hour;
  const p = period.toLowerCase();
  if (p === 'pm' && h < 12) h += 12;
  if (p === 'am' && h === 12) h = 0;
  return { hour: h, minute };
}

/** "4 June 2026 8 AM" or "4 June 2026 8:30 AM" */
export function parseLongOfferDateTime(value: string): Date | null {
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = monthIndexFromName(match[2]);
  const year = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5] ?? '0', 10) || 0;
  if (month < 0 || Number.isNaN(day) || Number.isNaN(year) || Number.isNaN(hour)) {
    return null;
  }

  const { hour: h, minute: min } = parse12hClock(hour, minute, match[6]);
  const date = new Date(year, month, day, h, min, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return date;
}

/** Legacy: "03/24/2026 02:30 pm" */
export function parseSlashOfferDateTime(value: string): Date | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;

  const month = parseInt(match[1], 10) - 1;
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const { hour: h, minute: min } = parse12hClock(hour, minute, match[6]);
  const date = new Date(year, month, day, h, min, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return date;
}

/** "12 PM" or "8:30 AM" */
export function parseOfferTimeOnly(value: string, baseDate: Date): Date | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] ?? '0', 10) || 0;
  const { hour: h, minute: min } = parse12hClock(hour, minute, match[3]);
  const date = new Date(baseDate);
  date.setHours(h, min, 0, 0);
  return date;
}

export function parseSingleOfferDateTime(value: string): Date | null {
  return parseLongOfferDateTime(value) ?? parseSlashOfferDateTime(value);
}

export function parseOfferDateTimeField(value: string): {
  start: Date | null;
  end: Date | null;
} {
  const trimmed = value.trim();
  if (!trimmed) return { start: null, end: null };

  if (trimmed.includes(OFFER_DATETIME_RANGE_SEP)) {
    const [startPart, endPart] = trimmed.split(OFFER_DATETIME_RANGE_SEP).map((part) => part.trim());
    const start = parseSingleOfferDateTime(startPart);
    if (!start || !endPart) return { start, end: null };
    const end = parseSingleOfferDateTime(endPart) ?? parseOfferTimeOnly(endPart, start);
    return { start, end };
  }

  return { start: parseSingleOfferDateTime(trimmed), end: null };
}

function formatTimePart(date: Date): string {
  let hours = date.getHours();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutes = date.getMinutes();
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`;
}

/** Client format: "4 June 2026 8:00 AM" */
export function formatOfferDateTime(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year} ${formatTimePart(date)}`;
}

/** Same day: "4 June 2026 8:00 AM — 12:00 PM"; different days: full end date */
export function formatOfferDateTimeRange(start: Date, end?: Date | null): string {
  if (!end) return formatOfferDateTime(start);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${formatOfferDateTime(start)}${OFFER_DATETIME_RANGE_SEP}${formatTimePart(end)}`;
  }
  return `${formatOfferDateTime(start)}${OFFER_DATETIME_RANGE_SEP}${formatOfferDateTime(end)}`;
}

export function parseOfferRouteDateTime(value: string): Date | null {
  return parseOfferDateTimeField(value).start;
}

export const ROUTE_CHRONOLOGY_ERROR =
  'Each stop date & time must be on or after the previous stop';

export const END_TIME_AFTER_START_ERROR = 'End time must be after start time';

export function getRouteChronologyError(times: string[]): string | null {
  const trimmed = times.map((time) => time.trim());

  for (const time of trimmed) {
    if (!time) continue;
    const { start, end } = parseOfferDateTimeField(time);
    if (start && end && end.getTime() <= start.getTime()) {
      return END_TIME_AFTER_START_ERROR;
    }
  }

  for (let i = 1; i < trimmed.length; i += 1) {
    const prevTime = trimmed[i - 1];
    const currTime = trimmed[i];
    if (!prevTime || !currTime) continue;
    const { start: prevStart } = parseOfferDateTimeField(prevTime);
    const { start: currStart } = parseOfferDateTimeField(currTime);
    if (prevStart && currStart && currStart.getTime() < prevStart.getTime()) {
      return ROUTE_CHRONOLOGY_ERROR;
    }
  }

  return null;
}
