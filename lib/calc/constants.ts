/**
 * The energy density of body mass change, in kcal per kg.
 *
 * This is the "7700 rule" and it is an approximation, not a measurement. It
 * comes from the energy in a kilogram of adipose tissue, and it silently
 * assumes the weight moving is fat. Over a short window, or when glycogen and
 * water are swinging, it is wrong. Over a 21-28 day window on a smoothed trend
 * it is close enough to steer by, which is the only thing it is used for.
 *
 * One constant, one place to change it, and every estimate derived from it
 * carries a confidence range rather than a single number.
 */
export const KCAL_PER_KG = 7700;

/** Smoothing factor for the bodyweight trend. Lower is smoother and laggier. */
export const DEFAULT_TREND_ALPHA = 0.1;

/** A weekly average built on fewer readings than this is flagged low-confidence. */
export const MIN_READINGS_FOR_CONFIDENT_WEEK = 4;

/** Below this share of tracked days, a maintenance estimate is not reported. */
export const MIN_TRACKED_DAY_RATIO = 0.7;

/** Maintenance estimates are reported to this resolution. */
export const TDEE_ROUNDING_KCAL = 25;
