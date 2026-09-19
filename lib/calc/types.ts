import type { DayKey } from './dates';

export type TrackingStatus = 'tracked' | 'partial' | 'untracked';

/**
 * One day's readings. Every field beyond the date is optional: the whole point
 * of the tracking status is that incomplete days are ordinary, not errors.
 */
export interface DailyLog {
  date: DayKey;
  weightKg?: number;
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sodiumMg?: number;
  steps?: number;
  trackingStatus: TrackingStatus;
  tags?: string[];
}

export interface TrendPoint {
  date: DayKey;
  /** The smoothed value. Always present once the series has started. */
  trendKg: number;
  /** The reading for this day, if one exists. */
  readingKg?: number;
  /** True when no reading existed and the input was filled in to keep the
   *  series continuous. Never render these as readings. */
  interpolated: boolean;
}

export interface WeeklyAverage {
  weekStart: DayKey;
  /** Mean of the readings actually present. Undefined when there were none. */
  averageKg?: number;
  readingCount: number;
  /** Fewer readings than the confidence floor — show, but mark it. */
  lowConfidence: boolean;
  /** Change from the previous week's average, in grams. */
  changeG?: number;
  averageKcal?: number;
  averageSteps?: number;
  trackedDays: number;
  partialDays: number;
  untrackedDays: number;
}

export interface TrendRate {
  /** Slope of the trend line over the window, in grams per week. */
  gramsPerWeek: number;
  windowDays: number;
  /** Points the slope was fitted to. Fewer points, less meaning. */
  sampleCount: number;
}

export interface MaintenanceEstimate {
  kind: 'estimate';
  /** Rounded to the nearest 25 kcal. Precision here would be a lie. */
  kcal: number;
  /** Plus or minus, in kcal, already rounded. */
  marginKcal: number;
  windowDays: number;
  trackedDays: number;
  meanIntakeKcal: number;
  trendChangeKg: number;
}

export interface MaintenanceUnavailable {
  kind: 'unavailable';
  reason: 'not-enough-tracked-days' | 'not-enough-weight-readings' | 'window-too-short';
  trackedDays: number;
  windowDays: number;
}

export type MaintenanceResult = MaintenanceEstimate | MaintenanceUnavailable;
