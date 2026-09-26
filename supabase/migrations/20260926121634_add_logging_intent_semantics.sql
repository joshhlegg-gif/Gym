create type public.logging_intent as enum ('attempted', 'not_attempted', 'excused');

alter table public.daily_logs
  add column logging_intent public.logging_intent;

alter table public.life_events
  add column affects_training boolean not null default false,
  add column excuses_nutrition_logging boolean not null default false;
