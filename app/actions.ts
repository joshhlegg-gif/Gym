'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getOrCreateProfile, upsertDay, type DayUpdate } from '@/lib/queries';
import { dayKeyOf, isDayKey } from '@/lib/calc/dates';
import type { TrackingStatus } from '@/lib/calc/types';

const TRACKING: readonly TrackingStatus[] = ['tracked', 'partial', 'untracked'];

function optionalNumber(raw: FormDataEntryValue | null): number | null | undefined {
  if (raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '') return null; // cleared on purpose
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export async function saveDay(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const profile = await getOrCreateProfile(user.id, user.email ?? '');

  const rawDate = String(formData.get('date') ?? '');
  // Never trust the client for which day this is; fall back to the profile's
  // timezone, which is what decides the calendar day everywhere else.
  const date = isDayKey(rawDate) ? rawDate : dayKeyOf(new Date(), profile.timeZone);

  const status = String(formData.get('trackingStatus') ?? '');
  const update: DayUpdate = {
    weightKg: optionalNumber(formData.get('weightKg')),
    caloriesKcal: optionalNumber(formData.get('caloriesKcal')),
    steps: optionalNumber(formData.get('steps')),
    trackingStatus: TRACKING.includes(status as TrackingStatus)
      ? (status as TrackingStatus)
      : undefined,
  };

  await upsertDay(profile.id, date, update);
  revalidatePath('/');
  revalidatePath('/dashboard');
}

export async function signIn(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });

  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect('/');
}

export async function signUp(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });

  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect('/sign-in?checkEmail=1');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
