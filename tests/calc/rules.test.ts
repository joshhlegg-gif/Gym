import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
  evaluateRules,
  phaseCompliance,
  type DecisionRule,
  type WeeklyMetrics,
} from '../../lib/calc/rules';

/** The seed rules from the spec, for a cut aiming at -250 g a week. */
const ON_TRACK: DecisionRule = {
  id: 'on-track',
  metric: 'weeklyAvgChangeG',
  comparator: 'between',
  thresholds: [-350, -150],
  consecutiveWeeks: 1,
  action: 'On track, no change',
  severity: 'info',
};

const STALLED: DecisionRule = {
  id: 'stalled',
  metric: 'weeklyAvgChangeG',
  comparator: '>',
  thresholds: [-100],
  consecutiveWeeks: 2,
  action: 'Drop 100-150 kcal or add 1,500 steps',
  severity: 'adjust',
};

const TOO_FAST: DecisionRule = {
  id: 'too-fast',
  metric: 'weeklyAvgChangeG',
  comparator: '<',
  thresholds: [-500],
  consecutiveWeeks: 2,
  action: 'Add 100-150 kcal',
  severity: 'adjust',
};

const TRACKING: DecisionRule = {
  id: 'tracking',
  metric: 'trackedDaysPct',
  comparator: '<',
  thresholds: [71.4],
  consecutiveWeeks: 1,
  action: 'Fix tracking before changing calories',
  severity: 'review',
};

function weeks(...changes: (number | undefined)[]): WeeklyMetrics[] {
  return changes.map((weeklyAvgChangeG, i) => ({
    weekStart: `2026-09-${String(7 + i * 7).padStart(2, '0')}`,
    weeklyAvgChangeG,
    trackedDaysPct: 100,
  }));
}

describe('evaluateRules', () => {
  test('matches a band the week sits inside', () => {
    const matched = evaluateRules([ON_TRACK], weeks(-250));
    assert.equal(matched.length, 1);
    assert.equal(matched[0]!.rule.action, 'On track, no change');
    assert.equal(matched[0]!.latestValue, -250);
  });

  test('reads a band written either way round', () => {
    const reversed: DecisionRule = { ...ON_TRACK, thresholds: [-150, -350] };
    assert.equal(evaluateRules([reversed], weeks(-250)).length, 1);
  });

  test('a band is inclusive at its edges', () => {
    assert.equal(evaluateRules([ON_TRACK], weeks(-150)).length, 1);
    assert.equal(evaluateRules([ON_TRACK], weeks(-350)).length, 1);
    assert.equal(evaluateRules([ON_TRACK], weeks(-351)).length, 0);
  });

  test('holds fire until the run is long enough', () => {
    assert.equal(evaluateRules([STALLED], weeks(-50)).length, 0, 'one week is not a trend');
    assert.equal(evaluateRules([STALLED], weeks(-50, -20)).length, 1);
  });

  test('a good week breaks the run', () => {
    assert.equal(evaluateRules([STALLED], weeks(-50, -400, -20)).length, 0);
  });

  test('only the most recent weeks count toward the run', () => {
    assert.equal(evaluateRules([STALLED], weeks(-400, -50, -20)).length, 1);
  });

  test('a missing week breaks the run rather than being skipped', () => {
    // No reading that week is not evidence that the stall continued.
    assert.equal(evaluateRules([STALLED], weeks(-50, undefined, -20)).length, 0);
  });

  test('evaluates as at a given week, ignoring later ones', () => {
    const all = weeks(-50, -20, -600, -600);
    assert.equal(evaluateRules([STALLED], all, '2026-09-14').length, 1);
    assert.equal(evaluateRules([STALLED], all).length, 0);
  });

  test('returns every match, most severe first', () => {
    const under: WeeklyMetrics[] = [
      { weekStart: '2026-09-07', weeklyAvgChangeG: -600, trackedDaysPct: 40 },
      { weekStart: '2026-09-14', weeklyAvgChangeG: -600, trackedDaysPct: 40 },
    ];
    const matched = evaluateRules([TOO_FAST, TRACKING], under);
    assert.equal(matched.length, 2);
    assert.equal(matched[0]!.rule.id, 'tracking', 'fix the data before the calories');
    assert.equal(matched[1]!.rule.id, 'too-fast');
  });

  test('records which weeks satisfied the rule', () => {
    const matched = evaluateRules([STALLED], weeks(-400, -50, -20));
    assert.deepEqual(matched[0]!.weeks, ['2026-09-14', '2026-09-21']);
  });

  test('no weeks, no matches', () => {
    assert.deepEqual(evaluateRules([ON_TRACK], []), []);
  });

  test('rejects a malformed rule rather than matching it silently', () => {
    const broken: DecisionRule = { ...ON_TRACK, thresholds: [-350] };
    assert.throws(() => evaluateRules([broken], weeks(-250)), RangeError);
  });
});

describe('phaseCompliance', () => {
  const targets = {
    calorieTarget: 2200,
    targetRateGPerWeek: -250,
    rateToleranceG: 100,
    stepTarget: 10000,
    sessionsPerWeekTarget: 5,
  };

  test('reports gaps, not a score', () => {
    const report = phaseCompliance(targets, {
      avgKcal: 2350,
      trackedDays: 24,
      totalDays: 28,
      avgSteps: 8500,
      sessions: 18,
      weeks: 4,
      actualRateGPerWeek: -180,
    });

    assert.equal(report.kcalVsTarget, 150);
    assert.equal(report.stepsVsTarget, -1500);
    assert.equal(report.sessionsVsTarget, -2);
    assert.ok(Math.abs(report.trackedDaysPct - 85.714) < 0.01);
    assert.equal(report.rateOnTarget, true, '-180 is inside -250 +/- 100');
  });

  test('marks a rate outside the tolerance band', () => {
    const report = phaseCompliance(targets, {
      trackedDays: 28,
      totalDays: 28,
      sessions: 20,
      weeks: 4,
      actualRateGPerWeek: -600,
    });
    assert.equal(report.rateOnTarget, false);
  });

  test('leaves what it does not know undefined rather than guessing zero', () => {
    const report = phaseCompliance(targets, {
      trackedDays: 0,
      totalDays: 0,
      sessions: 0,
      weeks: 0,
    });
    assert.equal(report.kcalVsTarget, undefined);
    assert.equal(report.stepsVsTarget, undefined);
    assert.equal(report.rateOnTarget, undefined);
    assert.equal(report.trackedDaysPct, 0);
  });
});
