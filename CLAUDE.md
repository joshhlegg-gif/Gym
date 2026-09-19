# Gym — engineering contract

A training and body-composition tracker. Replaces a Google Sheet. Personal
tool first, architected so it could open to other users later.

**Read `docs/spec.md` before touching the data model, the calculations module,
the rules engine or any user-facing copy.** It is authoritative and it records
why the platform changed from the original brief.

## The stack

| | |
|---|---|
| Next.js, App Router | React |
| TypeScript strict, `@/*` aliased to the repo root | Supabase Postgres via Drizzle |
| Supabase Auth, email + password | Deployed on Vercel |
| Node's test runner via `tsx --test` | `Australia/Melbourne`, via `APP_TIMEZONE` |

No native app. No HealthKit. Health data arrives from an Apple Shortcut posting
to an authenticated API route — see `docs/spec.md` §3.1.

## Commands

```
npm run typecheck      npm test
```

`npm run dev`, `npm run lint`, `npm run build` and `npm run db:migrate` arrive
with M1, when the Next.js app does.

**Nothing is committed until typecheck and test pass.** Both, every time.

## Architecture

**`lib/calc/` is pure.** No UI, no database, no network, no `Date.now()`, no
reading the clock or the environment. Every input is passed in; every output is
a value. It is the only place calculations live, and it is fully unit tested.

This is the most important rule in the repository. The maths is the product —
a wrong trend or a wrong maintenance estimate is worse than no app, because it
is believed. Views read from this module and never re-derive anything.

- `dates.ts` — day arithmetic. **Days are `YYYY-MM-DD` keys, never `Date`.**
  Melbourne shifts an hour twice a year, so local midnight is not a fixed grid.
  Convert an instant to a key once at the boundary; do all arithmetic on keys.
- `weight.ts` — trend, weekly averages, rate
- `energy.ts` — maintenance estimate
- `rules.ts` — decision-rule evaluation, phase compliance
- `training.ts` — e1RM, progression, records, hard sets
- `constants.ts` — the 7700 kcal/kg approximation, and every other tunable

## Rules the code must not break

1. **Trends over readings.** The smoothed trend and the weekly average are the
   signal. Today's number is shown small.
2. **Interpolated days are never shown as readings.** They exist to keep the
   trend continuous. Marked `interpolated` — respect it.
3. **Untracked days are excluded from maintenance, never treated as zero.** A
   day nobody logged is not a day nobody ate.
4. **Load progression, not tonnage.** Same lift, same set number, session over
   session. Tonnage is never a headline metric.
5. **No false precision.** Maintenance rounds to 25 kcal and always carries a
   margin. A number to the kilocalorie is a lie about what is known.
6. **Rule actions are the user's words.** Never generate, rephrase or soften
   them.
7. **A missing week breaks a consecutive-week run.** No data is not evidence
   that a condition held.
8. **Nothing is gated on elapsed time.** No week labels as progress, no
   time-based unlocks, no streaks counted in days. Training streaks count weeks
   that met the session target.
9. **Archive, never delete.** History has to survive an exercise being retired.
10. **Health data is an optimisation, never a dependency.** Every field the
    Shortcut fills can be typed. Show when data last arrived.

## Secrets

- **Never** print, commit or paste a secret. `.env*` is gitignored;
  `.env.example` carries placeholders only.
- The Supabase **publishable** key is public by design — it ships in the
  browser bundle. The **secret** key is not used by this application at all and
  there is no legitimate reason to ask for it.
- Development runs against local Postgres. Production values are set by Josh in
  the Vercel dashboard.

## Migrations (from M1)

- **Append-only.** Never edit a migration that has been applied anywhere.
- **`npm run build` applies them, and Vercel runs the build.** Merging a
  migration changes production on the next deploy. Treat every migration file
  as a production change.
- **Never add and drop in one migration.** Add, backfill, deploy, verify, drop
  later.
- Row Level Security on every table, and every query also filters by owner.
  Two layers, on purpose.

## Australian English

`-ise`, `-our`. Kilograms, centimetres, kilojoules never (kcal throughout,
because that is what the trackers report).

## Working style

Direct and substantive. Ship the smallest complete thing and retrofit rather
than building the general case first. If the schema contradicts the spec, say
so — do not silently resolve it.

## Current milestone

**M0 — Foundations: complete.** Calculations module, 95 tests, spec, this file.
**M1 — Daily log + dashboard** is next: Next.js app, Supabase schema, auth,
weigh-in, trend chart, weekly table.
