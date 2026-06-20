const NY_TZ = 'America/New_York';
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/** Same format as Nest `formatNyWallClockSqlString` (YYYY-MM-DD HH:mm:ss, NY wall). */
export function formatNyWallClockSqlString(instant: Date): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: NY_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(instant);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Driver statusDate: MM/DD/YY h:mm AM/PM in America/New_York. */
export function formatStatusDateNyDisplay(instant: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: NY_TZ,
		month: '2-digit',
		day: '2-digit',
		year: '2-digit',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	}).formatToParts(instant);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('month')}/${get('day')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

const NY_WALL_CLOCK_RE =
	/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z)?$/;

function parseNyWallClockParts(value: string): Date | null {
	const match = value.match(NY_WALL_CLOCK_RE);
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match;
	const parsed = new Date(
		Date.UTC(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second)
		)
	);
	return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** Parse DB/API timestamps stored as NY wall-clock (naive or ISO with Z). */
export function parseNaiveNyDateTime(value: string | null | undefined): Date | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const parsed = parseNyWallClockParts(trimmed);
	if (parsed) return parsed;
	const parsedFallback = new Date(trimmed.replace(' ', 'T'));
	return Number.isFinite(parsedFallback.getTime()) ? parsedFallback : null;
}

/** Format chat message time in New York wall-clock (HH:MM AM/PM). */
export function formatNyWallClockTime(value: string | null | undefined): string {
	const date = parseNaiveNyDateTime(value);
	if (!date) return '';
	return date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
		timeZone: 'UTC',
	});
}

/** Format chat message date and time in New York wall-clock (e.g. Jun 10, 2026, 11:27 AM). */
export function formatNyWallClockDateTime(value: string | null | undefined): string {
	const date = parseNaiveNyDateTime(value);
	if (!date) return '';
	const datePart = date.toLocaleDateString('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
	const timePart = date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
		timeZone: 'UTC',
	});
	return `${datePart}, ${timePart}`;
}

function nowNyWallClockDate(): Date {
	return parseNaiveNyDateTime(formatNyWallClockSqlString(new Date()))!;
}

function nyWallClockDateKeyFromDate(date: Date): string {
	return date.toLocaleDateString('en-CA', { timeZone: 'UTC' });
}

/** YYYY-MM-DD key for NY wall-clock timestamps (date separators / grouping). */
export function nyWallClockDateKey(value: string | null | undefined): string {
	const date = parseNaiveNyDateTime(value);
	if (!date) return '';
	return nyWallClockDateKeyFromDate(date);
}

/** Date separator label: Today / Yesterday / DD MMM YYYY (NY wall-clock). */
export function formatNyWallClockDateSeparator(value: string | null | undefined): string {
	const date = parseNaiveNyDateTime(value);
	if (!date) return '';

	const dateKey = nyWallClockDateKeyFromDate(date);
	const now = nowNyWallClockDate();
	const nowKey = nyWallClockDateKeyFromDate(now);

	if (dateKey === nowKey) return 'Today';

	const yesterdayKey = nyWallClockDateKeyFromDate(new Date(now.getTime() - 86400000));
	if (dateKey === yesterdayKey) return 'Yesterday';

	return date.toLocaleDateString('en-US', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

/** Relative label for chat list (Just now / Nm / Nh / Nd) vs current NY time. */
export function formatChatRelativeTimeNy(value: string | null | undefined): string {
	const messageTime = parseNaiveNyDateTime(value);
	if (!messageTime) return '';
	const now = nowNyWallClockDate();
	const diffInMinutes = Math.floor(
		(now.getTime() - messageTime.getTime()) / MS_PER_MINUTE
	);
	if (diffInMinutes < 1) return 'Just now';
	if (diffInMinutes < 60) return `${diffInMinutes}m`;
	if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
	return `${Math.floor(diffInMinutes / 1440)}d`;
}

/** Sort key for messages stored as NY wall-clock. */
export function nyWallClockTimestampMs(value: string): number {
	return parseNaiveNyDateTime(value)?.getTime() ?? new Date(value).getTime();
}
