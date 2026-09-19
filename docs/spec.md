# Training & Body Composition App — product spec

**Status:** authoritative. Revised 19 September 2026 from the original brief.

Replaces a colour-coded Google Sheet: daily weigh-ins, weekly averages, calories
and a training log. The sheet works, but every number is typed by hand, phases
are just cell colours with no link between intent and outcome, maintenance
calories are guessed rather than calculated, and training history cannot be
queried. Friction produces gaps, and gaps are what has historically stalled
progress.

**Primary goal:** make the right data effortless to capture and the signal
obvious at a glance.
**Secondary goal:** encode the user's own decision rules, so the app reports
what the plan already said to do rather than leaving each phase decision to how
he feels that day.

---

## What changed from the original brief, and why

The original brief specified a native iOS app: SwiftUI, SwiftData, HealthKit,
local-first, no backend. That followed from one assumption — that the app would
only ever run on an iPhone.

**That assumption no longer holds.** Data entry is needed on iPhone, Mac *and*
a Windows PC. A native iOS app cannot run on Windows, and making it work would
mean building the iOS app, a web app, and a backend to reconcile them. Data on
three platforms has to live on a server.

So §3, §4, §10 and §11 are rewritten. Everything else — the design principles,
the data model, the calculations, the screens — survives intact, because none
of it depended on the platform.

| | Original | Now |
|---|---|---|
| Platform | Native iOS | Web app, installable to the home screen |
| Persistence | SwiftData, on device | Supabase Postgres |
| Health data | HealthKit, read directly | Apple Shortcuts POSTing to an API |
| Cost | $149/yr eventually | $0 |
| Calculations module | Pure Swift package | Pure TypeScript module — unchanged in spirit |

**What was given up:** health data arrives once a day rather than continuously,
and the Shortcut is a chain with more links than a direct HealthKit read. The
app treats it as an optimisation, never a dependency — any day can be filled in
by hand, and the UI shows when data last arrived so a silently dead automation
is visible rather than mysterious.

**What was gained:** it runs everywhere, it costs nothing, there is no 7-day
provisioning expiry, and multi-user is a natural extension rather than a rebuild.

---

## 1. Design principles (non-negotiable)

These come from the user's own lessons after 8+ months of logging. They are
requirements, not preferences.

1. **Trends over readings.** Daily weight is noise; weekly averages and a
   smoothed trend are the signal. The trend line and weekly average are
   prominent; today's single reading is deliberately secondary.
2. **Load progression, not tonnage.** Compare the same lift, same set number,
   week over week. Tonnage is not a headline metric — it rewards more work
   rather than better work.
3. **Pre-committed rules beat reactive decisions.** Each phase stores its own
   decision rules. The app evaluates them and reports the result.
4. **Finish phases.** Ending or changing a phase early is possible but
   deliberate: show phase progress and the current rule evaluation, and require
   a short reason, before confirming.
5. **Tracking quality is explicit.** A day is `tracked`, `partial` or
   `untracked`. Untracked days are excluded from maintenance calculations and
   visibly marked.
6. **Input must be near-zero friction.** Weigh-in ≤ 2 taps. Logging a set that
   matches the suggestion = 1 tap. Anything obtainable automatically is never
   typed.
7. **Private by default.** Body and health data is the user's. Row Level
   Security on every table, and every query also filters by owner.

---

## 2. Stack

| Decision | Choice | Reason |
|---|---|---|
| Platform | Web, installable (PWA) | Runs on iPhone, Mac and PC from one codebase |
| Framework | Next.js, App Router | Same stack the user already ships |
| Persistence | Supabase Postgres via Drizzle | Free tier; multi-device by construction |
| Auth | Supabase Auth, email + password | Multi-user ready without being multi-user yet |
| Hosting | Vercel | Free tier; deploys on push |
| Charts | To be chosen at M1 | Prefer the smallest thing that draws a line and a band |
| Health data | Apple Shortcuts → authenticated API route | The only free, sanctioned route off the phone |
| Timezone | `Australia/Melbourne`, via `APP_TIMEZONE` | Server rendering runs in UTC; without this a late-evening weigh-in files against tomorrow |

