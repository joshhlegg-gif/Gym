export type ImportedDailyLog = { date: string; weight_kg?: number; calories_kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number; sodium_mg?: number; steps?: number; tags?: string[]; notes?: string; tracking_status?: string };
export type ImportedPhase = { name: string; start_date: string; end_date?: string | null; nutrition_goal: string; training_goal: string; target_calories_kcal?: number; estimated_maintenance_kcal?: number; target_rate_kg_per_week?: number; notes?: string };
export type ImportedEvent = { title: string; type: string; start_date: string; end_date?: string | null; phase_name?: string; notes?: string };
export type ImportedSet = { set_type: string; weight_kg?: number; reps?: number; rir?: number; notes?: string; source_ref?: string; needs_review: boolean };
export type ImportedSession = { date: string; template_name?: string; notes?: string; source?: string; source_ref?: string; needs_review: boolean; exercises: { name: string; notes?: string; sets: ImportedSet[] }[] };
export type ImportPayload = { dailyLogs: ImportedDailyLog[]; phases: ImportedPhase[]; events: ImportedEvent[]; sessions: ImportedSession[] };
export type ImportPreview = { dailyLogs: number; phases: number; events: number; sessions: number; exercises: number; sets: number; needsReview: number; sessionsWithoutSourceRef: number };

const setTypes = new Set(["warmup", "working", "backoff", "drop", "rest_pause"]);
const eventTypes = new Set(["illness", "injury", "holiday", "travel", "deload", "diet_break", "stress", "other"]);
const nutritionGoals = new Set(["fat_loss", "mini_cut", "maintenance", "gain", "custom"]);
const trainingGoals = new Set(["hypertrophy", "strength", "maintain", "general", "custom"]);
const object = (value: unknown): Record<string, unknown> | null => value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? value : undefined;
const optionalNumber = (value: unknown) => value == null ? undefined : typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const field = (record: Record<string, unknown>, camel: string, snake: string) => record[camel] ?? record[snake];

