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
