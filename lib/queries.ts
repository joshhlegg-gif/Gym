import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from './db';
import { dailyLogs, profiles, type DailyLogRow } from './db/schema';
import type { DailyLog, TrackingStatus } from './calc/types';
import type { DayKey, Weekday } from './calc/dates';

/**
 * Every function here takes an ownerId and every query filters on it.
 *
 * That is not belt-and-braces over row level security, it is the layer that
 * actually runs: the app connects as the table owner, which RLS exempts. RLS
 * closes the PostgREST path; this closes the application path. Neither is
 * optional and neither covers for the other.
 */

/** Postgres numerics come back as strings to avoid float drift. */
function num(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toDailyLog(row: DailyLogRow): DailyLog {
  return {
    date: row.date,
    weightKg: num(row.weightKg),
    caloriesKcal: row.caloriesKcal ?? undefined,
    proteinG: num(row.proteinG),
    carbsG: num(row.carbsG),
    fatG: num(row.fatG),
    sodiumMg: row.sodiumMg ?? undefined,
    steps: row.steps ?? undefined,
    trackingStatus: row.trackingStatus as TrackingStatus,
    tags: row.tags,
  };
}

export interface Profile {
  id: string;
  email: string;
  heightCm?: number;
  weekStartsOn: Weekday;
  timeZone: string;
}

/** Creates the row on first sign-in rather than needing a separate step. */
export async function getOrCreateProfile(userId: string, email: string): Promise<Profile> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);

  const row =
    existing ??
    (
      await db
        .insert(profiles)
        .values({ id: userId, email })
        .onConflictDoNothing()
        .returning()
    )[0] ??
    (await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1))[0]!;

  return {
    id: row.id,
    email: row.email,
    heightCm: num(row.heightCm),
    weekStartsOn: row.weekStartsOn as Weekday,
    timeZone: row.timeZone,
  };
}

export async function getLogsBetween(
  ownerId: string,
  from: DayKey,
  to: DayKey,
): Promise<DailyLog[]> {
  const rows = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.ownerId, ownerId), gte(dailyLogs.date, from), lte(dailyLogs.date, to)))
    .orderBy(asc(dailyLogs.date));

  return rows.map(toDailyLog);
}

export async function getLog(ownerId: string, date: DayKey): Promise<DailyLog | undefined> {
  const [row] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.ownerId, ownerId), eq(dailyLogs.date, date)))
    .limit(1);

  return row ? toDailyLog(row) : undefined;
}

export interface DayUpdate {
  weightKg?: number | null;
  caloriesKcal?: number | null;
  steps?: number | null;
  trackingStatus?: TrackingStatus;
  notes?: string | null;
}

/**
 * Upsert a single day.
 *
 * Keyed on (owner, date) so the Apple Shortcut can re-send the last seven days
 * on every run without creating duplicates — food is often logged late, and a
 * re-send has to correct the day rather than add to it.
 */
export async function upsertDay(
  ownerId: string,
  date: DayKey,
  update: DayUpdate,
  source: 'manual' | 'shortcut' = 'manual',
): Promise<void> {
  const fields = {
    weightKg: update.weightKg === undefined ? undefined : update.weightKg?.toString() ?? null,
    weightTime: update.weightKg === undefined || update.weightKg === null ? undefined : new Date(),
    weightSource: update.weightKg === undefined || update.weightKg === null ? undefined : source,
    caloriesKcal: update.caloriesKcal,
    steps: update.steps,
    trackingStatus: update.trackingStatus,
    notes: update.notes,
    updatedAt: new Date(),
  };

  const defined = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  );

  await db
    .insert(dailyLogs)
    .values({ ownerId, date, ...defined })
    .onConflictDoUpdate({
      target: [dailyLogs.ownerId, dailyLogs.date],
      set: defined,
    });
}
