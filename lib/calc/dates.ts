/**
 * Day arithmetic for a single timezone.
 *
 * Everything in the calculations module addresses days by their calendar key
 * ("2026-09-19") rather than by Date. A Date is an instant; a weigh-in belongs
 * to a day. Melbourne shifts by an hour twice a year, so local midnight is not
 * a fixed 24-hour grid and arithmetic built on it drifts. Keys are converted
 * once, at the boundary, and all arithmetic below happens on UTC midnights,
 * which are always exactly 86,400,000 ms apart.
 */

/** A calendar day in ISO form, `YYYY-MM-DD`. */
export type DayKey = string;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

const MS_PER_DAY = 86_400_000;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day an instant falls on, in the given timezone. */
export function dayKeyOf(instant: Date, timeZone: string): DayKey {
  // en-CA renders as YYYY-MM-DD, which is the format we want anyway.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function isDayKey(value: string): value is DayKey {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const asUtc = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(asUtc)) return false;
  // Rejects 2026-02-30, which Date.parse would otherwise roll forward.
  return new Date(asUtc).toISOString().slice(0, 10) === value;
}

function assertDayKey(value: string): DayKey {
  if (!isDayKey(value)) throw new RangeError(`Not a calendar day: ${value}`);
  return value;
}

/** UTC midnight for a day key. Internal to this module's arithmetic. */
function epochOf(day: DayKey): number {
  return Date.parse(`${assertDayKey(day)}T00:00:00Z`);
}

function keyOf(epoch: number): DayKey {
  return new Date(epoch).toISOString().slice(0, 10);
}

export function addDays(day: DayKey, delta: number): DayKey {
  return keyOf(epochOf(day) + delta * MS_PER_DAY);
}

/** Whole days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((epochOf(to) - epochOf(from)) / MS_PER_DAY);
}

export function compareDays(a: DayKey, b: DayKey): number {
  return epochOf(a) - epochOf(b);
}

/** Day of the week, 0 = Sunday. */
export function weekdayOf(day: DayKey): Weekday {
  return new Date(epochOf(day)).getUTCDay() as Weekday;
}

/**
 * The first day of the week `day` belongs to.
 *
 * `weekStartsOn` comes from the profile — Monday by default, but a phase that
 * always begins on a Sunday may want the weeks to line up with it.
 */
export function weekStartOf(day: DayKey, weekStartsOn: Weekday = 1): DayKey {
  const offset = (weekdayOf(day) - weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

/** Every day from `from` to `to`, inclusive. Empty when `to` precedes `from`. */
export function daysInRange(from: DayKey, to: DayKey): DayKey[] {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}
