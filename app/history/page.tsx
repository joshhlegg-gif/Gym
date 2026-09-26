import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const APP_TIME_ZONE = "Australia/Melbourne";
const measurementFields = ["chest_cm", "waist_cm", "left_arm_cm", "right_arm_cm", "left_thigh_cm", "right_thigh_cm", "left_calf_cm", "right_calf_cm"] as const;
const measurementLabels: Record<(typeof measurementFields)[number], string> = { chest_cm: "Chest", waist_cm: "Waist", left_arm_cm: "Left bicep", right_arm_cm: "Right bicep", left_thigh_cm: "Left thigh", right_thigh_cm: "Right thigh", left_calf_cm: "Left calf", right_calf_cm: "Right calf" };

type TimelineLog = { date: string; weight_kg: number | null; calories_kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; tracking_status: string | null; logging_intent: string | null };
type TimelineMeasurement = { date: string } & Partial<Record<(typeof measurementFields)[number], number | null>>;
type TimelineSession = { id: string; started_at: string; workout_templates: { name: string }[] | null; session_exercises: { position: number; exercises: { name: string }[] | null }[] | null };
type TimelineEntry = { log?: TimelineLog; measurement?: TimelineMeasurement; sessions: TimelineSession[] };

function localDate(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function monthBounds(month: string) {
  const start = `${month}-01`;
  return { start, end: `${shiftMonth(month, 1)}-01` };
}

function currentMonth() {
  return localDate(new Date().toISOString()).slice(0, 7);
}

function decimal(value: number | null | undefined) {
  return value == null ? "—" : Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function WorkoutSummary({ session }: { session: { workout_templates?: { name: string }[] | null; session_exercises?: { position: number; exercises?: { name: string }[] | null }[] | null } }) {
  const exercises = [...(session.session_exercises ?? [])].sort((a, b) => a.position - b.position).map((exercise) => exercise.exercises?.[0]?.name).filter(Boolean);
  return <>{session.workout_templates?.[0]?.name ?? "Workout"}{exercises.length ? ` · ${exercises.join(", ")}` : ""}</>;
}

async function WorkoutHistory({ ownerId, exerciseId, exercise, deleted }: { ownerId: string; exerciseId?: string; exercise?: string; deleted?: string }) {
  const supabase = await createClient();
  const { data: exercises } = await supabase.from("exercises").select("id,name").eq("archived", false).order("name");
  const customMatches = exercise?.trim() ? await supabase.from("exercises").select("id").ilike("name", `%${exercise.trim()}%`) : { data: [] };
  const filterIds = exerciseId ? [exerciseId] : customMatches.data?.map((item) => item.id) ?? [];
  const matchingSessions = filterIds.length ? await supabase.from("session_exercises").select("session_id").in("exercise_id", filterIds) : { data: null };
  const sessionIds = [...new Set(matchingSessions.data?.map((item) => item.session_id) ?? [])];
  let sessionsQuery = supabase.from("workout_sessions").select("id,started_at,workout_templates(name),session_exercises(position,exercises(name))").eq("owner_id", ownerId).eq("status", "completed").order("started_at", { ascending: false });
  if (filterIds.length) sessionsQuery = sessionsQuery.in("id", sessionIds);
  const { data: sessions } = filterIds.length && !sessionIds.length ? { data: [] } : await sessionsQuery;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Timeline</p><h1>Workout history</h1></div><Link href="/history">Timeline</Link></header>
    {deleted && <p className="notice">Workout deleted.</p>}
    <section className="section"><p className="eyebrow">Find exercise</p><form className="measurement-grid"><input type="hidden" name="view" value="workouts" /><label>Saved exercise<select name="exercise_id" defaultValue={exerciseId ?? ""}><option value="">All exercises</option>{(exercises ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Or type an exercise<input name="exercise" defaultValue={exercise ?? ""} placeholder="Bench press" /></label><button className="primary" type="submit">Filter</button></form></section>
    <section className="section"><div className="history-list">{sessions?.length ? sessions.map((session) => <article className="history-row" key={session.id}><strong>{localDate(session.started_at)}</strong><span><WorkoutSummary session={session} /></span><Link href={`/history/${session.id}`}>Open</Link></article>) : <p className="muted">No completed workouts found.</p>}</div></section>
    <nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav>
  </main>;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string; exercise_id?: string; exercise?: string; deleted?: string }> }) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const { month: requestedMonth, view, exercise_id, exercise, deleted } = await searchParams;
  if (view === "workouts") return <WorkoutHistory ownerId={ownerId} exerciseId={exercise_id} exercise={exercise} deleted={deleted} />;

  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonth();
  const { start, end } = monthBounds(month);
  const workoutStart = new Date(new Date(`${start}T00:00:00.000Z`).getTime() - 86_400_000).toISOString();
  const workoutEnd = new Date(new Date(`${end}T00:00:00.000Z`).getTime() + 86_400_000).toISOString();
  const [{ data: logs }, { data: measurements }, { data: sessions }, { data: phases }, { data: events }] = await Promise.all([
    supabase.from("daily_logs").select("date,weight_kg,calories_kcal,protein_g,carbs_g,fat_g,tracking_status,logging_intent,notes,tags").eq("owner_id", ownerId).gte("date", start).lt("date", end),
    supabase.from("body_measurements").select("date,chest_cm,waist_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,left_calf_cm,right_calf_cm,notes").eq("owner_id", ownerId).gte("date", start).lt("date", end),
    supabase.from("workout_sessions").select("id,started_at,workout_templates(name),session_exercises(position,exercises(name),workout_sets(id))").eq("owner_id", ownerId).eq("status", "completed").gte("started_at", workoutStart).lt("started_at", workoutEnd),
    supabase.from("phases").select("id,name,start_date,end_date,nutrition_goal,target_calories_kcal").eq("owner_id", ownerId).lte("start_date", end).or(`end_date.is.null,end_date.gte.${start}`),
    supabase.from("life_events").select("id,title,type,start_date,end_date,affects_training,excuses_nutrition_logging").eq("owner_id", ownerId).lte("start_date", end).or(`end_date.is.null,end_date.gte.${start}`),
  ]);

  const entries = new Map<string, TimelineEntry>();
  const entryFor = (date: string) => {
    const existing = entries.get(date);
    if (existing) return existing;
    const created: TimelineEntry = { sessions: [] };
    entries.set(date, created);
    return created;
  };
  for (const log of logs ?? []) entryFor(log.date).log = log as TimelineLog;
  for (const measurement of measurements ?? []) entryFor(measurement.date).measurement = measurement as TimelineMeasurement;
  for (const session of sessions ?? []) {
    const date = localDate(session.started_at);
    if (date >= start && date < end) entryFor(date).sessions.push(session as TimelineSession);
  }
  for (const phase of phases ?? []) {
    if (phase.start_date >= start && phase.start_date < end) entryFor(phase.start_date);
    if (phase.end_date && phase.end_date >= start && phase.end_date < end) entryFor(phase.end_date);
  }
  for (const event of events ?? []) {
    if (event.start_date >= start && event.start_date < end) entryFor(event.start_date);
    if (event.end_date && event.end_date >= start && event.end_date < end && event.end_date !== event.start_date) entryFor(event.end_date);
  }

  const dates = [...entries.keys()].sort((a, b) => b.localeCompare(a));
  const monthLabel = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: APP_TIME_ZONE }).format(new Date(`${start}T12:00:00.000Z`));
  const activePhase = (date: string) => (phases ?? []).find((phase) => phase.start_date <= date && (!phase.end_date || phase.end_date >= date));
  const activeEvents = (date: string) => (events ?? []).filter((event) => event.start_date <= date && (!event.end_date || event.end_date >= date));

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Timeline</p><h1>Fitness timeline</h1></div><Link href="/">Today</Link></header>
    <section className="section"><div className="measurement-grid"><Link href={`/history?month=${shiftMonth(month, -1)}`}>Previous month</Link><strong>{monthLabel}</strong><Link href={`/history?month=${shiftMonth(month, 1)}`}>Next month</Link></div><form className="measurement-grid"><label>Go to month<input type="month" name="month" defaultValue={month} /></label><button type="submit">Go</button></form><p><Link href="/history?view=workouts">Workout history and exercise filter</Link></p></section>
    <section className="section"><div className="history-list">{dates.length ? dates.map((date) => {
      const entry = entries.get(date)!;
      const phase = activePhase(date);
      const contexts = activeEvents(date);
      const log = entry.log;
      const nutrition = [log?.calories_kcal != null ? `${log.calories_kcal} kcal` : null, log?.protein_g != null ? `${log.protein_g}g protein` : null, log?.carbs_g != null ? `${log.carbs_g}g carbs` : null, log?.fat_g != null ? `${log.fat_g}g fat` : null].filter(Boolean);
      const measurementsText = entry.measurement ? measurementFields.map((field) => entry.measurement?.[field] == null ? null : `${measurementLabels[field]} ${decimal(entry.measurement[field])}`).filter(Boolean).join(" · ") : null;
      return <article className="card" key={date}><div className="topbar"><h2>{new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: APP_TIME_ZONE }).format(new Date(`${date}T12:00:00.000Z`))}</h2><Link href={`/history/day/${date}`}>Open day</Link></div>{log?.weight_kg != null && <p>Bodyweight: {decimal(log.weight_kg)} kg</p>}{nutrition.length > 0 && <p>{nutrition.join(" · ")}</p>}{log?.tracking_status && <p className="muted">{log.tracking_status.toLowerCase().includes("not tracked") ? "Food not tracked" : `Tracking: ${log.tracking_status}`}</p>}{log?.logging_intent && <p className="muted">Logging: {log.logging_intent.replaceAll("_", " ")}</p>}{entry.sessions.map((session) => <p key={session.id}>Workout: <WorkoutSummary session={session} /></p>)}{measurementsText && <p>Measurements: {measurementsText}</p>}{phase && <p className="muted">Phase: {phase.name} · {phase.nutrition_goal.replaceAll("_", " ")}{phase.target_calories_kcal != null ? ` · ${phase.target_calories_kcal} kcal target` : ""}</p>}{contexts.map((event) => <p className="muted" key={event.id}>Context: {event.title} · {event.type.replaceAll("_", " ")}{event.affects_training ? " · affects training" : ""}{event.excuses_nutrition_logging ? " · excuses nutrition logging" : ""}</p>)}</article>;
    }) : <p className="muted">No recorded fitness data for this month.</p>}</div></section>
    <nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav>
  </main>;
}