**Architecture rule, carried over unchanged from the original brief and the most
important thing in this document:** every calculation — trend, weekly averages,
maintenance estimate, rule evaluation, progression suggestions — lives in
`lib/calc/`, a pure module with no UI, no database and no network. Fully unit
tested. Views read from it. This is what keeps the maths trustworthy and
portable.

---

## 3. Integrations

### 3.1 Nutrition — via Apple Health, never a tracker's private API

MyFitnessPal's API has been closed to new developers since 2019, and scraping it
with session cookies is fragile and against their terms. Cronometer is the
user's preferred tracker and syncs more to Apple Health than MFP does: calories,
all macros, sodium and micronutrients.

**The chain:** Cronometer (or MFP, or MacroFactor) → Apple Health → a daily
Apple Shortcut → this app's API.

Because every tracker writes to Apple Health, switching tracker is a setting in
*that* app, not a code change here. Model the intake source behind a
`NutritionSource` boundary so a direct integration or a manual entry can be
added without disturbing anything else.

Read from Health via the Shortcut:
- dietary energy (kcal), protein, carbohydrates, total fat
- sodium — useful for explaining water-weight spikes
- step count (daily sum)
- body mass, if a smart scale writes it

Behaviour:
- Aggregate per calendar day in `Australia/Melbourne`.
- Today's intake is provisional until the day ends. Show it as "so far".
- The Shortcut re-sends the previous 7 days on each run, because food is often
  logged or edited late. The API is idempotent per day.
- Tracking status defaults to `tracked` when intake > 0 and `untracked` at 0.
  The user can override to `partial` or `untracked`.
- **The Shortcut is an optimisation, not a dependency.** Every field it fills
  can be typed. The UI surfaces when data last arrived.

### 3.2 Offline entry

Sets logged without a connection are written to the browser's own storage
immediately and synced when the connection returns. The gym case is a flaky
signal mid-set, not a permanent absence of one — the requirement is that no
tap is ever lost, not that the whole app works offline indefinitely.

### 3.3 One-off import from the existing Google Sheet

Export to CSV, pick the file, map the columns (date, weight, calories, notes,
phase). Phase colours will not survive CSV export, so allow phases to be
recreated by date range on the timeline. Training history import is a stretch
goal — spike the sheet's structure first and then decide.

---

## 4. Data model

All entities carry `id` (uuid), `createdAt`, `updatedAt` and an owner.

### DailyLog (one per date, per owner)
`date` (unique per owner) · `weightKg?` · `weightTime?` · `weightSource`
(`manual` | `shortcut`) · `caloriesKcal?` · `proteinG?` · `carbsG?` · `fatG?` ·
`sodiumMg?` · `steps?` · `trackingStatus` (`tracked` | `partial` | `untracked`)
· `tags[]` (`travel`, `sick`, `event`, `refeed`, `highSodium`, custom) · `notes?`

### Measurement
`date` · `waistCm?` (at navel, relaxed — defined in-app with a tooltip) ·
`chestCm?` · `armCm?` · `thighCm?` · optional `neckCm` / `hipsCm` /
`shouldersCm` (hidden unless enabled) · `photoRefs[]?` · `notes?`
Derived: waist-to-height, using `UserProfile.heightCm`.

### Phase
`type` (`leanBulk` | `cut` | `miniCut` | `maintenance` | `reverseDiet` |
`dietBreak`) · `name` · `startDate` · `plannedEndDate?` · `endCondition?` (free
text — some phases end on a condition, not a date) · `actualEndDate?` ·
`endReason?` (required when ending early) · `calorieTarget` · macro targets ·
`targetRateGPerWeek` (negative for a cut) · `rateToleranceG` · `stepTarget` ·
`sessionsPerWeekTarget` · `splitId?` · `rules[]` · colour derived from type.

Phases do not overlap. Days outside any phase show as "no phase".

### DecisionRule
`metric` (`weeklyAvgChangeG` | `trendRateGPerWeek` | `waistChangeCm` |
`sessionsPerWeek` | `avgSteps` | `trackedDaysPct`) · `comparator` (`<` | `>` |
`between`) · `thresholds[]` · `consecutiveWeeks` · `action` (written by the
user, never generated) · `severity` (`info` | `adjust` | `review`)

