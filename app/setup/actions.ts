"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSetupItem(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const owner_id = data?.claims.sub;
  if (!owner_id) redirect("/login");
  const kind = String(formData.get("kind"));
  let error = null;
  if (kind === "exercise") ({ error } = await supabase.from("exercises").insert({ owner_id, name: String(formData.get("name")).trim(), notes: String(formData.get("notes") || "").trim() || null }));
  if (kind === "program") ({ error } = await supabase.from("programs").insert({ owner_id, name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), notes: String(formData.get("notes") || "").trim() || null }));
  if (kind === "template") ({ error } = await supabase.from("workout_templates").insert({ owner_id, name: String(formData.get("name")).trim(), program_id: String(formData.get("program_id") || "") || null }));
  if (kind === "template_exercise") ({ error } = await supabase.from("template_exercises").insert({ owner_id, template_id: String(formData.get("template_id")), exercise_id: String(formData.get("exercise_id")), position: Number(formData.get("position")) || 0, target_sets: Number(formData.get("target_sets")) || 3, rep_min: Number(formData.get("rep_min")) || null, rep_max: Number(formData.get("rep_max")) || null, default_rest_seconds: Number(formData.get("default_rest_seconds")) || 120 }));
  if (kind === "phase") ({ error } = await supabase.from("phases").insert({ owner_id, name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), nutrition_goal: String(formData.get("nutrition_goal")), training_goal: String(formData.get("training_goal")), target_calories_kcal: Number(formData.get("target_calories_kcal")) || null, estimated_maintenance_kcal: Number(formData.get("estimated_maintenance_kcal")) || null, notes: String(formData.get("notes") || "").trim() || null }));
  redirect(error ? `/setup?error=${encodeURIComponent("Could not save that item.")}` : "/setup?saved=1");
}
