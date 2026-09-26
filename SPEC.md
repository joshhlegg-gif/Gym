# Personal Gym Logger — Alpha Build Spec

## 1. Product objective

Build a **private, single-user gym logging web app for Josh**.

This is not a consumer product.

Priorities, in order:

1. Extremely fast workout logging on a phone.
2. Reliable structured historical data.
3. Easy visibility of previous performance while training.
4. Bodyweight + phase tracking.
5. Enough context to explain interruptions such as illness, injury and holidays.
6. Data must be directly queryable from Supabase by external AI tools.
7. Minimal maintenance and ideally $0/month.

Do not optimise for visual polish, general users, scalability, onboarding or commercialisation.

---

# 2. Existing infrastructure

Use the existing Supabase project:

**Gym App**

Existing public tables:

- `profiles`
- `daily_logs`

Both already have RLS enabled.

`daily_logs` already includes fields for:

- date
- weight
- calories
- protein
- carbs
- fat
- sodium
- steps
- tags
- notes
- tracking status

Preserve these tables unless there is a strong technical reason to migrate them.

Do not create Turso or another database.

---

# 3. Technical stack

Use:

- Next.js App Router
- TypeScript
- Supabase Postgres
- Supabase Auth
- `@supabase/supabase-js`
- `@supabase/ssr`
- Vercel
- GitHub

Styling:

- reuse whatever styling system already exists in the repo;
- otherwise use very simple Tailwind or plain CSS;
- do not spend meaningful effort on aesthetics.

The UI should be:

- mobile-first;
- fast;
- dense;
- large enough to tap during a workout;
- minimal navigation;
- minimal confirmation dialogs.

Prefer boring, maintainable code over abstractions.

---

# 4. Authentication and privacy

This app contains private personal data.

Use Supabase Auth.

Only Josh needs an account.

Requirements:

- login page;
- no public sign-up UI;
- authenticated routes only;
- all user-owned database tables contain `owner_id`;
- RLS restricts rows to `auth.uid() = owner_id`;
- never expose the service-role/secret key to the browser;
- use the current Supabase SSR cookie-based auth pattern;
- protect server routes as well as pages.

Run Supabase security advisors after schema changes.

---

# 5. Core conceptual model

Keep these concepts separate:

**Phase**
= nutritional / body-composition / broad training objective over a date range.

**Program**
= the current training split/program over a date range.

**Workout Template**
= a reusable workout such as Push A, Pull A, Lower.

**Workout Session**
= an actual performed workout on a date.

**Exercise**
= an exercise identity.

**Set**
= an actual performed set.

Relationship:

`Phase`
and
`Program → Workout Template → Workout Session → Exercise → Set`

alongside:

`Daily Log / Bodyweight`

and:

`Life Event`

A phase and a program are independent.

Example:

Josh can remain in a 12-week lean-gain phase while changing from Push/Pull/Legs to Upper/Lower midway through it.

---

# 6. Database schema

## profiles

Keep existing table.

---

## daily_logs

Keep existing table.

Use initially for:

- `date`
- `weight_kg`
- `calories_kcal`
- existing notes/tags

Do not delete the existing nutrition fields even if they are not prominently used in alpha.

There should be at most one daily log per owner/date.

---

## phases

Fields:

- `id`
- `owner_id`
- `name`
- `start_date`
- `end_date` nullable
- `nutrition_goal`
- `training_goal`
- `target_calories_kcal` nullable
- `estimated_maintenance_kcal` nullable
- `target_rate_kg_per_week` nullable
- `notes`
- timestamps

Suggested `nutrition_goal` values:

- fat_loss
- mini_cut
- maintenance
- gain
- custom

Suggested `training_goal` values:

- hypertrophy
- strength
- maintain
- general
- custom

Only one phase should normally be active on a given date, but do not make the database fragile if historical overlaps exist.

---

## programs

Fields:

- `id`
- `owner_id`
- `name`
- `start_date`
- `end_date` nullable
- `notes`
- timestamps

Examples:

- PPL 2026
- Push Pull Lower v2
- Upper Lower

---

## exercises

Fields:

- `id`
- `owner_id`
- `name`
- `notes`
- `archived`
- timestamps

Exercise names are user-defined.

Do not require a predefined exercise library.

Examples:

- Barbell Bench Press
- V-Bar Row
- Single-Arm Supinated Pulldown

---

## workout_templates

Fields:

- `id`
- `owner_id`
- `program_id` nullable
- `name`
- `position`
- `archived`
- timestamps

