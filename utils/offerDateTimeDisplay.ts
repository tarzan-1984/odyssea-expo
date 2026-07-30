import {
  OFFER_ASAP_DRIVER_TIME_LABEL,
  OFFER_DATETIME_RANGE_SEP,
  isOfferAsapTime,
  parseOfferDateTimeField,
} from '@/utils/offerDateTimeRange';

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
  /** Single-line ASAP label instead of date + time. */
  isAsap?: boolean;
};

/** Driver offer route stop: date on one line, time range on the next. */
export function formatOfferRouteTimeForDriver(
  value: string | null | undefined,
): DriverOfferRouteTimeDisplay | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (isOfferAsapTime(trimmed)) {
    return {
      dateLine: OFFER_ASAP_DRIVER_TIME_LABEL,
      timeLine: '',
      isAsap: true,
    };
  }

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
