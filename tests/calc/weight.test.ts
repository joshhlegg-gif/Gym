import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { buildTrend, trendRate, weeklyAverages, waistToHeightRatio } from '../../lib/calc/weight';
import type { DailyLog } from '../../lib/calc/types';
import { addDays } from '../../lib/calc/dates';

function log(date: string, weightKg?: number, extra: Partial<DailyLog> = {}): DailyLog {
  return { date, weightKg, trackingStatus: 'tracked', ...extra };
}

/** A run of days starting at `from`, weight rising by `stepKg` each day. */
function ramp(from: string, days: number, startKg: number, stepKg: number): DailyLog[] {
  return Array.from({ length: days }, (_, i) => log(addDays(from, i), startKg + i * stepKg));
}

describe('buildTrend', () => {
  test('no readings gives no trend', () => {
    assert.deepEqual(buildTrend([]), []);
    assert.deepEqual(buildTrend([log('2026-09-19', undefined)]), []);
  });

  test('a single reading is its own trend', () => {
    const trend = buildTrend([log('2026-09-19', 71.2)]);
    assert.equal(trend.length, 1);
    assert.equal(trend[0]!.trendKg, 71.2);
    assert.equal(trend[0]!.interpolated, false);
  });

  test('lags a step change rather than following it', () => {
    const logs = [
      ...Array.from({ length: 5 }, (_, i) => log(addDays('2026-09-01', i), 70)),
      log('2026-09-06', 75),
    ];
    const trend = buildTrend(logs, 0.1);
    const last = trend[trend.length - 1]!;
    // A 5 kg jump moves a 0.1-alpha trend by 0.5 kg, not 5.
    assert.ok(last.trendKg > 70.4 && last.trendKg < 70.6, `got ${last.trendKg}`);
  });

  test('fills gaps and marks them, without inventing readings', () => {
    const logs = [log('2026-09-01', 70), log('2026-09-05', 74)];
    const trend = buildTrend(logs);

    assert.equal(trend.length, 5, 'series is continuous across the gap');
    assert.deepEqual(
      trend.map((p) => p.interpolated),
      [false, true, true, true, false],
    );
    assert.equal(trend[0]!.readingKg, 70);
    assert.equal(trend[1]!.readingKg, undefined, 'a filled day carries no reading');
    assert.equal(trend[4]!.readingKg, 74);
  });

  test('interpolates in a straight line between bracketing readings', () => {
    const trend = buildTrend([log('2026-09-01', 70), log('2026-09-05', 74)], 1);
    // alpha 1 means the trend is the (filled) input, so the ramp is visible.
    assert.deepEqual(
      trend.map((p) => Number(p.trendKg.toFixed(6))),
      [70, 71, 72, 73, 74],
    );
  });

  test('rejects an alpha outside (0, 1]', () => {
    assert.throws(() => buildTrend([log('2026-09-01', 70)], 0), RangeError);
    assert.throws(() => buildTrend([log('2026-09-01', 70)], 1.5), RangeError);
  });
});

describe('trendRate', () => {
  test('recovers a known slope', () => {
    // 100 g a day is 700 g a week. alpha 1 so the trend is the raw ramp.
    const trend = buildTrend(ramp('2026-09-01', 28, 70, 0.1), 1);
    const rate = trendRate(trend, 28);
    assert.ok(Math.abs(rate.gramsPerWeek - 700) < 1, `got ${rate.gramsPerWeek}`);
    assert.equal(rate.sampleCount, 28);
  });

  test('reports loss as a negative rate', () => {
    const trend = buildTrend(ramp('2026-09-01', 28, 75, -0.05), 1);
    assert.ok(trendRate(trend, 28).gramsPerWeek < 0);
  });

  test('a flat trend has no rate', () => {
    const trend = buildTrend(ramp('2026-09-01', 14, 70, 0), 1);
    assert.equal(trendRate(trend, 14).gramsPerWeek, 0);
  });

  test('only looks at the trailing window', () => {
    const logs = [...ramp('2026-09-01', 14, 70, 0.5), ...ramp('2026-09-15', 14, 77, 0)];
    const trend = buildTrend(logs, 1);
    const recent = trendRate(trend, 14);
    assert.ok(Math.abs(recent.gramsPerWeek) < 1, 'the flat fortnight, not the climb before it');
  });

  test('degrades quietly when there is almost no data', () => {
    assert.deepEqual(trendRate([], 14), { gramsPerWeek: 0, windowDays: 14, sampleCount: 0 });
    const single = buildTrend([log('2026-09-19', 71)]);
    assert.equal(trendRate(single, 14).sampleCount, 1);
    assert.equal(trendRate(single, 14).gramsPerWeek, 0);
  });

  test('rejects a window too short to fit a line to', () => {
    assert.throws(() => trendRate([], 1), RangeError);
  });
});

