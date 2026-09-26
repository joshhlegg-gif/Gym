"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const optionalText = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const optionalNumber = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  return raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
};

async function owner() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, ownerId: data?.claims.sub };
}

export async function createSetupItem(formData: FormData) {
  const { supabase, ownerId } = await owner();
  if (!ownerId) redirect("/login");
  const kind = String(formData.get("kind"));
  let error = null;
  if (kind === "exercise") ({ error } = await supabase.from("exercises").insert({ owner_id: ownerId, name: String(formData.get("name")).trim(), notes: optionalText(formData.get("notes")) }));
  if (kind === "program") ({ error } = await supabase.from("programs").insert({ owner_id: ownerId, name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), end_date: optionalText(formData.get("end_date")), notes: optionalText(formData.get("notes")) }));
  if (kind === "template") ({ error } = await supabase.from("workout_templates").insert({ owner_id: ownerId, name: String(formData.get("name")).trim(), program_id: optionalText(formData.get("program_id")) }));
  if (kind === "phase") ({ error } = await supabase.from("phases").insert({ owner_id: ownerId, name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), end_date: optionalText(formData.get("end_date")), nutrition_goal: String(formData.get("nutrition_goal")), training_goal: String(formData.get("training_goal")), target_calories_kcal: optionalNumber(formData.get("target_calories_kcal")), estimated_maintenance_kcal: optionalNumber(formData.get("estimated_maintenance_kcal")), target_rate_kg_per_week: optionalNumber(formData.get("target_rate_kg_per_week")), notes: optionalText(formData.get("notes")) }));
  redirect(error ? `/setup?error=${encodeURIComponent("Could not save that item.")}` : "/setup?saved=1");
}

export async function updatePhase(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const id = String(formData.get("id"));
  const { error } = await supabase.from("phases").update({ name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), end_date: optionalText(formData.get("end_date")), nutrition_goal: String(formData.get("nutrition_goal")), training_goal: String(formData.get("training_goal")), target_calories_kcal: optionalNumber(formData.get("target_calories_kcal")), estimated_maintenance_kcal: optionalNumber(formData.get("estimated_maintenance_kcal")), target_rate_kg_per_week: optionalNumber(formData.get("target_rate_kg_per_week")), notes: optionalText(formData.get("notes")) }).eq("id", id).eq("owner_id", ownerId);
  redirect(error ? `/setup/phases/${id}?error=Could%20not%20save%20phase` : `/setup/phases/${id}?saved=1`);
}

export async function updateProgram(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const id = String(formData.get("id"));
  const { error } = await supabase.from("programs").update({ name: String(formData.get("name")).trim(), start_date: String(formData.get("start_date")), end_date: optionalText(formData.get("end_date")), notes: optionalText(formData.get("notes")) }).eq("id", id).eq("owner_id", ownerId);
  redirect(error ? `/setup/programs/${id}?error=Could%20not%20save%20program` : `/setup/programs/${id}?saved=1`);
}

export async function updateExercise(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const id = String(formData.get("id"));
  const { error } = await supabase.from("exercises").update({ name: String(formData.get("name")).trim(), notes: optionalText(formData.get("notes")), archived: formData.get("archived") === "true" }).eq("id", id).eq("owner_id", ownerId);
  redirect(error ? `/setup/exercises/${id}?error=Could%20not%20save%20exercise` : `/setup/exercises/${id}?saved=1`);
}

export async function updateTemplate(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const id = String(formData.get("id"));
  const { error } = await supabase.from("workout_templates").update({ name: String(formData.get("name")).trim(), program_id: optionalText(formData.get("program_id")), archived: formData.get("archived") === "true" }).eq("id", id).eq("owner_id", ownerId);
  redirect(error ? `/setup/templates/${id}?error=Could%20not%20save%20template` : `/setup/templates/${id}?saved=1`);
}

export async function addTemplateExercise(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const templateId = String(formData.get("template_id"));
  const { data: last } = await supabase.from("template_exercises").select("position").eq("template_id", templateId).eq("owner_id", ownerId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("template_exercises").insert({ owner_id: ownerId, template_id: templateId, exercise_id: String(formData.get("exercise_id")), position: (last?.position ?? -1) + 1, target_sets: Number(formData.get("target_sets")) || 3, rep_min: optionalNumber(formData.get("rep_min")), rep_max: optionalNumber(formData.get("rep_max")), default_rest_seconds: optionalNumber(formData.get("default_rest_seconds")) ?? 120, notes: optionalText(formData.get("notes")) });
  redirect(error ? `/setup/templates/${templateId}?error=Could%20not%20add%20exercise` : `/setup/templates/${templateId}?saved=1`);
}

export async function updateTemplateExercise(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const templateId = String(formData.get("template_id")); const id = String(formData.get("id"));
  const { error } = await supabase.from("template_exercises").update({ exercise_id: String(formData.get("exercise_id")), target_sets: Number(formData.get("target_sets")) || 3, rep_min: optionalNumber(formData.get("rep_min")), rep_max: optionalNumber(formData.get("rep_max")), default_rest_seconds: optionalNumber(formData.get("default_rest_seconds")) ?? 120, notes: optionalText(formData.get("notes")) }).eq("id", id).eq("template_id", templateId).eq("owner_id", ownerId);
  redirect(error ? `/setup/templates/${templateId}?error=Could%20not%20save%20exercise` : `/setup/templates/${templateId}?saved=1`);
}

export async function removeTemplateExercise(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const templateId = String(formData.get("template_id"));
  const { error } = await supabase.from("template_exercises").delete().eq("id", String(formData.get("id"))).eq("template_id", templateId).eq("owner_id", ownerId);
  redirect(error ? `/setup/templates/${templateId}?error=Could%20not%20remove%20exercise` : `/setup/templates/${templateId}?saved=1`);
}

export async function moveTemplateExercise(formData: FormData) {
  const { supabase, ownerId } = await owner(); if (!ownerId) redirect("/login");
  const templateId = String(formData.get("template_id")); const id = String(formData.get("id")); const direction = String(formData.get("direction"));
  const { data: items } = await supabase.from("template_exercises").select("id,position").eq("template_id", templateId).eq("owner_id", ownerId).order("position");
  const index = items?.findIndex((item) => item.id === id) ?? -1; const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (!items || index < 0 || nextIndex < 0 || nextIndex >= items.length) redirect(`/setup/templates/${templateId}`);
  const reordered = [...items]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  for (const [position, item] of items.entries()) await supabase.from("template_exercises").update({ position: -position - 1 }).eq("id", item.id).eq("owner_id", ownerId);
  for (const [position, item] of reordered.entries()) await supabase.from("template_exercises").update({ position }).eq("id", item.id).eq("owner_id", ownerId);
  redirect(`/setup/templates/${templateId}?saved=1`);
}