Examples:

- Push
- Pull
- Lower
- Push #2

---

## template_exercises

Fields:

- `id`
- `template_id`
- `exercise_id`
- `position`
- `target_sets`
- `rep_min` nullable
- `rep_max` nullable
- `default_rest_seconds`
- `notes`

This describes planned workout structure, not performed data.

---

## workout_sessions

Fields:

- `id`
- `owner_id`
- `template_id` nullable
- `program_id` nullable
- `phase_id` nullable
- `started_at`
- `ended_at` nullable
- `status`
- `notes`
- `source` nullable
- `source_ref` nullable
- `needs_review` boolean default false
- timestamps

Statuses:

- active
- completed
- abandoned

A session must remain valid even if the original template is later edited.

---

## session_exercises

Fields:

- `id`
- `session_id`
- `exercise_id`
- `position`
- `notes`

This snapshots which exercises actually occurred in a session.

---

## workout_sets

Fields:

- `id`
- `session_exercise_id`
- `set_number`
- `set_type`
- `weight_kg` nullable
- `reps` nullable
- `rir` nullable
- `completed_at` nullable
- `notes` nullable
- `source_ref` nullable
- `needs_review` boolean default false
- timestamps

Set types:

- warmup
- working
- backoff
- drop
- rest_pause

Do not hard-code a fixed number of sets.

---

## life_events

Fields:

- `id`
- `owner_id`
- `phase_id` nullable
- `type`
- `title`
- `start_date`
- `end_date` nullable
- `notes`
- timestamps

Types:

- illness
- injury
- holiday
- travel
- deload
- diet_break
- stress
- other

Purpose: explain periods where compliance, performance, calorie intake or bodyweight data are unusual.

---

# 7. Main navigation

Keep navigation extremely small.

Suggested bottom/mobile navigation:

- **Today**
- **Train**
- **History**
- **Body**
- **Setup**

No nested menu architecture unless necessary.

---

# 8. Today screen

Display only useful current information.

Show:

### Current phase

- phase name
- nutrition goal
- training goal
- target calories
- estimated maintenance calories

### Bodyweight

- latest bodyweight
- current 7-day average
- previous 7-day average
- change between them

### Training

- sessions completed this week
- current program
- easy button to start a workout
- active unfinished workout if one exists

### Context

Show any current active life event such as:

> Illness — 22 Sep to present

No complex dashboard charts required in alpha.

---

# 9. Workout setup

User must be able to:

- create programs;
- create unlimited workout templates;
- create custom exercises;
- add exercises to templates;
- reorder exercises;
- configure target set count;
- configure target rep range;
- configure default rest time;
- add notes.

Editing a template must never modify historical completed sessions.

---

# 10. Starting a workout

Flow:

1. Tap **Train**.
2. Choose workout template.
3. Tap **Start**.
4. Session is immediately created.
5. Workout logger opens.

If an active unfinished session already exists, prominently offer:

**Resume workout**

Do not make the user repeatedly confirm actions.

---

# 11. Workout logger

This is the most important screen.

Optimise for use between sets.

Each exercise should show:

- exercise name;
- planned rep range;
- rest target;
- previous-session performance;
- current set rows.

Each set row should have:

- set type;
- weight;
- reps;
- optional RIR;
- complete button/check.

Fast actions:

- add set;
- delete set;
- duplicate previous set;
- change set type;
- add exercise during workout;
- skip an exercise;
- reorder if necessary.

Autosave edits.

Refreshing or closing the page must not destroy the workout.

---

# 12. Previous-performance feature

This is critical.

When logging an exercise, fetch the most recent completed session containing the same exercise.

Display something like:

**Last time — 6 Sep**

1. 70 × 9
2. 70 × 7
3. 60 × 9

For the current set row, visually emphasise the corresponding previous set.

Example:

Current Set 2

> Previous: **70 kg × 7**

Matching should primarily use:

1. same exercise;
2. same set type when possible;
3. same ordinal within that set type.

Do not require the old workout template to be identical.

---

# 13. Rest timer

When a completed working/backoff/etc. set is logged:

- automatically start rest timer;
- use the template exercise's default rest duration;
- show timer persistently while workout remains open.

Controls:

- pause
- resume
- reset
- +30 seconds
- dismiss

Timer expiry should produce a browser notification/sound/vibration where practical.

Do not persist every timer tick to the database.

Store timer state client-side using an end timestamp so refreshes can reconstruct the remaining time.