describe('weeklyAverages', () => {
  test('averages only the days that have readings', () => {
    const logs = [log('2026-09-14', 70), log('2026-09-16', 72), log('2026-09-18', undefined)];
    const [week] = weeklyAverages(logs);
    assert.equal(week!.averageKg, 71);
    assert.equal(week!.readingCount, 2);
  });

  test('flags a week built on too few readings', () => {
    const thin = weeklyAverages([log('2026-09-14', 70), log('2026-09-15', 70)]);
    assert.equal(thin[0]!.lowConfidence, true);

    const full = weeklyAverages(
      Array.from({ length: 4 }, (_, i) => log(addDays('2026-09-14', i), 70)),
    );
    assert.equal(full[0]!.lowConfidence, false);
  });

  test('reports week-on-week change in grams', () => {
    const logs = [log('2026-09-14', 70), log('2026-09-21', 70.25)];
    const weeks = weeklyAverages(logs);
    assert.equal(weeks[0]!.changeG, undefined, 'the first week has nothing to compare to');
    assert.ok(Math.abs(weeks[1]!.changeG! - 250) < 1e-6);
  });

  test('excludes untracked days from the intake average but still counts them', () => {
    const logs = [
      log('2026-09-14', 70, { caloriesKcal: 2000, trackingStatus: 'tracked' }),
      log('2026-09-15', 70, { caloriesKcal: 9000, trackingStatus: 'untracked' }),
      log('2026-09-16', 70, { caloriesKcal: 2200, trackingStatus: 'tracked' }),
    ];
    const [week] = weeklyAverages(logs);
    assert.equal(week!.averageKcal, 2100, 'the untracked blowout is not evidence');
    assert.equal(week!.trackedDays, 2);
    assert.equal(week!.untrackedDays, 1);
  });

  test('emits empty weeks so a gap reads as a gap', () => {
    const weeks = weeklyAverages([log('2026-09-07', 70), log('2026-09-28', 71)]);
    assert.equal(weeks.length, 4);
    assert.equal(weeks[1]!.averageKg, undefined);
    assert.equal(weeks[1]!.readingCount, 0);
  });

  test('carries the last known average across an empty week', () => {
    const weeks = weeklyAverages([log('2026-09-07', 70), log('2026-09-21', 70.5)]);
    // Week 2 is empty; week 3 compares against week 1, not against nothing.
    assert.ok(Math.abs(weeks[2]!.changeG! - 500) < 1e-6);
  });

  test('buckets to Sunday by default', () => {
    assert.equal(weeklyAverages([log('2026-09-19', 70)])[0]!.weekStart, '2026-09-13');
  });

  test('respects a configured Monday start', () => {
    const mondayWeeks = weeklyAverages([log('2026-09-19', 70)], 1);
    assert.equal(mondayWeeks[0]!.weekStart, '2026-09-14');
  });

  test('a Saturday and the Sunday after it are different weeks', () => {
    // Under a Monday start these two would average together and the change
    // would read as zero. Under Sunday they are a week apart.
    const weeks = weeklyAverages([log('2026-09-19', 70), log('2026-09-20', 70.4)]);
    assert.equal(weeks.length, 2);
    assert.ok(Math.abs(weeks[1]!.changeG! - 400) < 1e-6);
  });

  test('no logs, no weeks', () => {
    assert.deepEqual(weeklyAverages([]), []);
  });
});

describe('waistToHeightRatio', () => {
  test('divides waist by height', () => {
    assert.ok(Math.abs(waistToHeightRatio(80, 175) - 0.4571) < 0.0001);
  });

  test('rejects a nonsense height', () => {
    assert.throws(() => waistToHeightRatio(80, 0), RangeError);
  });
});
