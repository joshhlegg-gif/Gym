create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  storage_path text not null,
  view text check (view in ('front', 'side', 'back', 'other')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index progress_photos_owner_date_idx on public.progress_photos (owner_id, date desc);

alter table public.progress_photos enable row level security;

create policy "owner manages progress photos" on public.progress_photos
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit)
  values ('progress-photos', 'progress-photos', false, 10485760)
  on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy "progress photo owners read storage" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

create policy "progress photo owners upload storage" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

create policy "progress photo owners delete storage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));