Timer must never block logging the next set early.

---

# 14. Bodyweight

Allow very fast daily weight entry.

Body screen should show:

- calendar/list of daily weights;
- 7-day average;
- previous 7-day average;
- simple time-series graph;
- current phase boundaries if easy to implement.

Missing days are fine.

Do not interpolate missing weigh-ins.

Weekly averages should use available weigh-ins, not assume missing values.

Use the profile's configured week start for calendar weekly averages.

---

# 15. Phase management

Allow:

- create phase;
- edit phase;
- close phase;
- historical phases;
- calorie target;
- maintenance estimate;
- nutrition goal;
- training goal;
- target rate of bodyweight change;
- notes.

Changing a calorie target later must not rewrite historical phases.

If a target changes materially within the same phase, either:

- allow a dated target change, or
- end the current phase and create a new one.

For alpha, choose whichever implementation is simpler and preserves history correctly.

---

# 16. Life events / diary

Provide a quick way to add context:

Examples:

- flu
- shoulder irritation
- Malaysia holiday
- wedding weekend
- bad sleep week
- deliberate deload

Fields:

- title
- type
- start date
- optional end date
- optional linked phase
- notes

Show events:

- in chronological history;
- on phase detail;
- alongside the bodyweight timeline if simple.

This is contextual information, not a medical system.

---

# 16A. Body measurements

Add a simple body-measurement logging system.

Create a `body_measurements` table with:

- `id`
- `owner_id`
- `date`
- `chest_cm` nullable
- `waist_cm` nullable
- `left_arm_cm` nullable
- `right_arm_cm` nullable
- `left_thigh_cm` nullable
- `right_thigh_cm` nullable
- `left_calf_cm` nullable
- `right_calf_cm` nullable
- `notes` nullable
- timestamps

For alpha, the UI should make it easy to enter a measurement session on one screen.

Display:

- latest measurement;
- previous measurement;
- change since previous;
- simple historical trend for each measurement;
- measurement dates alongside phase history where practical.

Do not require every field to be entered each time.

Prefer preserving left/right measurements separately in the database even if the UI optionally offers a single “Arm”, “Thigh”, or “Calf” value for convenience.

The system should support historical corrections.

Add body measurements to the **Body** screen alongside bodyweight.

The Body screen should therefore contain:

1. latest bodyweight;
2. 7-day average bodyweight;
3. bodyweight history;
4. body-measurement history;
5. current phase;
6. recent measurement changes.

Body measurements are part of the detailed fitness source of truth in Supabase and should be available to authorised AI tools for longitudinal analysis.

---

# 17. History

Workout history should allow:

- view completed sessions chronologically;
- open any historical session;
- edit erroneous historical values;
- delete accidental records;
- search/filter by exercise.

Exercise history should show:

- dates;
- sets;
- weight;
- reps;
- optional RIR.

No advanced analytics required initially.

---

# 18. Legacy GYM Google Sheet migration

Do **not** implement Google OAuth or a live Google Sheets integration in alpha.

ChatGPT already has access to the existing **GYM** Google spreadsheet.

A separate process will convert that spreadsheet into normalized JSON.

The app must provide a safe importer for that JSON.

Create either:

- an authenticated `/import` admin screen;
- and/or a script such as `scripts/import-gym-json.ts`.

Preferred: script plus minimal import page if easy.

Expected import format should support:

```json
{
  "dailyLogs": [],
  "phases": [],
  "events": [],
  "sessions": []
}
```

A session contains nested exercises and sets.

Example shape:

```json
{
  "date": "2026-09-06",
  "templateName": "Push",
  "notes": null,
  "sourceRef": "Push2026#2:row18",
  "needsReview": false,
  "exercises": [
    {
      "name": "BB Bench",
      "notes": null,
      "sets": [
        {
          "setType": "working",
          "weightKg": 70,
          "reps": 9
        },
        {
          "setType": "working",
          "weightKg": 70,
          "reps": 7
        },
        {
          "setType": "backoff",
          "weightKg": 60,
          "reps": 9
        }
      ]
    }
  ]
}
```

Importer requirements:

- validate JSON before writing;
- dry-run/preview counts where practical;
- reuse existing exercises by normalized name;
- do not silently invent missing data;
- allow `needsReview=true`;
- preserve source references;
- make imports idempotent using source references where possible;
- never overwrite newer manually-entered data without explicit action.

Ambiguous historical spreadsheet values should remain flagged rather than guessed.

