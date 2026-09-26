"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function startWorkout(formData: FormData) {
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getClaims(); const owner_id = auth?.claims.sub; if (!owner_id) redirect("/login");
  const template_id = String(formData.get("template_id"));
  const { data: template } = await supabase.from("workout_templates").select("program_id").eq("id", template_id).single();
  const { data: session, error } = await supabase.from("workout_sessions").insert({ owner_id, template_id, program_id: template?.program_id ?? null }).select("id").single();
  if (error || !session) redirect("/train?error=Could%20not%20start%20workout");
  const { data: planned } = await supabase.from("template_exercises").select("exercise_id,position").eq("template_id", template_id).order("position");
  if (planned?.length) await supabase.from("session_exercises").insert(planned.map(item => ({ owner_id, session_id: session.id, exercise_id: item.exercise_id, position: item.position })));
  redirect(`/train/${session.id}`);
}

export async function addSet(formData: FormData) {
  const supabase = await createClient(); const { data: auth } = await supabase.auth.getClaims(); const owner_id = auth?.claims.sub; if (!owner_id) redirect("/login");
  const sessionExerciseId = String(formData.get("session_exercise_id")); const workoutId = String(formData.get("workout_id"));
  const { data: previous } = await supabase.from("workout_sets").select("set_number").eq("session_exercise_id", sessionExerciseId).order("set_number", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("workout_sets").insert({ owner_id, session_exercise_id: sessionExerciseId, set_number: (previous?.set_number ?? 0) + 1, set_type: String(formData.get("set_type") || "working"), weight_kg: Number(formData.get("weight_kg")) || null, reps: Number(formData.get("reps")) || null, rir: Number(formData.get("rir")) || null, completed_at: new Date().toISOString() });
  redirect(`/train/${workoutId}`);
}
