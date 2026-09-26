"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function workoutUrl(workoutId: string, formData: FormData) {
  const restSeconds = Number(formData.get("rest_seconds"));
  return restSeconds > 0 ? `/train/${workoutId}?rest=${restSeconds}` : `/train/${workoutId}`;
}

const setTypes = new Set(["warmup", "working", "backoff", "drop", "rest_pause"]);

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function optionalText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim() || null;
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

export async function addSessionExercise(formData: FormData) {
  const { supabase, ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const exerciseId = String(formData.get("exercise_id"));
  const [{ data: workout }, { data: exercise }, { data: existing }, { data: lastExercise }] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("id")
      .eq("id", workoutId)
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("exercises")
      .select("id")
      .eq("id", exerciseId)
      .eq("owner_id", ownerId)
      .eq("archived", false)
      .maybeSingle(),
    supabase
      .from("session_exercises")
      .select("id")
      .eq("session_id", workoutId)
      .eq("exercise_id", exerciseId)
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabase
      .from("session_exercises")
      .select("position")
      .eq("session_id", workoutId)
      .eq("owner_id", ownerId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!workout || !exercise) redirect(`/train/${workoutId}?error=Could%20not%20add%20exercise`);
  if (existing) redirect(`/train/${workoutId}?error=Exercise%20is%20already%20in%20this%20workout`);

  const { error } = await supabase.from("session_exercises").insert({
    owner_id: ownerId,
    session_id: workoutId,
    exercise_id: exerciseId,
    position: (lastExercise?.position ?? 0) + 1,
  });
  if (error) redirect(`/train/${workoutId}?error=Could%20not%20add%20exercise`);

  redirect(`/train/${workoutId}`);
}

export async function removeSessionExercise(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20skip%20exercise`);

  const { count } = await supabase
    .from("workout_sets")
    .select("id", { count: "exact", head: true })
    .eq("session_exercise_id", sessionExerciseId)
    .eq("owner_id", ownerId);
  if (count) redirect(`/train/${workoutId}?error=Exercises%20with%20logged%20sets%20cannot%20be%20skipped`);

  const { error } = await supabase
    .from("session_exercises")
    .delete()
    .eq("id", sessionExerciseId)
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId);
  if (error) redirect(`/train/${workoutId}?error=Could%20not%20skip%20exercise`);

  redirect(`/train/${workoutId}`);
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

export async function updateActiveSet(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");

  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const setId = String(formData.get("set_id"));
  const setType = String(formData.get("set_type"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise || !setTypes.has(setType)) redirect(`/train/${workoutId}?error=Could%20not%20save%20set`);

  const { error } = await supabase
    .from("workout_sets")
    .update({
      set_type: setType,
      weight_kg: numberOrNull(formData.get("weight_kg")),
      reps: numberOrNull(formData.get("reps")),
      rir: numberOrNull(formData.get("rir")),
    })
    .eq("id", setId)
    .eq("session_exercise_id", sessionExerciseId)
    .eq("owner_id", ownerId);
  redirect(error ? `/train/${workoutId}?error=Could%20not%20save%20set` : `/train/${workoutId}`);
}

export async function saveWorkoutNotes(formData: FormData) {
  const { supabase, ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const { error } = await supabase
    .from("workout_sessions")
    .update({ notes: optionalText(formData.get("notes")) })
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "active");
  redirect(error ? `/train/${workoutId}?error=Could%20not%20save%20notes` : `/train/${workoutId}`);
}

export async function saveSessionExerciseNotes(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20save%20exercise%20notes`);
  const { error } = await supabase
    .from("session_exercises")
    .update({ notes: optionalText(formData.get("notes")) })
    .eq("id", sessionExerciseId)
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId);
  redirect(error ? `/train/${workoutId}?error=Could%20not%20save%20exercise%20notes` : `/train/${workoutId}`);
}

export async function moveSessionExercise(formData: FormData) {
  const { ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));
  const sessionExerciseId = String(formData.get("session_exercise_id"));
  const direction = String(formData.get("direction"));
  const { supabase, sessionExercise } = await getActiveSessionExercise(workoutId, sessionExerciseId, ownerId);
  if (!sessionExercise) redirect(`/train/${workoutId}?error=Could%20not%20reorder%20exercise`);
  const { data: items } = await supabase
    .from("session_exercises")
    .select("id,position")
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId)
    .order("position");
  const index = items?.findIndex((item) => item.id === sessionExerciseId) ?? -1;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (!items || index < 0 || nextIndex < 0 || nextIndex >= items.length) redirect(`/train/${workoutId}`);
  const reordered = [...items];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  for (const [position, item] of items.entries()) {
    await supabase.from("session_exercises").update({ position: -position - 1 }).eq("id", item.id).eq("owner_id", ownerId);
  }
  for (const [position, item] of reordered.entries()) {
    await supabase.from("session_exercises").update({ position }).eq("id", item.id).eq("owner_id", ownerId);
  }
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

export async function abandonWorkout(formData: FormData) {
  const { supabase, ownerId } = await getOwnerId();
  if (!ownerId) redirect("/login");
  const workoutId = String(formData.get("workout_id"));

  const { data: session } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .maybeSingle();
  if (!session) redirect(`/train/${workoutId}?error=Could%20not%20abandon%20workout`);

  const { data: sessionExercises } = await supabase
    .from("session_exercises")
    .select("id")
    .eq("session_id", workoutId)
    .eq("owner_id", ownerId);
  const sessionExerciseIds = sessionExercises?.map((exercise) => exercise.id) ?? [];
  const { count, error: countError } = sessionExerciseIds.length
    ? await supabase
        .from("workout_sets")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .in("session_exercise_id", sessionExerciseIds)
    : { count: 0, error: null };
  if (countError) redirect(`/train/${workoutId}?error=Could%20not%20abandon%20workout`);

  if (!count) {
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", workoutId)
      .eq("owner_id", ownerId)
      .eq("status", "active");
    redirect(error ? `/train/${workoutId}?error=Could%20not%20discard%20workout` : "/train");
  }

  const { error } = await supabase
    .from("workout_sessions")
    .update({ status: "abandoned", ended_at: new Date().toISOString() })
    .eq("id", workoutId)
    .eq("owner_id", ownerId)
    .eq("status", "active");
  redirect(error ? `/train/${workoutId}?error=Could%20not%20abandon%20workout` : "/train");
}