Seed rules for a cut at −250 g/week:
- weekly change between −350 and −150 g → "On track, no change"
- change > −100 g for 2 consecutive weeks → "Drop 100–150 kcal or add 1,500 steps"
- change < −500 g for 2 consecutive weeks → "Add 100–150 kcal"
- tracked days < 5 in a week → "Fix tracking before changing calories"

### Exercise
`name` · `movementPattern` · `primaryMuscles[]` / `secondaryMuscles[]` ·
`equipment` · `availableAt[]` (`home` | `commercial`) · `role`
(`strength` | `hypertrophy`) · `defaultRepRange` · `loadIncrementKg` ·
`isFavourite` · `isArchived` (never delete — history must survive) · `notes?`

### Split, WorkoutTemplate, WorkoutSession, SetEntry
**Split:** ordered templates. Mode `rotation` (next session = next in list) or
`weekday`. Default rotation, because it survives missed days.
**WorkoutTemplate:** ordered `TemplateExercise` (exercise, target sets, rep
range override, rest seconds, notes, superset group).
**WorkoutSession:** date, template?, location, start/end, notes, bodyweight
snapshot.
**SetEntry:** session, exercise, `setIndex`, `loadKg`, `reps`, `rir?` (0–5),
`isWarmup`, `notes?`.

### UserProfile
`heightCm` (175) · sex · birth year · units · week start day (**Sunday** —
settled 19 Sep 2026; configurable, and every weekly calculation takes it as a
parameter rather than assuming it) ·
preferred weigh-in time · measurement reminder interval.

Personal defaults live in seed data and settings. Never hard-coded.

---

## 5. Calculations — all in `lib/calc/`, all unit tested

1. **Trend weight:** EWMA, α ≈ 0.1. Missing days interpolated for the trend
   only, never shown as readings.
2. **Weekly average:** mean of available readings; weeks under 4 readings
   flagged low confidence.
3. **Weekly change:** this week's average − last week's, in grams.
4. **Rate:** least-squares slope of the trend over trailing 14 and 28 days, in
   g/week.
5. **Estimated maintenance**, the headline number:
   `mean(intake on tracked days) − (Δtrend_kg × 7700 / days)` over 21–28 days.
   Tracked days only; requires ≥ 70% tracked or it reports "not enough data".
   Rounded to 25 kcal with a confidence margin. Charted over time — rising
   maintenance is a stated goal. 7700 is one commented constant.
6. **Phase compliance:** per week and phase-to-date. Reports gaps, not a score.
7. **Rule evaluation:** weekly. Returns every match, most severe first.
8. **Training:** Epley e1RM (a single returns itself); set-1 vs set-1 against
   the previous session; double progression; PR detection (load-at-reps and
   e1RM, separately); weekly hard sets per muscle (primary 1, secondary 0.5).
9. **Waist-to-height ratio.**

---

## 6. Screens

