import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { estimateMaintenance, suggestCalorieTarget } from '../../lib/calc/energy';
import { buildTrend } from '../../lib/calc/weight';
import { addDays } from '../../lib/calc/dates';
import type { DailyLog, TrackingStatus } from '../../lib/calc/types';

/**
 * A window of days losing weight at a steady rate on a steady intake.
 * alpha 1 keeps the trend equal to the readings so the arithmetic is checkable
 * by hand.
 */
function window(options: {
  days: number;
  startKg: number;
  endKg: number;
  kcal: number;
  trackedDays?: number;
  from?: string;
}): DailyLog[] {
  const { days, startKg, endKg, kcal, from = '2026-09-01' } = options;
  const trackedDays = options.trackedDays ?? days;
  const stepKg = (endKg - startKg) / (days - 1);

  return Array.from({ length: days }, (_, i) => {
    const status: TrackingStatus = i < trackedDays ? 'tracked' : 'untracked';
    return {
      date: addDays(from, i),
      weightKg: startKg + i * stepKg,
      caloriesKcal: status === 'tracked' ? kcal : undefined,
      trackingStatus: status,
    };
  });
}

describe('estimateMaintenance', () => {
  test('adds back the energy the body supplied', () => {
    const logs = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1));

    assert.equal(result.kind, 'estimate');
    if (result.kind !== 'estimate') return;

    // 1 kg over 27 days of span = 7700 / 27 = 285 kcal a day of shortfall.
    assert.equal(result.kcal, 2275);
    assert.equal(result.trackedDays, 28);
    assert.ok(Math.abs(result.trendChangeKg + 1) < 1e-9);
  });

  test('a gaining trend puts maintenance below intake', () => {
    const logs = window({ days: 28, startKg: 70, endKg: 71, kcal: 3000 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1));
    assert.equal(result.kind, 'estimate');
    if (result.kind !== 'estimate') return;
    assert.equal(result.kcal, 2725);
  });

  test('a flat trend means intake is maintenance', () => {
    const logs = window({ days: 28, startKg: 70, endKg: 70, kcal: 2400 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1));
    assert.equal(result.kind, 'estimate');
    if (result.kind !== 'estimate') return;
    assert.equal(result.kcal, 2400);
  });

  test('refuses to answer below 70% tracked days', () => {
    const logs = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000, trackedDays: 19 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1));
    assert.equal(result.kind, 'unavailable');
    if (result.kind !== 'unavailable') return;
    assert.equal(result.reason, 'not-enough-tracked-days');
    assert.equal(result.trackedDays, 19);
  });

  test('answers at exactly the 70% floor', () => {
    // 70% of 28 is 19.6, so 20 tracked days clears it.
    const logs = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000, trackedDays: 20 });
    assert.equal(estimateMaintenance(logs, buildTrend(logs, 1)).kind, 'estimate');
  });

  test('rounds to 25 kcal rather than claiming precision', () => {
    const logs = window({ days: 28, startKg: 71, endKg: 70.3, kcal: 2137 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1));
    assert.equal(result.kind, 'estimate');
    if (result.kind !== 'estimate') return;
    assert.equal(result.kcal % 25, 0);
    assert.equal(result.marginKcal % 25, 0);
    assert.ok(result.marginKcal >= 25, 'never claims a zero-width range');
  });

  test('a noisier intake widens the margin', () => {
    const steady = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000 });
    const noisy = steady.map((l, i) => ({
      ...l,
      caloriesKcal: l.caloriesKcal === undefined ? undefined : 2000 + (i % 2 === 0 ? -900 : 900),
    }));

    const a = estimateMaintenance(steady, buildTrend(steady, 1));
    const b = estimateMaintenance(noisy, buildTrend(noisy, 1));
    assert.equal(a.kind, 'estimate');
    assert.equal(b.kind, 'estimate');
    if (a.kind !== 'estimate' || b.kind !== 'estimate') return;
    assert.ok(b.marginKcal > a.marginKcal, `${b.marginKcal} should exceed ${a.marginKcal}`);
  });

  test('says so when there is no weight data at all', () => {
    const result = estimateMaintenance([], []);
    assert.equal(result.kind, 'unavailable');
    if (result.kind !== 'unavailable') return;
    assert.equal(result.reason, 'not-enough-weight-readings');
  });

  test('rejects a window too short to mean anything', () => {
    const logs = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000 });
    const result = estimateMaintenance(logs, buildTrend(logs, 1), { windowDays: 7 });
    assert.equal(result.kind, 'unavailable');
    if (result.kind !== 'unavailable') return;
    assert.equal(result.reason, 'window-too-short');
  });

  test('only looks inside the window', () => {
    const older = window({ days: 28, startKg: 80, endKg: 79, kcal: 4000, from: '2026-07-01' });
    const recent = window({ days: 28, startKg: 71, endKg: 70, kcal: 2000, from: '2026-09-01' });
    const logs = [...older, ...recent];

    const result = estimateMaintenance(logs, buildTrend(logs, 1), { asOf: '2026-09-28' });
    assert.equal(result.kind, 'estimate');
    if (result.kind !== 'estimate') return;
    assert.equal(result.meanIntakeKcal, 2000, 'July has no bearing on September');
  });
});

describe('suggestCalorieTarget', () => {
  test('a cut subtracts the target rate', () => {
    // 250 g a week is 1925 kcal a week, 275 a day.
    assert.equal(suggestCalorieTarget(2500, -250), 2225);
  });

  test('a lean bulk adds it', () => {
    assert.equal(suggestCalorieTarget(2500, 250), 2775);
  });

  test('maintenance holds', () => {
    assert.equal(suggestCalorieTarget(2500, 0), 2500);
  });
});
