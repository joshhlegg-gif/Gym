import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import {
  bestE1rm,
  compareFirstSet,
  detectPersonalRecords,
  epleyE1rm,
  suggestProgression,
  weeklyHardSets,
  type SetEntry,
  type WorkoutSession,
} from '../../lib/calc/training';

const BENCH = 'bench';
const SQUAT = 'squat';

function set(
  exerciseId: string,
  setIndex: number,
  loadKg: number,
  reps: number,
  extra: Partial<SetEntry> = {},
): SetEntry {
  return { exerciseId, setIndex, loadKg, reps, ...extra };
}

function session(id: string, date: string, sets: SetEntry[]): WorkoutSession {
  return { id, date, sets };
}

describe('epleyE1rm', () => {
  test('projects from submaximal work', () => {
    assert.ok(Math.abs(epleyE1rm(100, 5) - 116.667) < 0.001);
  });

  test('a single is its own one-rep max', () => {
    // Epley would claim 103.3 kg from a 100 kg single, a lift that never happened.
    assert.equal(epleyE1rm(100, 1), 100);
  });

  test('rejects a set of no reps', () => {
    assert.throws(() => epleyE1rm(100, 0), RangeError);
  });
});

describe('bestE1rm', () => {
  test('takes the best working set, not the last', () => {
    const sets = [set(BENCH, 1, 80, 8), set(BENCH, 2, 80, 6), set(BENCH, 3, 70, 10)];
    assert.ok(Math.abs(bestE1rm(sets, BENCH)! - epleyE1rm(80, 8)) < 1e-9);
  });

  test('ignores warm-ups', () => {
    const sets = [set(BENCH, 0, 200, 10, { isWarmup: true }), set(BENCH, 1, 80, 5)];
    assert.ok(Math.abs(bestE1rm(sets, BENCH)! - epleyE1rm(80, 5)) < 1e-9);
  });

  test('an exercise not done has no e1RM', () => {
    assert.equal(bestE1rm([set(BENCH, 1, 80, 5)], SQUAT), undefined);
  });
});

describe('compareFirstSet', () => {
  const previous = session('s1', '2026-09-07', [set(BENCH, 1, 80, 8), set(BENCH, 2, 80, 7)]);

  test('compares set one against set one', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 80, 9), set(BENCH, 2, 75, 6)]);
    const result = compareFirstSet(current, [previous, current], BENCH)!;

    assert.equal(result.previous!.reps, 8, 'set one of the previous session');
    assert.equal(result.repChange, 1);
    assert.equal(result.loadChangeKg, 0);
    assert.equal(result.improved, true);
  });

  test('more load is an improvement even on fewer reps', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 85, 6)]);
    const result = compareFirstSet(current, [previous, current], BENCH)!;
    assert.equal(result.improved, true);
  });

  test('same load and fewer reps is not', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 80, 6)]);
    assert.equal(compareFirstSet(current, [previous, current], BENCH)!.improved, false);
  });

  test('reaches past a session that skipped the lift', () => {
    const skipped = session('s2', '2026-09-10', [set(SQUAT, 1, 100, 5)]);
    const current = session('s3', '2026-09-14', [set(BENCH, 1, 82.5, 8)]);
    const result = compareFirstSet(current, [previous, skipped, current], BENCH)!;
    assert.equal(result.previous!.loadKg, 80);
  });

  test('the first ever session has nothing to compare against', () => {
    const first = session('s1', '2026-09-07', [set(BENCH, 1, 80, 8)]);
    const result = compareFirstSet(first, [first], BENCH)!;
    assert.equal(result.previous, undefined);
    assert.equal(result.improved, undefined);
  });

  test('an exercise absent from this session gives nothing', () => {
    const current = session('s2', '2026-09-14', [set(SQUAT, 1, 100, 5)]);
    assert.equal(compareFirstSet(current, [previous, current], BENCH), undefined);
  });

  test('ignores sessions later than this one', () => {
    const later = session('s3', '2026-09-21', [set(BENCH, 1, 100, 10)]);
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 80, 9)]);
    const result = compareFirstSet(current, [previous, current, later], BENCH)!;
    assert.equal(result.previous!.loadKg, 80);
  });
});

