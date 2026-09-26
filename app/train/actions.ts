"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function workoutUrl(workoutId: string, formData: FormData) {
  const restSeconds = Number(formData.get("rest_seconds"));
  return restSeconds > 0 ? `/train/${workoutId}?rest=${restSeconds}` : `/train/${workoutId}`;
}

async function getActiveSessionExercise(
  workoutId: string,
  sessionExerciseId: string,
  ownerId: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_exercises")
    .select("id,session_id,workout_sessions!inner(status)")
    .eq("id", sessionExerciseId)
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId)
    .eq("workout_sessions.status", "active")
    .maybeSingle();

  return { supabase, sessionExercise: data };
}

async function getOwnerId() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  return { supabase, ownerId: auth?.claims.sub };
}

export async function startWorkout(formData: FormData) {
  const { supabase, ownerId: owner_id } = await getOwnerId();
  if (!owner_id) redirect("/login");

  const template_id = String(formData.get("template_id"));
  const { data: template } = await supabase
    .from("workout_templates")
    .select("program_id")
    .eq("id", template_id)
    .single();
  const { data: session, error } = await supabase
    .from("workout_sessions")
    .insert({ owner_id, template_id, program_id: template?.program_id ?? null })
    .select("id")
    .single();

  if (error || !session) redirect("/train?error=Could%20not%20start%20workout");

  const { data: planned } = await supabase
    .from("template_exercises")
    .select("exercise_id,position")
    .eq("template_id", template_id)
    .order("position");

  if (planned?.length) {
    await supabase.from("session_exercises").insert(
      planned.map((item) => ({
        owner_id,
        session_id: session.id,
        exercise_id: item.exercise_id,
        position: item.position,
      })),
    );
  }

  redirect(`/train/${session.id}`);
}

export async function addSet(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20log%20set`);

  const { data: previous } = await supabase
    .from("workout_sets")
    .select("set_number")
    .eq("session_exercise_id", sessionExerciseId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("workout_sets").insert({
    owner_id: ownerId,
    session_exercise_id: sessionExerciseId,
    set_number: (previous?.set_number ?? 0) + 1,
    set_type: String(formData.get("set_type") || "working"),
    weight_kg: Number(formData.get("weight_kg")) || null,
    reps: Number(formData.get("reps")) || null,
    rir: Number(formData.get("rir")) || null,
    completed_at: new Date().toISOString(),
  });
  if (error) redirect(`/train/${workoutId}?error=Could%20not%20log%20set`);

  redirect(workoutUrl(workoutId, formData));
}

export async function deleteSet(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const setId = String(formData.get("set_id"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20delete%20set`);

  await supabase
    .from("workout_sets")
    .delete()
    .eq("id", setId)
    .eq("owner_id", ownerId)
    .eq("session_exercise_id", sessionExerciseId);

  redirect(`/train/${workoutId}`);
}

export async function duplicateSet(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const sourceSetId = String(formData.get("source_set_id"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20duplicate%20set`);

  const [{ data: source }, { data: previous }] = await Promise.all([
    supabase
      .from("workout_sets")
      .select("set_type,weight_kg,reps,rir")
      .eq("id", sourceSetId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("workout_sets")
      .select("set_number")
      .eq("session_exercise_id", sessionExerciseId)
      .order("set_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!source) redirect(`/train/${workoutId}?error=Could%20not%20duplicate%20set`);

  const { error } = await supabase.from("workout_sets").insert({
    owner_id: ownerId,
    session_exercise_id: sessionExerciseId,
    set_number: (previous?.set_number ?? 0) + 1,
    set_type: source.set_type,
    weight_kg: source.weight_kg,
    reps: source.reps,
    rir: source.rir,
    completed_at: new Date().toISOString(),
  });
  if (error) redirect(`/train/${workoutId}?error=Could%20not%20duplicate%20set`);

  redirect(workoutUrl(workoutId, formData));
}

export async function completeWorkout(formData: FormData) {
  const { supabase, ownerId: owner_id } = await getOwnerId();
  if (!owner_id) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const { error } = await supabase
    .from("workout_sessions")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("id", workoutId)
    .eq("owner_id", owner_id)
    .eq("status", "active");

  if (error) redirect(`/train/${workoutId}?error=Could%20not%20complete%20workout`);
  redirect("/history");
}
