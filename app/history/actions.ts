"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const setTypes = new Set(["warmup", "working", "backoff", "drop", "rest_pause"]);

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function getOwner() {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  return { supabase, ownerId: identity?.claims.sub };
}

async function completedSession(workoutId: string, ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "completed")
    .maybeSingle();
  return { supabase, session: data };
}

export async function updateWorkoutDate(formData: FormData) {
  const { ownerId } = await getOwner();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const date = String(formData.get("date"));
  const { supabase, session } = await completedSession(workoutId, ownerId);
  if (!session || !date) redirect("/history");

  const timestamp = `${date}T12:00:00.000Z`;
  const { error } = await supabase
    .from("workout_sessions")
    .update({ started_at: timestamp, ended_at: timestamp })
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "completed");
  redirect(error ? `/history/${workoutId}?error=Could%20not%20save%20workout%20date` : `/history/${workoutId}?saved=1`);
}

export async function updateHistoricalExercise(formData: FormData) {
  const { ownerId } = await getOwner();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const exerciseId = String(formData.get("exercise_id"));
  const { supabase, session } = await completedSession(workoutId, ownerId);
  if (!session || !exerciseId) redirect("/history");
  const { data: exercise } = await supabase
    .from("exercises")
    .select("id")
    .eq("id", exerciseId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!exercise) redirect(`/history/${workoutId}?error=Could%20not%20save%20exercise`);

  const { error } = await supabase
    .from("session_exercises")
    .update({ exercise_id: exerciseId })
    .eq("id", sessionExerciseId)
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId);
  redirect(error ? `/history/${workoutId}?error=Could%20not%20save%20exercise` : `/history/${workoutId}?saved=1`);
}

export async function updateHistoricalSet(formData: FormData) {
  const { ownerId } = await getOwner();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const setId = String(formData.get("set_id"));
  const setType = String(formData.get("set_type"));
  const { supabase, session } = await completedSession(workoutId, ownerId);
  if (!session || !setTypes.has(setType)) redirect("/history");

  const { error } = await supabase
    .from("workout_sets")
    .update({ set_type: setType, weight_kg: numberOrNull(formData.get("weight_kg")), reps: numberOrNull(formData.get("reps")), rir: numberOrNull(formData.get("rir")) })
    .eq("id", setId)
    .eq("session_exercise_id", sessionExerciseId)
    .eq("owner_id", ownerId);
  redirect(error ? `/history/${workoutId}?error=Could%20not%20save%20set` : `/history/${workoutId}?saved=1`);
}

export async function deleteHistoricalSet(formData: FormData) {
  const { ownerId } = await getOwner();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const setId = String(formData.get("set_id"));
  const { supabase, session } = await completedSession(workoutId, ownerId);
  if (!session) redirect("/history");

  const { error } = await supabase
    .from("workout_sets")
    .delete()
    .eq("id", setId)
    .eq("session_exercise_id", sessionExerciseId)
    .eq("owner_id", ownerId);
  redirect(error ? `/history/${workoutId}?error=Could%20not%20delete%20set` : `/history/${workoutId}?saved=1`);
}

export async function deleteHistoricalWorkout(formData: FormData) {
  const { ownerId } = await getOwner();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const { supabase, session } = await completedSession(workoutId, ownerId);
  if (!session) redirect("/history");

  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "completed");
  redirect(error ? `/history/${workoutId}?error=Could%20not%20delete%20workout` : "/history?deleted=1");
}
