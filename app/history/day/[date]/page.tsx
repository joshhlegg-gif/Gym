import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rollingSevenDayAverage } from "@/lib/bodyweight";

const APP_TIME_ZONE = "Australia/Melbourne";
const measurementFields = ["chest_cm", "waist_cm", "left_arm_cm", "right_arm_cm", "left_thigh_cm", "right_thigh_cm", "left_calf_cm", "right_calf_cm"] as const;
const measurementLabels: Record<(typeof measurementFields)[number], string> = { chest_cm: "Chest", waist_cm: "Waist", left_arm_cm: "Left bicep", right_arm_cm: "Right bicep", left_thigh_cm: "Left thigh", right_thigh_cm: "Right thigh", left_calf_cm: "Left calf", right_calf_cm: "Right calf" };

function localDate(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function decimal(value: number | null | undefined) {
  return value == null ? "—" : Number(value).toFixed(2).replace(/\.?0+$/, "");
}

export default async function TimelineDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) notFound();

  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const workoutStart = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - 86_400_000).toISOString();
  const workoutEnd = new Date(new Date(`${date}T00:00:00.000Z`).getTime() + 172_800_000).toISOString();
  const [{ data: log }, { data: measurement }, { data: weights }, { data: phase }, { data: events }, { data: possibleSessions }] = await Promise.all([
    supabase.from("daily_logs").select("date,weight_kg,calories_kcal,protein_g,carbs_g,fat_g,sodium_mg,steps,tracking_status,notes,tags").eq("owner_id", ownerId).eq("date", date).maybeSingle(),
    supabase.from("body_measurements").select("date,chest_cm,waist_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,left_calf_cm,right_calf_cm,notes").eq("owner_id", ownerId).eq("date", date).maybeSingle(),
    supabase.from("daily_logs").select("date,weight_kg").eq("owner_id", ownerId).gte("date", shiftDate(date, -6)).lte("date", date).not("weight_kg", "is", null),
    supabase.from("phases").select("name,nutrition_goal,training_goal,target_calories_kcal,estimated_maintenance_kcal").eq("owner_id", ownerId).lte("start_date", date).or(`end_date.is.null,end_date.gte.${date}`).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("life_events").select("id,title,type,start_date,end_date,notes").eq("owner_id", ownerId).lte("start_date", date).or(`end_date.is.null,end_date.gte.${date}`).order("start_date", { ascending: false }),
    supabase.from("workout_sessions").select("id,started_at,notes,workout_templates(name),session_exercises(id,position,exercises(name),workout_sets(id,set_number,set_type,weight_kg,reps,rir))").eq("owner_id", ownerId).eq("status", "completed").gte("started_at", workoutStart).lt("started_at", workoutEnd),
  ]);

  const sessions = (possibleSessions ?? []).filter((session) => localDate(session.started_at) === date);
  const average = rollingSevenDayAverage((weights ?? []).map((item) => ({ date: item.date, weight: Number(item.weight_kg) })).filter((item) => Number.isFinite(item.weight))).find((item) => item.date === date)?.weight ?? null;
  const title = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: APP_TIME_ZONE }).format(new Date(`${date}T12:00:00.000Z`));
  const macros = [log?.calories_kcal != null ? `${log.calories_kcal} kcal` : null, log?.protein_g != null ? `${log.protein_g}g protein` : null, log?.carbs_g != null ? `${log.carbs_g}g carbs` : null, log?.fat_g != null ? `${log.fat_g}g fat` : null, log?.sodium_mg != null ? `${log.sodium_mg}mg sodium` : null, log?.steps != null ? `${log.steps} steps` : null].filter(Boolean);
  const tags = Array.isArray(log?.tags) ? log.tags.join(", ") : log?.tags;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Timeline day</p><h1>{title}</h1></div><Link href={`/history?month=${date.slice(0, 7)}`}>Timeline</Link></header>
    {phase && <section className="section"><p className="eyebrow">Phase</p><h2>{phase.name}</h2><p>{phase.nutrition_goal.replaceAll("_", " ")} · {phase.training_goal.replaceAll("_", " ")}</p>{phase.target_calories_kcal != null && <p>{phase.target_calories_kcal} kcal target</p>}{phase.estimated_maintenance_kcal != null && <p>{phase.estimated_maintenance_kcal} kcal maintenance estimate</p>}</section>}
    {(log?.weight_kg != null || measurement || average != null) && <section className="section"><p className="eyebrow">Body</p>{log?.weight_kg != null && <p>Bodyweight: {decimal(log.weight_kg)} kg</p>}{average != null && <p>7-day bodyweight average: {decimal(average)} kg</p>}{measurement && <><p>Measurements</p>{measurementFields.map((field) => measurement[field] == null ? null : <p key={field}>{measurementLabels[field]}: {decimal(measurement[field])} cm</p>)}{measurement.notes && <p className="muted">{measurement.notes}</p>}</>}</section>}
    {log && <section className="section"><p className="eyebrow">Nutrition / daily log</p>{macros.length > 0 && <p>{macros.join(" · ")}</p>}{log.tracking_status && <p>{log.tracking_status.toLowerCase().includes("not tracked") ? "Food not tracked" : `Tracking: ${log.tracking_status}`}</p>}{tags && <p>Tags: {String(tags)}</p>}{log.notes && <p className="muted">{log.notes}</p>}</section>}
    {sessions.length > 0 && <section className="section"><p className="eyebrow">Training</p>{sessions.map((session) => <article className="card" key={session.id}><div className="topbar"><h2>{session.workout_templates?.[0]?.name ?? "Workout"}</h2><Link href={`/history/${session.id}`}>Correct workout</Link></div>{[...(session.session_exercises ?? [])].sort((a, b) => a.position - b.position).map((exercise) => <div key={exercise.id}><p><strong>{exercise.exercises?.[0]?.name ?? "Exercise"}</strong></p>{[...(exercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number).map((set) => <p className="muted" key={set.id}>#{set.set_number} · {set.set_type} · {set.weight_kg ?? "—"} kg × {set.reps ?? "—"}{set.rir != null ? ` · RIR ${set.rir}` : ""}</p>)}</div>)}{session.notes && <p className="muted">{session.notes}</p>}</article>)}</section>}
    {events?.length ? <section className="section"><p className="eyebrow">Context</p>{events.map((event) => <article className="card" key={event.id}><strong>{event.title}</strong><p>{event.type.replaceAll("_", " ")} · {event.start_date}{event.end_date ? ` to ${event.end_date}` : ""}</p>{event.notes && <p className="muted">{event.notes}</p>}</article>)}</section> : null}
    {!phase && !log && !measurement && !sessions.length && !(events?.length) && <p className="muted">No recorded data for this date.</p>}
    <nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav>
  </main>;
}
