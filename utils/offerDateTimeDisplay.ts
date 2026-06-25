const OFFER_DATETIME_RANGE_SEP = ' — ';

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

function parseLongOfferDateTime(value: string): Date | null {
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

function parseSlashOfferDateTime(value: string): Date | null {
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

function parseOfferTimeOnly(value: string, baseDate: Date): Date | null {
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

function parseSingleOfferDateTime(value: string): Date | null {
  return parseLongOfferDateTime(value) ?? parseSlashOfferDateTime(value);
}

function parseOfferDateTimeField(value: string): { start: Date | null; end: Date | null } {
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

function formatDateLine(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export type DriverOfferRouteTimeDisplay = {
  dateLine: string;
  timeLine: string;
};

/** Driver offer route stop: date on one line, time range on the next. */
export function formatOfferRouteTimeForDriver(
  value: string | null | undefined,
): DriverOfferRouteTimeDisplay | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const { start, end } = parseOfferDateTimeField(trimmed);
  if (!start) return null;

  const dateLine = formatDateLine(start);
  if (!end) {
    return { dateLine, timeLine: formatTimePart(start) };
  }

  const sameDay = start.toDateString() === end.toDateString();
  const timeLine = sameDay
    ? `${formatTimePart(start)}${OFFER_DATETIME_RANGE_SEP}${formatTimePart(end)}`
    : `${formatTimePart(start)}${OFFER_DATETIME_RANGE_SEP}${formatDateLine(end)} ${formatTimePart(end)}`;

  return { dateLine, timeLine };
}