**Today** — weigh-in card (prefilled with yesterday, ±0.1 stepper, save in one
tap; trend and weekly average beneath, today's raw number smaller); intake card
with "so far" state and tracking toggle; steps vs target; next workout in
rotation; phase banner; measurement nudge when due.

**Dashboard** — bodyweight chart (faint daily dots, bold trend, phase colour
bands; 4w/12w/6m/1y/all); weekly table tinted by phase; estimated maintenance
and its history chart; waist trend; e1RM sparklines for key lifts; sessions this
week vs target, and a streak counted in weeks meeting the target, never days.

**Periodisation timeline** — year and week-list views, phases as bands. Phase
CRUD including rules. Starting a phase suggests a calorie target from current
maintenance ± target rate. Ending early requires a reason and shows progress,
current rule evaluation and the last two weeks first.

**Weekly review** — generated at week end. Average weight and Δ, rate vs target,
intake vs target, tracked days, steps, sessions, lifts that progressed or
stalled, measurements, and the rule result with its action. Marked reviewed,
with an optional note. Browsable history. This is the decision point that
replaces ad-hoc daily reactions.

**Workout logger** — start from rotation, any template, or empty. Location
picker filters exercise swaps by available equipment. Per exercise: last
session's sets inline, today's suggestion, rows prefilled — tap to accept. Rest
timer. Mid-session edits never overwrite the template unless explicitly saved.
Autosave every set; survives a reload or a dropped connection. Finish →
summary with PRs, set-1 comparisons and next-time suggestions.

**Exercise library** · **Template & split builder** · **Measurements** ·
**Settings** (profile, units, week start, Shortcut setup and sync status,
reminders, CSV + JSON export, CSV import).

---

## 7. Friction targets (acceptance criteria)

- Weigh-in via Siri or a home-screen Shortcut without opening the app.
- Weigh-in in-app: ≤ 2 taps, ≤ 5 seconds.
- Logging a set that matches the suggestion: 1 tap.
- Starting today's workout from launch: ≤ 2 taps.
- No manual entry of steps or calories when the Shortcut has run.
- Measurement entry: ≤ 30 seconds for all four sites.
- No tap lost to a dropped connection.

---

## 8. Seed exercise library

Home gym: cable machine (low/mid/high), squat rack, adjustable bench, barbell +
bumpers, EZ bar, fixed dumbbells 10–30 kg in 2.5 kg steps.

**Push:** barbell bench press (strength), incline DB press, seated DB shoulder
press, standing barbell OHP (strength), machine chest press, cable fly, DB
lateral raise, cable lateral raise, overhead cable triceps extension, triceps
pushdown, EZ-bar skull crusher, dips.
**Pull:** pull-up/chin-up, lat pulldown, chest-supported row, barbell row,
seated cable row, single-arm DB row, face pull, rear-delt cable fly, EZ-bar
curl, incline DB curl, cable curl, hammer curl.
**Legs:** back squat (strength, 3–6 reps, low back limits — keep well short of
failure), leg press, Bulgarian split squat, Romanian deadlift, leg curl, leg
extension, hip thrust, standing calf raise.
**Core:** cable crunch, hanging leg raise.

Seed split: PPL-UL rotation, with extra shoulder and arm volume on both Push/Pull
and Upper days.

---

## 9. Milestones

Each ends in something usable and a git tag.

- **M0 — Foundations.** Calculations module with tests. CLAUDE.md. Spec. *(done)*
- **M1 — Daily log + dashboard.** Auth, schema, weigh-in, manual calories and
  steps, trend, weekly averages and table, bodyweight chart. *This alone
  replaces the bodyweight half of the sheet. Stop and use it for a week.*
- **M2 — Shortcuts bridge.** Authenticated ingest route, idempotent per day,
  7-day re-send. A written setup guide for the Shortcut. Sync status in the UI.
- **M3 — Phases.** Timeline, phase CRUD, colour bands, compliance, maintenance estimate.
- **M4 — Rules + weekly review.**
- **M5 — Training.** Library, templates, split rotation, logger with last-session
  display and suggestions, offline-safe set capture, exercise history.
- **M6 — Measurements + photos.**
- **M7 — Import/export.** Sheet CSV import, full CSV/JSON export.
- **M8 — Low-friction extras.** Home-screen install, Siri weigh-in Shortcut,
  rest timer, reminders.

### Later
Multi-user. Native companion app, if the Shortcut chain proves too fragile.
AI weekly-review narrative — the calculations module computes the facts, a model
only explains them.

---

## 10. Out of scope for v1

Food logging and food databases (Cronometer does this). Social features. Body
fat estimation from photos. Native mobile apps. Any scraping of a tracker's
private API — ever.

---

## 11. Open questions

1. RIR per set: log it, or keep it optional and hidden?
2. Progress photos in v1, or defer to M6?
3. Smart scale writing to Apple Health, or always manual weigh-ins?
4. Arm and thigh: one side or both?
5. Subjective tracking — mind-muscle connection, mental state, cravings — was
   raised as a later addition. Design one annotation mechanism rather than four
   bespoke fields, and build it no earlier than M5. Note that RPE and RIR are
   the same measurement (RPE 8 ≡ 2 RIR); log one.
