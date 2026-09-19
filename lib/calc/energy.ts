import { KCAL_PER_KG, MIN_TRACKED_DAY_RATIO, TDEE_ROUNDING_KCAL } from './constants';
import { addDays, compareDays, type DayKey } from './dates';
import type { DailyLog, MaintenanceResult, TrendPoint } from './types';

/**
 * Estimated maintenance, from what was eaten and what the trend did.
 *
 *   maintenance = mean intake on tracked days - (trend change in kg * 7700 / days)
 *
 * Read it as: if the trend fell, the shortfall was made up from the body, so
 * true expenditure was higher than intake by that amount. Nothing here is
 * measured — it is inferred, and it is only as good as the honesty of the food
 * log, which is why untracked days are excluded outright rather than treated
 * as zero and why the result carries a margin.
 */

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Standard error of a least-squares slope, in kg per day. */
function slopeStandardError(points: TrendPoint[]): number {
  const n = points.length;
  if (n < 3) return 0;

  const xs = points.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, p) => a + p.trendKg, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (points[i]!.trendKg - meanY);
  }
  if (sxx === 0) return 0;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let residual = 0;
  for (let i = 0; i < n; i += 1) {
    residual += (points[i]!.trendKg - (slope * xs[i]! + intercept)) ** 2;
  }

  return Math.sqrt(residual / (n - 2) / sxx);
}

export interface MaintenanceOptions {
  /** Last day of the window. Defaults to the last day of the trend. */
  asOf?: DayKey;
  /** Length of the rolling window. The spec's range is 21-28 days. */
  windowDays?: number;
}

export function estimateMaintenance(
  logs: DailyLog[],
  trend: TrendPoint[],
  options: MaintenanceOptions = {},
): MaintenanceResult {
  const windowDays = options.windowDays ?? 28;
  const end = options.asOf ?? trend[trend.length - 1]?.date;

  if (windowDays < 14) {
    return { kind: 'unavailable', reason: 'window-too-short', trackedDays: 0, windowDays };
  }
  if (end === undefined) {
    return { kind: 'unavailable', reason: 'not-enough-weight-readings', trackedDays: 0, windowDays };
  }

  const start = addDays(end, -(windowDays - 1));
  const inWindow = <T extends { date: DayKey }>(item: T) =>
    compareDays(item.date, start) >= 0 && compareDays(item.date, end) <= 0;

  const windowTrend = trend.filter(inWindow);
  const windowLogs = logs.filter(inWindow);

  const tracked = windowLogs.filter(
    (l): l is DailyLog & { caloriesKcal: number } =>
      l.trackingStatus === 'tracked' && typeof l.caloriesKcal === 'number',
  );

  if (tracked.length < windowDays * MIN_TRACKED_DAY_RATIO) {
    return {
      kind: 'unavailable',
      reason: 'not-enough-tracked-days',
      trackedDays: tracked.length,
      windowDays,
    };
  }

  // Two trend points bound a span of one day, so the divisor is the span, not
  // the count. Getting this wrong biases every estimate by a factor of n/(n-1).
  if (windowTrend.length < 2) {
    return {
      kind: 'unavailable',
      reason: 'not-enough-weight-readings',
      trackedDays: tracked.length,
      windowDays,
    };
  }

  const intake = tracked.map((l) => l.caloriesKcal);
  const meanIntake = intake.reduce((a, b) => a + b, 0) / intake.length;

  const firstPoint = windowTrend[0]!;
  const lastPoint = windowTrend[windowTrend.length - 1]!;
  const trendChangeKg = lastPoint.trendKg - firstPoint.trendKg;
  const spanDays = windowTrend.length - 1;

  const dailyImbalance = (trendChangeKg * KCAL_PER_KG) / spanDays;
  const maintenance = meanIntake - dailyImbalance;

  // Two independent sources of error: how much the intake average could be off,
  // and how much the fitted rate could be off. Added in quadrature.
  const intakeError = standardDeviation(intake) / Math.sqrt(intake.length);
  const rateError = slopeStandardError(windowTrend) * KCAL_PER_KG;
  const margin = Math.sqrt(intakeError ** 2 + rateError ** 2);

  return {
    kind: 'estimate',
    kcal: roundTo(maintenance, TDEE_ROUNDING_KCAL),
    marginKcal: Math.max(TDEE_ROUNDING_KCAL, roundTo(margin, TDEE_ROUNDING_KCAL)),
    windowDays,
    trackedDays: tracked.length,
    meanIntakeKcal: meanIntake,
    trendChangeKg,
  };
}

/**
 * The calorie target a phase should open with, given current maintenance and
 * the rate it is aiming for. Negative rates give a deficit, positive a surplus.
 */
export function suggestCalorieTarget(maintenanceKcal: number, targetRateGPerWeek: number): number {
  const dailyAdjustment = ((targetRateGPerWeek / 1000) * KCAL_PER_KG) / 7;
  return roundTo(maintenanceKcal + dailyAdjustment, TDEE_ROUNDING_KCAL);
}
