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
- **Timeline**
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

### Empty-session lifecycle

Opening/starting a workout is not, by itself, evidence that a workout was actually performed.

- An active session with **zero logged sets** is a disposable draft.
- Empty draft sessions must not count toward completed workouts, training frequency, volume, adherence, history, Timeline workout records, or future analytics.
- If the user abandons an active session with zero logged sets, delete that empty session rather than preserving it as an abandoned workout.
- Once at least one set has been logged, the session is a real training record: abandoning it should preserve its data with `status = abandoned`.
- Merely leaving an empty active session open may still allow **Resume workout**; this does not make it a completed/performed workout.

Refreshing or closing the page must not destroy the workout.

---

## Workout logger interaction design

The workout logger must be visually optimized for rapid between-set use, not merely expose all available actions.

Each exercise should read as one clear block with this visual hierarchy:

1. exercise name;
2. target reps and rest target;
3. compact previous-performance reference;
4. current set rows;
5. one obvious new-set entry row and **Log set** action.

### Set rows

Current sets should use clearly delineated rows/controls.

Each row should make these values immediately distinguishable:

- set number;
- set type;
- weight;
- reps;
- RIR;
- corresponding previous performance where available.

Weight, reps, RIR and set-type entry controls must have visible boundaries and labels/placeholders. Avoid visually ambiguous bare browser inputs.

Secondary actions such as delete/duplicate should not visually compete with the primary logging flow. Prefer compact secondary controls or an unobtrusive action area.

Do not repeat previous-session information in multiple confusing forms. Keep enough context to compare the current set with the corresponding previous set, while avoiding unnecessary duplication.

### Primary logging action

There must be one visually obvious **Log set** button associated with the new-set entry row.

The logger should be comfortable to operate one-handed on a phone with large enough tap targets.

### Rest timer editing

Continue to start the rest timer automatically after a successful set log/duplicate using the exercise's configured rest target.

In addition to pause/resume/reset/+30/dismiss, allow the user to edit the active timer duration/remaining time directly using a simple control.

Do not require navigating away from the workout or editing the workout template just to change the current rest timer.

This is a session-local timer adjustment; do not persist timer ticks or ad-hoc timer changes to Supabase.

Do not turn this UX work into a general design-system project.

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

In addition to the current-versus-previous 7-day summary, provide a **historical rolling 7-day average bodyweight series** across the recorded bodyweight history.

For each calendar date with sufficient context to display a point, calculate the average of all available weigh-ins from that date and the preceding 6 calendar days:

- use whatever weigh-ins actually exist in that 7-calendar-day window;
- do not interpolate missing days;
- do not treat missing days as zero;
- the rolling series should update day by day rather than only producing one value per calendar week;
- show the rolling-average trend over time on the Body screen;
- preserve access to the underlying raw weigh-ins;
- where Timeline/day detail displays a 7-day average, use this same rolling-window definition.

The purpose is to make long-term smoothed bodyweight change visible, not merely compare the current week with the previous week.

Use the profile's configured week start for calendar weekly averages where calendar-week summaries are used; the rolling 7-day series itself is independent of week boundaries.

---

## Body history visualisation and phase-rate comparison

The Body screen should make longitudinal body-composition change easy to interpret, not merely list records.

### Bodyweight graph

The bodyweight graph should:

- show raw bodyweight points over time;
- show the historical rolling 7-day average as the primary smoothed trend;
- have visible date/time-axis context and weight-axis values so the graph can be interpreted precisely;
- allow tapping/clicking or otherwise focusing a point to reveal its exact date and value;
- work on touch devices as well as desktop;
- avoid requiring a chart library if the existing lightweight SVG approach can support this cleanly.

### Measurement history

Do not present measurement history only as a dense text list.

Provide an orderly historical view that makes change in an individual measurement easy to follow over time.

For alpha, a simple metric selector is sufficient. It should allow viewing trends for:

- chest;
- waist;
- left bicep;
- right bicep;
- left thigh;
- right thigh;
- left calf;
- right calf.

The selected measurement trend should show:

- date on the x-axis;
- measurement in cm on the y-axis;
- exact date/value on tap/click/focus.

Preserve the underlying historical list/correction access.

### Comparison overlays

Where practical without introducing a charting framework, allow the body-history graph to layer useful context:

- bodyweight / rolling 7-day bodyweight trend;
- the selected body measurement;
- phase boundaries or phase labels.

Because kilograms and centimetres use different units, do not misleadingly plot them against one unlabeled shared numeric scale. Use clearly labelled separate scales, normalized visual comparison, or separate aligned tracks—whichever is simplest and remains interpretable.

Phase context should make it visually apparent which period of the graph belongs to which phase.

Do not add speculative correlations or claim that a phase caused a measurement/bodyweight change.

### Actual versus targeted bodyweight rate

When an active or historical phase has `target_rate_kg_per_week`, show the actual observed bodyweight rate alongside the target.

For alpha, define **actual phase rate** using the rolling 7-day average:

- identify the earliest rolling 7-day average available on or after the phase start;
- identify the latest rolling 7-day average available within the phase (or through today for an active phase);
- divide the change in those averages by elapsed calendar weeks between those two average dates;
- display the signed result in kg/week;
- compare it descriptively with the phase's stored target rate;
- if there is insufficient bodyweight history or too little elapsed time for a meaningful calculation, show that the actual rate is not yet available rather than guessing.

