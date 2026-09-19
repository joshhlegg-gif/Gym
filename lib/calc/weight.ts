import { DEFAULT_TREND_ALPHA, MIN_READINGS_FOR_CONFIDENT_WEEK } from './constants';
import { addDays, compareDays, daysBetween, daysInRange, weekStartOf, type DayKey, type Weekday } from './dates';
import type { DailyLog, TrendPoint, TrendRate, WeeklyAverage } from './types';

/**
 * A single morning reading is mostly water, gut contents and yesterday's salt.
 * The trend is the signal, so everything here works on the smoothed series and
 * the raw reading is kept alongside only so the UI can draw it faintly.
 */

interface Reading {
  date: DayKey;
  kg: number;
}

function readingsOf(logs: DailyLog[]): Reading[] {
  return logs
    .filter((log): log is DailyLog & { weightKg: number } => typeof log.weightKg === 'number')
    .map((log) => ({ date: log.date, kg: log.weightKg }))
    .sort((a, b) => compareDays(a.date, b.date));
}

/**
 * Exponentially weighted moving average over a gap-free daily series.
 *
 * Missing days are filled by straight-line interpolation between the readings
 * either side of the gap, so that a fortnight away from the scales does not
 * compress into a single step change. Filled days are marked and must never be
 * shown as though someone stood on the scales.
 */
export function buildTrend(logs: DailyLog[], alpha: number = DEFAULT_TREND_ALPHA): TrendPoint[] {
  if (alpha <= 0 || alpha > 1) throw new RangeError(`alpha must be in (0, 1]: ${alpha}`);

  const readings = readingsOf(logs);
  if (readings.length === 0) return [];

  const first = readings[0]!;
  const last = readings[readings.length - 1]!;
  const byDate = new Map(readings.map((r) => [r.date, r.kg]));

  const points: TrendPoint[] = [];
  let trend: number | undefined;
  let next = 0; // index of the next reading at or after the cursor

  for (const date of daysInRange(first.date, last.date)) {
    while (next < readings.length && compareDays(readings[next]!.date, date) < 0) next += 1;

    const reading = byDate.get(date);
    let value: number;
    let interpolated: boolean;

    if (reading !== undefined) {
      value = reading;
      interpolated = false;
    } else {
      // Bracketed by definition: the loop never runs past the last reading.
      const before = readings[next - 1]!;
      const after = readings[next]!;
      const span = daysBetween(before.date, after.date);
      const travelled = daysBetween(before.date, date);
      value = before.kg + ((after.kg - before.kg) * travelled) / span;
      interpolated = true;
    }

    trend = trend === undefined ? value : alpha * value + (1 - alpha) * trend;
    points.push({ date, trendKg: trend, readingKg: reading, interpolated });
  }

  return points;
}

/**
 * Least-squares slope of the trend over the trailing window, in grams a week.
 *
 * Fitted rather than measured end-to-end: the endpoints of a smoothed series
 * still carry the noise of whichever days happen to bound the window.
 */
export function trendRate(trend: TrendPoint[], windowDays: number, asOf?: DayKey): TrendRate {
  if (windowDays < 2) throw new RangeError(`windowDays must be at least 2: ${windowDays}`);

  const end = asOf ?? trend[trend.length - 1]?.date;
  if (end === undefined) return { gramsPerWeek: 0, windowDays, sampleCount: 0 };

  const start = addDays(end, -(windowDays - 1));
  const window = trend.filter((p) => compareDays(p.date, start) >= 0 && compareDays(p.date, end) <= 0);
  if (window.length < 2) return { gramsPerWeek: 0, windowDays, sampleCount: window.length };

  const n = window.length;
  const xs = window.map((p) => daysBetween(start, p.date));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((a, p) => a + p.trendKg, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    covariance += dx * (window[i]!.trendKg - meanY);
    variance += dx * dx;
  }

  const kgPerDay = variance === 0 ? 0 : covariance / variance;
  return { gramsPerWeek: kgPerDay * 7 * 1000, windowDays, sampleCount: n };
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * One row per week that contains at least one log, from the first to the last.
 *
 * Weeks with no logs at all are still emitted, so a gap in the table reads as a
 * gap rather than as two adjacent weeks that were never adjacent.
 */
export function weeklyAverages(logs: DailyLog[], weekStartsOn: Weekday = 1): WeeklyAverage[] {
  if (logs.length === 0) return [];

  const sorted = [...logs].sort((a, b) => compareDays(a.date, b.date));
  const firstWeek = weekStartOf(sorted[0]!.date, weekStartsOn);
  const lastWeek = weekStartOf(sorted[sorted.length - 1]!.date, weekStartsOn);

  const buckets = new Map<DayKey, DailyLog[]>();
  for (const log of sorted) {
    const key = weekStartOf(log.date, weekStartsOn);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(log);
    else buckets.set(key, [log]);
  }

  const weeks: WeeklyAverage[] = [];
  let previousAverage: number | undefined;

  for (let week = firstWeek; compareDays(week, lastWeek) <= 0; week = addDays(week, 7)) {
    const inWeek = buckets.get(week) ?? [];
    const weights = inWeek.map((l) => l.weightKg).filter((w): w is number => typeof w === 'number');
    // Only tracked days feed the intake average; a day someone did not log is
    // not a day they ate nothing.
    const kcal = inWeek
      .filter((l) => l.trackingStatus === 'tracked')
      .map((l) => l.caloriesKcal)
      .filter((c): c is number => typeof c === 'number');
    const steps = inWeek.map((l) => l.steps).filter((s): s is number => typeof s === 'number');

    const averageKg = mean(weights);
    const changeG =
      averageKg !== undefined && previousAverage !== undefined
        ? (averageKg - previousAverage) * 1000
        : undefined;

    weeks.push({
      weekStart: week,
      averageKg,
      readingCount: weights.length,
      lowConfidence: weights.length < MIN_READINGS_FOR_CONFIDENT_WEEK,
      changeG,
      averageKcal: mean(kcal),
      averageSteps: mean(steps),
      trackedDays: inWeek.filter((l) => l.trackingStatus === 'tracked').length,
      partialDays: inWeek.filter((l) => l.trackingStatus === 'partial').length,
      untrackedDays: inWeek.filter((l) => l.trackingStatus === 'untracked').length,
    });

    if (averageKg !== undefined) previousAverage = averageKg;
  }

  return weeks;
}

/** Waist-to-height, the one measurement ratio worth a headline. */
export function waistToHeightRatio(waistCm: number, heightCm: number): number {
  if (heightCm <= 0) throw new RangeError(`heightCm must be positive: ${heightCm}`);
  return waistCm / heightCm;
}
