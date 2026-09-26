-- Personal Gym Logger alpha. Existing `profiles` and `daily_logs` are intentionally preserved.

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  nutrition_goal text not null check (nutrition_goal in ('fat_loss', 'mini_cut', 'maintenance', 'gain', 'custom')),
  training_goal text not null check (training_goal in ('hypertrophy', 'strength', 'maintain', 'general', 'custom')),
  target_calories_kcal integer,
  estimated_maintenance_kcal integer,
  target_rate_kg_per_week numeric(5,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, normalized_name)
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  name text not null,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null default 0,
  target_sets integer not null default 3 check (target_sets > 0),
  rep_min integer check (rep_min is null or rep_min > 0),
  rep_max integer check (rep_max is null or rep_max > 0),
  default_rest_seconds integer not null default 120 check (default_rest_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rep_max is null or rep_min is null or rep_max >= rep_min),
  unique (template_id, position)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  phase_id uuid references public.phases(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  notes text,
  source text,
  source_ref text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position)
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'backoff', 'drop', 'rest_pause')),
  weight_kg numeric(6,2),
  reps integer,
  rir numeric(3,1),
  completed_at timestamptz,
  notes text,
  source_ref text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weight_kg is null or weight_kg >= 0),
  check (reps is null or reps >= 0),
  check (rir is null or rir >= 0),
  unique (session_exercise_id, set_number)
);

create table public.life_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  phase_id uuid references public.phases(id) on delete set null,
  type text not null check (type in ('illness', 'injury', 'holiday', 'travel', 'deload', 'diet_break', 'stress', 'other')),
  title text not null,
  start_date date not null,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  chest_cm numeric(5,2),
  waist_cm numeric(5,2),
  left_arm_cm numeric(5,2),
  right_arm_cm numeric(5,2),
  left_thigh_cm numeric(5,2),
  right_thigh_cm numeric(5,2),
  left_calf_cm numeric(5,2),
  right_calf_cm numeric(5,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, date),
  check (chest_cm is null or chest_cm > 0),
  check (waist_cm is null or waist_cm > 0),
  check (left_arm_cm is null or left_arm_cm > 0),
  check (right_arm_cm is null or right_arm_cm > 0),
  check (left_thigh_cm is null or left_thigh_cm > 0),
  check (right_thigh_cm is null or right_thigh_cm > 0),
  check (left_calf_cm is null or left_calf_cm > 0),
  check (right_calf_cm is null or right_calf_cm > 0)
);

create index phases_owner_dates_idx on public.phases (owner_id, start_date desc);
create unique index daily_logs_owner_date_unique on public.daily_logs (owner_id, date);
create index programs_owner_dates_idx on public.programs (owner_id, start_date desc);
create index sessions_owner_status_started_idx on public.workout_sessions (owner_id, status, started_at desc);
create unique index workout_sessions_owner_source_ref_unique on public.workout_sessions (owner_id, source_ref) where source_ref is not null;
create index session_exercises_exercise_idx on public.session_exercises (owner_id, exercise_id);
create index workout_sets_session_exercise_idx on public.workout_sets (session_exercise_id, set_number);
create index life_events_owner_dates_idx on public.life_events (owner_id, start_date desc);
create index body_measurements_owner_date_idx on public.body_measurements (owner_id, date desc);

alter table public.phases enable row level security;
alter table public.programs enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.life_events enable row level security;
alter table public.body_measurements enable row level security;

create policy "owner manages phases" on public.phases for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages programs" on public.programs for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages exercises" on public.exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages workout templates" on public.workout_templates for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages template exercises" on public.template_exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages workout sessions" on public.workout_sessions for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages session exercises" on public.session_exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages workout sets" on public.workout_sets for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages life events" on public.life_events for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owner manages body measurements" on public.body_measurements for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
