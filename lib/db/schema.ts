import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Two layers protect this data and both are load-bearing.
 *
 * Supabase publishes `public` over PostgREST to the publishable key, which
 * ships in every browser bundle. Migration 0000 enables row level security
 * with no policies at all, which denies that path outright while leaving the
 * table owner — the connection this app uses — exempt. Every query below then
 * *also* filters by owner. Remove either layer and one signed-in person can
 * read everyone's body data.
 */

export const trackingStatus = pgEnum('tracking_status', ['tracked', 'partial', 'untracked']);
export const weightSource = pgEnum('weight_source', ['manual', 'shortcut']);

/**
 * One row per signed-in person. `id` is the Supabase Auth user id: the auth
 * schema owns identity, this table owns preferences, and they are kept apart
 * so a change to either does not migrate the other.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  heightCm: numeric('height_cm', { precision: 5, scale: 1 }),
  /** 0 = Sunday. Josh's weeks start on Sunday; it stays configurable. */
  weekStartsOn: smallint('week_starts_on').notNull().default(0),
  /** IANA zone deciding which calendar day a reading belongs to. */
  timeZone: text('time_zone').notNull().default('Australia/Melbourne'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per person per calendar day.
 *
 * Everything but the date is nullable on purpose: a day with a weigh-in and no
 * food log is ordinary, not broken. `trackingStatus` is what separates "ate
 * nothing recorded" from "ate nothing" — it is the field the maintenance
 * estimate keys off, and it defaults to untracked so a day only counts once
 * something says it should.
 */
export const dailyLogs = pgTable(
  'daily_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** Stored as a bare date: a weigh-in belongs to a day, not an instant. */
    date: date('date').notNull(),

    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    weightTime: timestamp('weight_time', { withTimezone: true }),
    weightSource: weightSource('weight_source'),

    caloriesKcal: integer('calories_kcal'),
    proteinG: numeric('protein_g', { precision: 6, scale: 1 }),
    carbsG: numeric('carbs_g', { precision: 6, scale: 1 }),
    fatG: numeric('fat_g', { precision: 6, scale: 1 }),
    sodiumMg: integer('sodium_mg'),

    steps: integer('steps'),

    trackingStatus: trackingStatus('tracking_status').notNull().default('untracked'),
    tags: text('tags').array().notNull().default([]),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per person per day. The Shortcut re-sends the last seven days on
    // every run, so ingest upserts onto this constraint rather than inserting.
    unique('daily_logs_owner_date_unique').on(table.ownerId, table.date),
    // Every read is "this person's days, in this range".
    index('daily_logs_owner_date_idx').on(table.ownerId, table.date),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type DailyLogRow = typeof dailyLogs.$inferSelect;
export type NewDailyLogRow = typeof dailyLogs.$inferInsert;