---

# 19. Data correction

Historical records must be editable.

This is mandatory because existing source data contains mistakes.

Allow correction of:

- workout date;
- exercise;
- weight;
- reps;
- set type;
- bodyweight;
- phase assignment;
- event dates.

Do not treat imported historical data as immutable.

---

# 20. Data access for AI

Supabase is the detailed fitness source of truth.

Do not build a special AI API in alpha.

The database schema should be straightforward enough for external tools with authorised Supabase access to query:

- sessions;
- sets;
- exercises;
- bodyweight;
- phases;
- life events.

Use intuitive table/column names.

Avoid storing important structured information only inside arbitrary JSON blobs.

---

# 21. Notion integration

Not required for first alpha launch.

Design the system so a later feature can generate a compact `FitnessState` summary containing:

- current phase;
- current program;
- calorie target;
- maintenance estimate;
- latest weight;
- 7-day average;
- recent training frequency;
- active injury/illness/event;
- current goal.

That summary can later be synced to the Life OS in Notion.

Do not sync every workout or set to Notion.

Supabase remains the detailed source of truth.

---

# 22. Explicitly out of scope for alpha

Do NOT implement:

- MyFitnessPal integration;
- Cronometer integration;
- live Google Sheets sync;
- food database;
- meal tracking;
- barcode scanning;
- AI coaching;
- automatic program generation;
- sophisticated fatigue modelling;
- muscle-volume analytics;
- social features;
- multiple users;
- payments;
- subscriptions;
- public profiles;
- achievement gamification;
- extensive animations;
- design-system work;
- native mobile apps;
- Apple Health / Google Fit;
- wearables;
- photo tracking;
- push-notification infrastructure.

Do not add features merely because they are common in gym apps.

---

# 23. Alpha acceptance criteria

Alpha is complete when Josh can:

1. Sign in securely.
2. Create a phase.
3. Create a program.
4. Create custom exercises.
5. Create workout templates.
6. Start a workout.
7. Log warm-up, working, back-off, drop and rest-pause sets.
8. See previous performance while logging each exercise.
9. Use an automatic rest timer.
10. Resume an interrupted active workout.
11. Complete the workout.
12. View workout history.
13. Edit historical mistakes.
14. Enter daily bodyweight.
15. See 7-day bodyweight averages.
16. Record contextual events such as illness/injury/holiday.
17. Import normalized historical JSON from the old GYM spreadsheet.
18. Have all persistent fitness data stored in Supabase behind RLS.
19. Deploy successfully to Vercel.
20. Use the application comfortably from a phone.
21. Record chest, waist, arm, thigh and calf measurements and view their historical change.

---

# 24. Implementation order

Do this in order.

## Step 1 — inspect before rewriting

Inspect the existing repository and current Supabase schema.

Preserve working code.

Do not regenerate the application from scratch unless the existing code is clearly unusable.

## Step 2 — database

Create migrations for the new schema.

Add RLS policies.

Preserve `profiles` and `daily_logs`.

Verify policies with authenticated test queries.

## Step 3 — authentication

Finish secure Supabase Auth and route protection.

## Step 4 — setup CRUD

Implement:

- exercises
- phases
- programs
- workout templates

Do not polish heavily.

## Step 5 — workout logger

Implement the complete session logging flow first.

This is the core product.

## Step 6 — previous performance

Implement previous-session querying and inline display.

## Step 7 — timer

Implement client-side rest timer.

## Step 8 — bodyweight

Implement fast weight entry + weekly averages.

## Step 9 — events

Implement contextual diary/life events.

## Step 10 — history/editing

Implement history and correction.

## Step 11 — migration importer

Implement normalized JSON import.

## Step 12 — dashboard

Add only the minimal Today summary.

## Step 13 — deployment verification

Deploy to Vercel.

Verify on mobile viewport.

Verify:

- login;
- RLS;
- new workout;
- refresh/resume;
- previous performance;
- timer;
- bodyweight;
- import;
- historical correction.

---

# 25. Development philosophy

This is a personal instrument, not a startup.

Prefer:

- 3 taps instead of 6;
- plain controls instead of pretty controls;
- explicit database fields instead of abstraction;
- simple SQL instead of complex architecture;
- one obvious workflow instead of configurability;
- fast iteration instead of perfect UX.

When deciding whether to add something, ask:

> Does this make Josh's actual training logging or later analysis materially easier?

If not, do not build it.
Keep the alpha small enough that it can be finished.