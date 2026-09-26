"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateImportJson } from "./validation";

const dailyFields = ["weight_kg", "calories_kcal", "protein_g", "carbs_g", "fat_g", "sodium_mg", "steps", "tags", "notes", "tracking_status"] as const;
const normalize = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
const phaseKey = (name: string, startDate: string, endDate: string | null) => `${normalize(name)}|${startDate}|${endDate ?? ""}`;
const eventKey = (title: string, type: string, startDate: string, endDate: string | null) => `${normalize(title)}|${type}|${startDate}|${endDate ?? ""}`;

export async function importGymJson(formData: FormData) {
  const parsed = validateImportJson(String(formData.get("json") ?? ""));
  if (!parsed.payload || !parsed.preview) redirect(`/import?error=${encodeURIComponent(parsed.errors.slice(0, 3).join(" ") || "The JSON could not be validated.")}`);

  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const payload = parsed.payload;
  const [{ data: existingExercises }, { data: existingPhases }, { data: existingEvents }, { data: templates }] = await Promise.all([
    supabase.from("exercises").select("id,normalized_name").eq("owner_id", ownerId),
    supabase.from("phases").select("id,name,start_date,end_date").eq("owner_id", ownerId),
    supabase.from("life_events").select("title,type,start_date,end_date").eq("owner_id", ownerId),
    supabase.from("workout_templates").select("id,name").eq("owner_id", ownerId),
  ]);

  const phaseByKey = new Map((existingPhases ?? []).map((phase) => [phaseKey(phase.name, phase.start_date, phase.end_date), phase.id]));
  const phaseByName = new Map((existingPhases ?? []).map((phase) => [normalize(phase.name), phase.id]));
  const availablePhaseNames = new Set([...phaseByName.keys(), ...payload.phases.map((phase) => normalize(phase.name))]);
  if (payload.events.some((event) => event.phase_name && !availablePhaseNames.has(normalize(event.phase_name)))) redirect(`/import?error=${encodeURIComponent("An event refers to a phase that could not be found.")}`);
  for (const phase of payload.phases) {
    const key = phaseKey(phase.name, phase.start_date, phase.end_date ?? null);
    if (phaseByKey.has(key)) continue;
    const { data, error } = await supabase.from("phases").insert({ owner_id: ownerId, ...phase }).select("id").single();
    if (error || !data) redirect(`/import?error=${encodeURIComponent("Could not import phases.")}`);
    phaseByKey.set(key, data.id);
    phaseByName.set(normalize(phase.name), data.id);
  }
  const eventKeys = new Set((existingEvents ?? []).map((event) => eventKey(event.title, event.type, event.start_date, event.end_date)));
  for (const event of payload.events) {
    const key = eventKey(event.title, event.type, event.start_date, event.end_date ?? null);
    if (eventKeys.has(key)) continue;
    const { error } = await supabase.from("life_events").insert({ owner_id: ownerId, title: event.title, type: event.type, start_date: event.start_date, end_date: event.end_date ?? null, phase_id: event.phase_name ? phaseByName.get(normalize(event.phase_name)) : null, notes: event.notes ?? null });
    if (error) redirect(`/import?error=${encodeURIComponent("Could not import life events.")}`);
    eventKeys.add(key);
  }

  for (const log of payload.dailyLogs) {
    const { data: existing } = await supabase.from("daily_logs").select("*").eq("owner_id", ownerId).eq("date", log.date).maybeSingle();
    const imported = Object.fromEntries(dailyFields.filter((field) => log[field] !== undefined).map((field) => [field, log[field]]));
    if (!existing) {
      const { error } = await supabase.from("daily_logs").insert({ owner_id: ownerId, date: log.date, ...imported });
      if (error) redirect(`/import?error=${encodeURIComponent("Could not import daily logs.")}`);
      continue;
    }
    const missingOnly = Object.fromEntries(Object.entries(imported).filter(([field]) => existing[field] == null));
    if (Object.keys(missingOnly).length) {
      const { error } = await supabase.from("daily_logs").update(missingOnly).eq("owner_id", ownerId).eq("date", log.date);
      if (error) redirect(`/import?error=${encodeURIComponent("Could not import daily logs.")}`);
    }
  }

  const exerciseByName = new Map((existingExercises ?? []).map((exercise) => [exercise.normalized_name, exercise.id]));
  const templateByName = new Map((templates ?? []).map((template) => [normalize(template.name), template.id]));
  const sourceRefs = payload.sessions.flatMap((session) => session.source_ref ? [session.source_ref] : []);
  const { data: existingSessions } = sourceRefs.length
    ? await supabase.from("workout_sessions").select("source_ref").eq("owner_id", ownerId).in("source_ref", sourceRefs)
    : { data: [] };
  const importedRefs = new Set(existingSessions?.map((session) => session.source_ref) ?? []);
  let importedSessions = 0;

  for (const session of payload.sessions) {
    if (session.source_ref && importedRefs.has(session.source_ref)) continue;
    const startedAt = `${session.date}T12:00:00.000Z`;
    const { data: storedSession, error: sessionError } = await supabase
      .from("workout_sessions")
      .insert({ owner_id: ownerId, template_id: session.template_name ? templateByName.get(normalize(session.template_name)) ?? null : null, started_at: startedAt, ended_at: null, status: "completed", notes: session.notes ?? null, source: session.source ?? "legacy_gym_json", source_ref: session.source_ref ?? null, needs_review: session.needs_review })
      .select("id")
      .single();
    if (sessionError || !storedSession) redirect(`/import?error=${encodeURIComponent("Could not import sessions.")}`);
    for (const [position, exercise] of session.exercises.entries()) {
      const normalizedName = normalize(exercise.name);
      let exerciseId = exerciseByName.get(normalizedName);
      if (!exerciseId) {
        const { data, error } = await supabase.from("exercises").insert({ owner_id: ownerId, name: exercise.name, notes: exercise.notes ?? null }).select("id,normalized_name").single();
        if (error || !data) redirect(`/import?error=${encodeURIComponent("Could not import exercises.")}`);
        exerciseId = data.id;
        exerciseByName.set(data.normalized_name, data.id);
      }
      const { data: sessionExercise, error: sessionExerciseError } = await supabase.from("session_exercises").insert({ owner_id: ownerId, session_id: storedSession.id, exercise_id: exerciseId, position, notes: exercise.notes ?? null }).select("id").single();
      if (sessionExerciseError || !sessionExercise) redirect(`/import?error=${encodeURIComponent("Could not import session exercises.")}`);
      const { error: setsError } = await supabase.from("workout_sets").insert(exercise.sets.map((set, index) => ({ owner_id: ownerId, session_exercise_id: sessionExercise.id, set_number: index + 1, set_type: set.set_type, weight_kg: set.weight_kg ?? null, reps: set.reps ?? null, rir: set.rir ?? null, notes: set.notes ?? null, source_ref: set.source_ref ?? null, needs_review: set.needs_review })));
      if (setsError) redirect(`/import?error=${encodeURIComponent("Could not import workout sets.")}`);
    }
    if (session.source_ref) importedRefs.add(session.source_ref);
    importedSessions += 1;
  }

  redirect(`/import?imported=${importedSessions}`);
}