function array(value: unknown, name: string, errors: string[]) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${name} must be an array.`);
    return [];
  }
  return value;
}

export function validateImportJson(raw: string): { payload?: ImportPayload; preview?: ImportPreview; errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { errors: ["The JSON is malformed."] }; }
  const root = object(parsed);
  if (!root) return { errors: ["The import must be a JSON object."] };
  const errors: string[] = [];
  const dailyLogs: ImportedDailyLog[] = [];
  const phases: ImportedPhase[] = [];
  const events: ImportedEvent[] = [];
  const sessions: ImportedSession[] = [];
  const dailyDates = new Set<string>();
  const sourceRefs = new Set<string>();

  array(root.dailyLogs, "dailyLogs", errors).forEach((item, index) => {
    const record = object(item); const entryDate = record && date(record.date);
    if (!record || !entryDate) return errors.push(`dailyLogs[${index}] needs a valid date.`);
    if (record.needsReview === true || record.needs_review === true) errors.push(`dailyLogs[${index}].needsReview cannot be stored by the existing daily_logs schema.`);
    if (dailyDates.has(entryDate)) errors.push(`dailyLogs contains more than one record for ${entryDate}.`);
    dailyDates.add(entryDate);
    const values: ImportedDailyLog = { date: entryDate };
    for (const [camel, snake] of [["weightKg", "weight_kg"], ["caloriesKcal", "calories_kcal"], ["proteinG", "protein_g"], ["carbsG", "carbs_g"], ["fatG", "fat_g"], ["sodiumMg", "sodium_mg"], ["steps", "steps"]] as const) {
      const number = optionalNumber(field(record, camel, snake));
      if (number === null) errors.push(`dailyLogs[${index}].${camel} must be a non-negative number.`);
      else if (number !== undefined) values[snake] = number;
    }
    const tags = record.tags;
    if (tags != null && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))) errors.push(`dailyLogs[${index}].tags must be a string array.`);
    else if (Array.isArray(tags)) values.tags = tags;
    const notes = text(record.notes); if (record.notes != null && !notes) errors.push(`dailyLogs[${index}].notes must be text.`); else if (notes) values.notes = notes;
    const trackingStatus = text(field(record, "trackingStatus", "tracking_status")); if (trackingStatus) values.tracking_status = trackingStatus;
    dailyLogs.push(values);
  });

  array(root.phases, "phases", errors).forEach((item, index) => {
    const record = object(item); const name = record && text(record.name); const startDate = record && date(field(record, "startDate", "start_date")); const endValue = record?.endDate ?? record?.end_date; const endDate = endValue == null ? undefined : date(endValue);
    const nutritionGoal = record && text(field(record, "nutritionGoal", "nutrition_goal")); const trainingGoal = record && text(field(record, "trainingGoal", "training_goal"));
    if (!record || !name || !startDate || !nutritionGoal || !trainingGoal || !nutritionGoals.has(nutritionGoal) || !trainingGoals.has(trainingGoal) || (endDate && endDate < startDate)) return errors.push(`phases[${index}] needs name, valid dates, nutritionGoal, and trainingGoal.`);
    if (record.needsReview === true || record.needs_review === true) errors.push(`phases[${index}].needsReview cannot be stored by the existing phases schema.`);
    const targetCalories = optionalNumber(field(record, "targetCaloriesKcal", "target_calories_kcal")); const maintenance = optionalNumber(field(record, "estimatedMaintenanceKcal", "estimated_maintenance_kcal")); const targetRate = optionalNumber(field(record, "targetRateKgPerWeek", "target_rate_kg_per_week"));
    if (targetCalories === null || maintenance === null || targetRate === null) return errors.push(`phases[${index}] has an invalid numeric target.`);
    phases.push({ name, start_date: startDate, end_date: endDate ?? null, nutrition_goal: nutritionGoal, training_goal: trainingGoal, target_calories_kcal: targetCalories, estimated_maintenance_kcal: maintenance, target_rate_kg_per_week: targetRate, notes: text(record.notes) });
  });

  array(root.events, "events", errors).forEach((item, index) => {
    const record = object(item); const title = record && text(record.title); const type = record && text(record.type); const startDate = record && date(field(record, "startDate", "start_date")); const endValue = record?.endDate ?? record?.end_date; const endDate = endValue == null ? undefined : date(endValue);
    if (!record || !title || !type || !eventTypes.has(type) || !startDate || (endDate && endDate < startDate)) return errors.push(`events[${index}] needs title, valid type, and valid dates.`);
    if (record.needsReview === true || record.needs_review === true) errors.push(`events[${index}].needsReview cannot be stored by the existing life_events schema.`);
    events.push({ title, type, start_date: startDate, end_date: endDate ?? null, phase_name: text(field(record, "phaseName", "phase_name")), notes: text(record.notes) });
  });

  array(root.sessions, "sessions", errors).forEach((item, sessionIndex) => {
    const record = object(item); const sessionDate = record && date(record.date); const exercisesValue = record && array(record.exercises, `sessions[${sessionIndex}].exercises`, errors);
    if (!record || !sessionDate || !exercisesValue?.length) return errors.push(`sessions[${sessionIndex}] needs a valid date and at least one exercise.`);
    const sourceRef = text(field(record, "sourceRef", "source_ref"));
    if (sourceRef && sourceRefs.has(sourceRef)) errors.push(`sessions contains duplicate sourceRef ${sourceRef}.`);
    if (sourceRef) sourceRefs.add(sourceRef);
    const exercises = exercisesValue.map((exercise, exerciseIndex) => {
      const entry = object(exercise); const name = entry && text(entry.name); const setsValue = entry && array(entry.sets, `sessions[${sessionIndex}].exercises[${exerciseIndex}].sets`, errors);
      if (!entry || !name || !setsValue?.length) { errors.push(`sessions[${sessionIndex}].exercises[${exerciseIndex}] needs a name and at least one set.`); return null; }
      const sets = setsValue.map((set, setIndex) => {
        const setRecord = object(set); const setType = setRecord && text(field(setRecord, "setType", "set_type"));
        if (!setRecord || !setType || !setTypes.has(setType)) { errors.push(`sessions[${sessionIndex}].exercises[${exerciseIndex}].sets[${setIndex}] needs a valid setType.`); return null; }
        const weight = optionalNumber(field(setRecord, "weightKg", "weight_kg")); const reps = optionalNumber(setRecord.reps); const rir = optionalNumber(setRecord.rir);
        if (weight === null || reps === null || rir === null || (reps !== undefined && !Number.isInteger(reps))) { errors.push(`sessions[${sessionIndex}].exercises[${exerciseIndex}].sets[${setIndex}] has an invalid weight, reps, or RIR.`); return null; }
        return { set_type: setType, weight_kg: weight, reps, rir, notes: text(setRecord.notes), source_ref: text(field(setRecord, "sourceRef", "source_ref")), needs_review: setRecord.needsReview === true || setRecord.needs_review === true };
      });
      return sets.some((set) => !set) ? null : { name, notes: text(entry.notes), sets: sets as ImportedSet[] };
    });
    if (exercises.some((exercise) => !exercise)) return;
    sessions.push({ date: sessionDate, template_name: text(field(record, "templateName", "template_name")), notes: text(record.notes), source: text(record.source), source_ref: sourceRef, needs_review: record.needsReview === true || record.needs_review === true, exercises: exercises as ImportedSession["exercises"] });
  });

  if (errors.length) return { errors };
  const allSets = sessions.flatMap((session) => session.exercises.flatMap((exercise) => exercise.sets));
  return { payload: { dailyLogs, phases, events, sessions }, preview: { dailyLogs: dailyLogs.length, phases: phases.length, events: events.length, sessions: sessions.length, exercises: new Set(sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name.toLowerCase().replace(/\s+/g, " ").trim()))).size, sets: allSets.length, needsReview: sessions.filter((session) => session.needs_review).length + allSets.filter((set) => set.needs_review).length, sessionsWithoutSourceRef: sessions.filter((session) => !session.source_ref).length }, errors: [] };
}
