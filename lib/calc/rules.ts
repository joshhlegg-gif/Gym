import type { DayKey } from './dates';
import { compareDays } from './dates';

/**
 * Decision rules are written once, when the phase is planned and nobody is
 * hungry, tired or three days into a stall. Evaluating them weekly is the whole
 * mechanism: the app reports what the plan already said to do, so the decision
 * is not remade from scratch every time the scales move.
 */

export type RuleMetric =
  | 'weeklyAvgChangeG'
  | 'trendRateGPerWeek'
  | 'waistChangeCm'
  | 'sessionsPerWeek'
  | 'avgSteps'
  | 'trackedDaysPct';

export type RuleComparator = '<' | '>' | 'between';

export type RuleSeverity = 'info' | 'adjust' | 'review';

export interface DecisionRule {
  id: string;
  metric: RuleMetric;
  comparator: RuleComparator;
  /** One value for `<` and `>`; two, low then high, for `between`. */
  thresholds: number[];
  /** How many weeks in a row the condition must hold. Minimum 1. */
  consecutiveWeeks: number;
  /** What to do, in the user's own words. Never generated. */
  action: string;
  severity: RuleSeverity;
}

/** One week's worth of the numbers rules are allowed to look at. */
export interface WeeklyMetrics {
  weekStart: DayKey;
  weeklyAvgChangeG?: number;
  trendRateGPerWeek?: number;
  waistChangeCm?: number;
  sessionsPerWeek?: number;
  avgSteps?: number;
  trackedDaysPct?: number;
}

export interface RuleMatch {
  rule: DecisionRule;
  /** The weeks that satisfied it, oldest first. */
  weeks: DayKey[];
  /** The metric value in the most recent of those weeks. */
  latestValue: number;
}

const SEVERITY_ORDER: Record<RuleSeverity, number> = { review: 0, adjust: 1, info: 2 };

function satisfies(rule: DecisionRule, value: number): boolean {
  const [low, high] = rule.thresholds;
  switch (rule.comparator) {
    case '<':
      if (low === undefined) throw new RangeError(`Rule ${rule.id} needs one threshold`);
      return value < low;
    case '>':
      if (low === undefined) throw new RangeError(`Rule ${rule.id} needs one threshold`);
      return value > low;
    case 'between': {
      if (low === undefined || high === undefined) {
        throw new RangeError(`Rule ${rule.id} needs two thresholds`);
      }
      // Written either way round in practice: a cut's band reads -350 to -150
      // to one person and -150 to -350 to another.
      const lower = Math.min(low, high);
      const upper = Math.max(low, high);
      return value >= lower && value <= upper;
    }
  }
}

/**
 * Evaluate every rule against the run of weeks ending at `asOfWeek`.
 *
 * A rule matches only when its condition held in each of the last
 * `consecutiveWeeks` weeks without interruption — a week whose metric is
 * missing breaks the run rather than being skipped over, because a week with no
 * data is not evidence that anything held.
 *
 * All matches are returned, most severe first: a week can simultaneously be
 * losing too fast and under-tracked, and hiding one behind the other would lose
 * the more important of the two.
 */
export function evaluateRules(
  rules: DecisionRule[],
  weeks: WeeklyMetrics[],
  asOfWeek?: DayKey,
): RuleMatch[] {
  const ordered = [...weeks].sort((a, b) => compareDays(a.weekStart, b.weekStart));
  const end = asOfWeek ?? ordered[ordered.length - 1]?.weekStart;
  if (end === undefined) return [];

  const upTo = ordered.filter((w) => compareDays(w.weekStart, end) <= 0);
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    const required = Math.max(1, rule.consecutiveWeeks);
    if (upTo.length < required) continue;

    const run = upTo.slice(-required);
    const values = run.map((w) => w[rule.metric]);
    if (values.some((v) => typeof v !== 'number')) continue;

    const numeric = values as number[];
    if (!numeric.every((v) => satisfies(rule, v))) continue;

    matches.push({
      rule,
      weeks: run.map((w) => w.weekStart),
      latestValue: numeric[numeric.length - 1]!,
    });
  }

  return matches.sort((a, b) => SEVERITY_ORDER[a.rule.severity] - SEVERITY_ORDER[b.rule.severity]);
}

export interface PhaseTargets {
  calorieTarget: number;
  targetRateGPerWeek: number;
  rateToleranceG: number;
  stepTarget: number;
  sessionsPerWeekTarget: number;
}

export interface ComplianceReport {
  avgKcal?: number;
  kcalVsTarget?: number;
  trackedDaysPct: number;
  avgSteps?: number;
  stepsVsTarget?: number;
  sessions: number;
  sessionsVsTarget: number;
  actualRateGPerWeek?: number;
  /** Whether the actual rate sat inside target +/- tolerance. */
  rateOnTarget?: boolean;
}

/**
 * How the phase actually went against what it intended. Deliberately reports
 * gaps rather than a score: "12 kcal under, two sessions short" is actionable
 * in a way that "84% compliant" is not.
 */
export function phaseCompliance(
  targets: PhaseTargets,
  actual: {
    avgKcal?: number;
    trackedDays: number;
    totalDays: number;
    avgSteps?: number;
    sessions: number;
    weeks: number;
    actualRateGPerWeek?: number;
  },
): ComplianceReport {
  const { avgKcal, avgSteps, actualRateGPerWeek } = actual;

  return {
    avgKcal,
    kcalVsTarget: avgKcal === undefined ? undefined : avgKcal - targets.calorieTarget,
    trackedDaysPct: actual.totalDays === 0 ? 0 : (actual.trackedDays / actual.totalDays) * 100,
    avgSteps,
    stepsVsTarget: avgSteps === undefined ? undefined : avgSteps - targets.stepTarget,
    sessions: actual.sessions,
    sessionsVsTarget: actual.sessions - targets.sessionsPerWeekTarget * actual.weeks,
    actualRateGPerWeek,
    rateOnTarget:
      actualRateGPerWeek === undefined
        ? undefined
        : Math.abs(actualRateGPerWeek - targets.targetRateGPerWeek) <= targets.rateToleranceG,
  };
}