describe('suggestProgression', () => {
  const range = { min: 8, max: 12 };

  test('takes the load up once every set earned the top of the range', () => {
    const last = [set(BENCH, 1, 60, 12), set(BENCH, 2, 60, 12), set(BENCH, 3, 60, 12)];
    const next = suggestProgression(last, range, 2.5);

    assert.equal(next.loadKg, 62.5);
    assert.equal(next.targetReps, 8, 'back to the bottom of the range');
    assert.equal(next.reason, 'increase-load');
  });

  test('holds the load and chases the weakest set', () => {
    const last = [set(BENCH, 1, 60, 12), set(BENCH, 2, 60, 10), set(BENCH, 3, 60, 9)];
    const next = suggestProgression(last, range, 2.5);

    assert.equal(next.loadKg, 60);
    assert.equal(next.reason, 'add-reps');
    assert.equal(next.weakestSetReps, 9);
    assert.equal(next.targetReps, 10);
  });

  test('never suggests a target past the top of the range', () => {
    const last = [set(BENCH, 1, 60, 12), set(BENCH, 2, 60, 11)];
    assert.equal(suggestProgression(last, range, 2.5).targetReps, 12);
  });

  test('overshooting the top still counts as earning it', () => {
    const last = [set(BENCH, 1, 60, 14), set(BENCH, 2, 60, 13)];
    assert.equal(suggestProgression(last, range, 2.5).reason, 'increase-load');
  });

  test('judges only the sets at the working load', () => {
    const last = [set(BENCH, 0, 40, 5, { isWarmup: true }), set(BENCH, 1, 60, 12), set(BENCH, 2, 60, 12)];
    assert.equal(suggestProgression(last, range, 2.5).reason, 'increase-load');
  });

  test('a lift never done starts at the bottom of the range', () => {
    const next = suggestProgression([], range, 2.5);
    assert.equal(next.reason, 'first-time');
    assert.equal(next.targetReps, 8);
  });

  test('respects a heavier increment for machines', () => {
    const last = [set(BENCH, 1, 60, 12)];
    assert.equal(suggestProgression(last, range, 5).loadKg, 65);
  });
});

describe('detectPersonalRecords', () => {
  const history = [
    session('s1', '2026-09-07', [set(BENCH, 1, 80, 5), set(BENCH, 2, 75, 8)]),
  ];

  test('finds a load record at a rep count', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 85, 5)]);
    const kinds = detectPersonalRecords(current, [...history, current]).map((r) => r.kind);
    assert.ok(kinds.includes('load-at-reps'));
    assert.ok(kinds.includes('e1rm'));
  });

  test('a first-time rep count is a load record', () => {
    // 80x3 is lighter than the best e1RM, but three reps has never been done.
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 80, 3)]);
    const records = detectPersonalRecords(current, [...history, current]);
    assert.deepEqual(records.map((r) => r.kind), ['load-at-reps']);
  });

  test('matching an old best is not beating it', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 80, 5)]);
    assert.deepEqual(detectPersonalRecords(current, [...history, current]), []);
  });

  test('warm-ups cannot set records', () => {
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 200, 5, { isWarmup: true })]);
    assert.deepEqual(detectPersonalRecords(current, [...history, current]), []);
  });

  test('records are per exercise', () => {
    const current = session('s2', '2026-09-14', [set(SQUAT, 1, 60, 5)]);
    const records = detectPersonalRecords(current, [...history, current]);
    assert.equal(records.length, 2, 'a first squat is both kinds of record');
    assert.ok(records.every((r) => r.exerciseId === SQUAT));
  });

  test('does not count later sessions as history', () => {
    const later = session('s3', '2026-09-21', [set(BENCH, 1, 200, 5)]);
    const current = session('s2', '2026-09-14', [set(BENCH, 1, 85, 5)]);
    assert.ok(detectPersonalRecords(current, [...history, current, later]).length > 0);
  });
});

describe('weeklyHardSets', () => {
  const attribution = {
    [BENCH]: { primary: ['chest'], secondary: ['triceps', 'frontDelt'] },
    [SQUAT]: { primary: ['quads'], secondary: ['glutes'] },
  };

  test('counts a primary muscle whole and a secondary half', () => {
    const sessions = [
      session('s1', '2026-09-07', [set(BENCH, 1, 80, 8), set(BENCH, 2, 80, 8)]),
      session('s2', '2026-09-09', [set(SQUAT, 1, 100, 5)]),
    ];
    const totals = weeklyHardSets(sessions, attribution);

    assert.equal(totals.chest, 2);
    assert.equal(totals.triceps, 1);
    assert.equal(totals.frontDelt, 1);
    assert.equal(totals.quads, 1);
    assert.equal(totals.glutes, 0.5);
  });

  test('warm-ups are not hard sets', () => {
    const sessions = [session('s1', '2026-09-07', [set(BENCH, 0, 40, 10, { isWarmup: true })])];
    assert.deepEqual(weeklyHardSets(sessions, attribution), {});
  });

  test('an unattributed exercise is skipped rather than crashing', () => {
    const sessions = [session('s1', '2026-09-07', [set('mystery-lift', 1, 50, 10)])];
    assert.deepEqual(weeklyHardSets(sessions, attribution), {});
  });
});
