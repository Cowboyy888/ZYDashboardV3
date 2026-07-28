/**
 * Date/time helpers.
 *
 * Business rules:
 *  - All schedules and displayed times use APP_TIMEZONE (Asia/Phnom_Penh).
 *  - The database stores absolute instants in UTC (timestamptz), but each
 *    operational record ALSO carries a `business_date` (a local calendar date,
 *    stored as a plain `date`) so that "which day did this belong to" is never
 *    ambiguous across the UTC boundary.
 *  - Human-facing dates render as dd/mm/yyyy.
 *
 * Phnom Penh is UTC+7 year-round (no DST), but every function below derives the
 * offset from the IANA zone via Intl so the logic stays correct if the zone or
 * DST rules ever change.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Asia/Phnom_Penh';

/** A local calendar date in ISO `YYYY-MM-DD` form (no time, no zone). */
export type BusinessDate = string;

/**
 * Offset in minutes to ADD to a UTC time to get local wall-clock time in `tz`.
 * e.g. Asia/Phnom_Penh -> +420.
 */
export function tzOffsetMinutes(instant: Date, tz: string = APP_TIMEZONE): number {
  // Format the instant as if reading a wall clock in `tz`, then compare to the
  // same fields interpreted as UTC.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    // Intl renders midnight as "24" in some engines; normalise.
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The local business date for an instant, as `YYYY-MM-DD`. */
export function businessDate(instant: Date = new Date(), tz: string = APP_TIMEZONE): BusinessDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  // en-CA yields YYYY-MM-DD.
  return parts;
}

/**
 * Convert a local wall-clock date+time in `tz` to the absolute UTC instant.
 * @param date  `YYYY-MM-DD`
 * @param time  `HH:mm` (defaults to midnight)
 */
export function localToUtc(date: BusinessDate, time = '00:00', tz: string = APP_TIMEZONE): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // First guess: treat the wall-clock fields as if they were UTC.
  const guess = new Date(Date.UTC(y!, (m ?? 1) - 1, d!, hh ?? 0, mm ?? 0, 0));
  // Subtract the zone offset to land on the true UTC instant.
  const offset = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offset * 60000);
}

/** UTC instant for the start (00:00 local) of a business date. */
export function startOfBusinessDayUtc(date: BusinessDate, tz: string = APP_TIMEZONE): Date {
  return localToUtc(date, '00:00', tz);
}

/** UTC instant for the exclusive end (next midnight local) of a business date. */
export function endOfBusinessDayUtc(date: BusinessDate, tz: string = APP_TIMEZONE): Date {
  const next = addDays(date, 1);
  return localToUtc(next, '00:00', tz);
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` business date. */
export function addDays(date: BusinessDate, days: number): BusinessDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Format a business date (or Date) as dd/mm/yyyy. */
export function formatDDMMYYYY(value: BusinessDate | Date, tz: string = APP_TIMEZONE): string {
  const iso =
    value instanceof Date
      ? businessDate(value, tz)
      : value.length > 10
        ? value.slice(0, 10)
        : value;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Format an instant as `dd/mm/yyyy HH:mm` in the app timezone. */
export function formatDateTime(instant: Date | string, tz: string = APP_TIMEZONE): string {
  const dt = typeof instant === 'string' ? new Date(instant) : instant;
  const date = formatDDMMYYYY(businessDate(dt, tz));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(dt);
  return `${date} ${time}`;
}

/** Current wall-clock `HH:mm` in the app timezone. */
export function currentLocalTime(tz: string = APP_TIMEZONE, instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
