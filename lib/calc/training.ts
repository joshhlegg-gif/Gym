import type { DayKey } from './dates';
import { compareDays } from './dates';

/**
 * Progression is judged set against matching set, session against session.
 * Tonnage is deliberately absent: it rewards doing more work rather than
 * better work, and it can be driven up by adding junk sets while every lift
 * stalls.
 */

export interface SetEntry {
  exerciseId: string;
  setIndex: number;
  loadKg: number;
  reps: number;
  rir?: number;
  isWarmup?: boolean;
}

export interface WorkoutSession {
  id: string;
  date: DayKey;
  sets: SetEntry[];
}

export interface RepRange {
  min: number;
  max: number;
}

export const workingSetsOf = (sets: SetEntry[]): SetEntry[] => sets.filter((s) => !s.isWarmup);

/**
 * Epley. One rep is returned as-is: the formula is a projection from submaximal
 * work, and applying it to a single would claim a lift 3% heavier than the one
 * that actually happened.
 */
export function epleyE1rm(loadKg: number, reps: number): number {
  if (reps < 1) throw new RangeError(`reps must be at least 1: ${reps}`);
  if (reps === 1) return loadKg;
  return loadKg * (1 + reps / 30);
}

export function bestE1rm(sets: SetEntry[], exerciseId: string): number | undefined {
  const candidates = workingSetsOf(sets)
    .filter((s) => s.exerciseId === exerciseId)
    .map((s) => epleyE1rm(s.loadKg, s.reps));
  return candidates.length === 0 ? undefined : Math.max(...candidates);
}

export interface SetComparison {
  exerciseId: string;
  current: SetEntry;
  previous?: SetEntry;
  loadChangeKg?: number;
  repChange?: number;
  /** True when load went up, or held with more reps. */
  improved?: boolean;
}

function firstWorkingSet(session: WorkoutSession, exerciseId: string): SetEntry | undefined {
  return workingSetsOf(session.sets)
    .filter((s) => s.exerciseId === exerciseId)
    .sort((a, b) => a.setIndex - b.setIndex)[0];
}

/**
 * Set one against set one. The first working set is the honest comparison:
 * later sets carry the fatigue of whatever came before them, which varies with
 * sleep, order and how the day went.
 */
export function compareFirstSet(
  current: WorkoutSession,
  history: WorkoutSession[],
  exerciseId: string,
): SetComparison | undefined {
  const currentSet = firstWorkingSet(current, exerciseId);
  if (!currentSet) return undefined;

  const previousSession = history
    .filter((s) => s.id !== current.id && compareDays(s.date, current.date) < 0)
    .filter((s) => firstWorkingSet(s, exerciseId) !== undefined)
    .sort((a, b) => compareDays(b.date, a.date))[0];

  const previousSet = previousSession ? firstWorkingSet(previousSession, exerciseId) : undefined;
  if (!previousSet) return { exerciseId, current: currentSet };

  const loadChangeKg = currentSet.loadKg - previousSet.loadKg;
  const repChange = currentSet.reps - previousSet.reps;

  return {
    exerciseId,
    current: currentSet,
    previous: previousSet,
    loadChangeKg,
    repChange,
    improved: loadChangeKg > 0 || (loadChangeKg === 0 && repChange > 0),
  };
}

export interface ProgressionSuggestion {
  loadKg: number;
  targetReps: number;
  reason: 'increase-load' | 'add-reps' | 'first-time';
  /** The set to beat, when the suggestion is to add reps. */
  weakestSetReps?: number;
}

/**
 * Double progression: earn the top of the rep range on every working set, then
 * take the load up and start again at the bottom. Otherwise hold the load and
 * chase one more rep on the set that is furthest behind.
 */
export function suggestProgression(
  lastSets: SetEntry[],
  repRange: RepRange,
  loadIncrementKg: number,
): ProgressionSuggestion {
  const working = workingSetsOf(lastSets);
  if (working.length === 0) {
    return { loadKg: 0, targetReps: repRange.min, reason: 'first-time' };
  }

  const load = Math.max(...working.map((s) => s.loadKg));
  const atLoad = working.filter((s) => s.loadKg === load);
  const allAtTop = atLoad.every((s) => s.reps >= repRange.max);

  if (allAtTop) {
    return {
      loadKg: load + loadIncrementKg,
      targetReps: repRange.min,
      reason: 'increase-load',
    };
  }

  const weakest = Math.min(...atLoad.map((s) => s.reps));
  return {
    loadKg: load,
    targetReps: Math.min(weakest + 1, repRange.max),
    reason: 'add-reps',
    weakestSetReps: weakest,
  };
}

export interface PersonalRecord {
  exerciseId: string;
  kind: 'load-at-reps' | 'e1rm';
  loadKg: number;
  reps: number;
  e1rmKg: number;
  date: DayKey;
}

/**
 * A load PR is the heaviest that rep count has ever been done for; an e1RM PR
 * is the best projected single. They are separate because a five-rep PR at a
 * load you have never touched is worth knowing even when the projection says
 * you were stronger on a different day.
 */
export function detectPersonalRecords(
  session: WorkoutSession,
  history: WorkoutSession[],
): PersonalRecord[] {
  const earlier = history.filter(
    (s) => s.id !== session.id && compareDays(s.date, session.date) < 0,
  );
  const records: PersonalRecord[] = [];

  const bestLoadAtReps = new Map<string, number>();
  const bestE1rmByExercise = new Map<string, number>();

  for (const past of earlier) {
    for (const set of workingSetsOf(past.sets)) {
      const repKey = `${set.exerciseId}:${set.reps}`;
      bestLoadAtReps.set(repKey, Math.max(bestLoadAtReps.get(repKey) ?? 0, set.loadKg));
      bestE1rmByExercise.set(
        set.exerciseId,
        Math.max(bestE1rmByExercise.get(set.exerciseId) ?? 0, epleyE1rm(set.loadKg, set.reps)),
      );
    }
  }

  for (const set of workingSetsOf(session.sets)) {
    const e1rm = epleyE1rm(set.loadKg, set.reps);
    const repKey = `${set.exerciseId}:${set.reps}`;
    const base = { exerciseId: set.exerciseId, loadKg: set.loadKg, reps: set.reps, e1rmKg: e1rm, date: session.date };

    if (set.loadKg > (bestLoadAtReps.get(repKey) ?? 0)) {
      records.push({ ...base, kind: 'load-at-reps' });
      bestLoadAtReps.set(repKey, set.loadKg);
    }
    if (e1rm > (bestE1rmByExercise.get(set.exerciseId) ?? 0)) {
      records.push({ ...base, kind: 'e1rm' });
      bestE1rmByExercise.set(set.exerciseId, e1rm);
    }
  }

  return records;
}

export interface MuscleAttribution {
  primary: string[];
  secondary: string[];
}

/**
 * Hard sets per muscle, the unit weekly volume is actually judged in. A
 * secondary muscle counts half: the triceps in a bench press are working, but
 * not the way they work in a pushdown.
 */
export function weeklyHardSets(
  sessions: WorkoutSession[],
  attribution: Record<string, MuscleAttribution>,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const session of sessions) {
    for (const set of workingSetsOf(session.sets)) {
      const muscles = attribution[set.exerciseId];
      if (!muscles) continue;
      for (const muscle of muscles.primary) totals[muscle] = (totals[muscle] ?? 0) + 1;
      for (const muscle of muscles.secondary) totals[muscle] = (totals[muscle] ?? 0) + 0.5;
    }
  }

  return totals;
}