Do not infer missing weigh-ins and do not create a predictive weight-loss model.

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

Preserve left/right limb measurements separately in the database and make bilateral entry a first-class part of the normal measurement form.

The normal alpha measurement form should directly support:

- chest;
- waist;
- left arm / bicep;
- right arm / bicep;
- left thigh;
- right thigh;
- left calf;
- right calf.

Do not assume the two sides are equal. A convenience “both sides” value may exist, but it must not replace or obscure the left/right fields.

Example valid measurement session:

- Chest: 99 cm
- Waist: 87.25 cm
- Left bicep/arm: 32 cm
- Right bicep/arm: 31.5 cm
- Left thigh: 56.5 cm
- Right thigh: 55 cm

The UI and historical display should preserve and show these asymmetric values independently.

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

# 17A. Unified fitness timeline

The app should provide one chronological view that reconstructs Josh's fitness context at a point in time without requiring navigation across separate feature pages.

This is a **read-oriented projection over the existing structured source-of-truth tables**, not a new persistence model.

Do not create a `timeline_entries` table and do not duplicate workouts, bodyweight, nutrition, phases, measurements, or life events into another store.

## Purpose

The timeline should answer questions such as:

> What was going on with my training and body composition in May 2026?

and, for a specific date:

> What did I weigh, what phase was I in, what was affecting me, what training did I do, what nutrition did I record, and what were my latest measurements?

The goal is temporal context, not analytics.

## Timeline sources

Compose the timeline from the existing tables:

- `daily_logs` — bodyweight, calories, macros, tracking status, notes/tags where available;
- `workout_sessions` + session exercises + sets — training performed;
- `phases` — the phase active on that date and its targets/goals;
- `life_events` — events active on or beginning/ending around that date;
- `body_measurements` — measurement sessions.

Keep these tables independent. The timeline only joins/presents them.

## Main History / Timeline screen

The existing **History** destination should become the main unified **Timeline** view.

For alpha:

- default to a recent chronological feed;
- allow choosing/navigating to a month;
- group information by calendar date;
- newest-first is acceptable;
- show only dates that contain a recorded event/data point, rather than generating hundreds of empty days;
- clearly show ongoing phase/life-event context on relevant dated entries where practical.

Each dated entry should compactly show available information such as:

- bodyweight;
- calorie/macro/tracking-status data;
- workout name and exercise summary;
- body measurements;
- phase name, nutrition goal and calorie target;
- active/relevant life events.

Do not show empty categories merely to fill space.

## Day detail

A dated timeline entry should link to a simple day-detail view.

The day detail should assemble all available context for that date:

1. **Phase**
   - active phase;
   - nutrition goal;
   - training goal;
   - target calories;
   - estimated maintenance where available.

2. **Body**
   - bodyweight recorded that day;
   - body measurements recorded that day;
   - 7-day bodyweight average if simple to derive using existing logic.

3. **Nutrition / daily log**
   - calories and existing macro fields when present;
   - tracking status;
   - daily notes/tags where present.
   - If tracking status explicitly indicates food was not tracked, show that rather than treating missing calories as zero.

4. **Training**
   - workout session(s) on that date;
   - exercises and sets;
   - links to existing historical workout correction screens where useful.

5. **Context**
   - life events whose date range includes that date;
   - events beginning or ending that date should naturally appear.

## Temporal semantics

- A phase is active on a date when `start_date <= date` and `end_date` is null or `end_date >= date`.
- A life event is active using the same inclusive date-range rule.
- Bodyweight/nutrition/daily logs belong to their explicit `date`.
- Body measurements belong to their explicit `date`.
- Workout sessions belong to the local calendar date represented by `started_at`; use the app/user timezone rather than accidentally shifting late-night workouts across dates.
- Do not interpolate missing measurements, weights, nutrition, or workouts.
- Do not infer that missing nutrition means zero intake.
- Do not fabricate state for dates without data.

## Navigation and existing pages

Keep specialized pages because they remain useful for entry and management:

- **Train** for live workout logging;
- **Body** for bodyweight and measurement entry/trends;
- **Setup** for phases/programs/templates/exercises;
- **Diary** for creating/editing life events.

However, **Timeline** should be the primary place for reviewing longitudinal history.

The existing workout-history filtering/editing functionality may remain available as a focused subview or be linked from Timeline. Do not remove working historical-correction functionality merely to consolidate the UI.

## Scope limits

For alpha, do NOT add:

- a new timeline database table;
- denormalized timeline records;
- full-text search infrastructure;
- analytics dashboards;
- correlations or causal claims;
- AI-generated summaries;
- calendar heatmaps;
- infinite-scroll infrastructure;
- complex filtering systems;
- editable everything directly inside the timeline.

Prefer server-side queries and simple composition of existing data.

The timeline is successful when Josh can navigate to a month/date and understand the major recorded dimensions of his fitness state without visiting several separate pages.

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
22. Navigate a unified fitness timeline by month/date and view the recorded training, body, nutrition, phase and life-event context together.

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