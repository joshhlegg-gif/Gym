import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ exercise_id?: string; exercise?: string; deleted?: string }> }) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const { exercise_id, exercise, deleted } = await searchParams;
  const { data: exercises } = await supabase.from("exercises").select("id,name").eq("archived", false).order("name");
  const customMatches = exercise?.trim()
    ? await supabase.from("exercises").select("id").ilike("name", `%${exercise.trim()}%`)
    : { data: [] };
  const filterIds = exercise_id ? [exercise_id] : customMatches.data?.map((item) => item.id) ?? [];
  const matchingSessions = filterIds.length
    ? await supabase.from("session_exercises").select("session_id").in("exercise_id", filterIds)
    : { data: null };
  const sessionIds = [...new Set(matchingSessions.data?.map((item) => item.session_id) ?? [])];
  let sessionsQuery = supabase
    .from("workout_sessions")
    .select("id,started_at,workout_templates(name),session_exercises(position,exercises(name))")
    .eq("owner_id", ownerId)
    .eq("status", "completed")
    .order("started_at", { ascending: false });
  if (filterIds.length) sessionsQuery = sessionsQuery.in("id", sessionIds);
  const { data: sessions } = filterIds.length && !sessionIds.length
    ? { data: [] }
    : await sessionsQuery;

  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">History</p><h1>Completed workouts</h1></div><Link href="/">Today</Link></header>{deleted && <p className="notice">Workout deleted.</p>}<section className="section"><p className="eyebrow">Find exercise</p><form className="measurement-grid"><label>Saved exercise<select name="exercise_id" defaultValue={exercise_id ?? ""}><option value="">All exercises</option>{(exercises ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Or type an exercise<input name="exercise" defaultValue={exercise ?? ""} placeholder="Bench press" /></label><button className="primary" type="submit">Filter</button></form></section><section className="section"><div className="history-list">{sessions?.length ? sessions.map((session) => <article className="history-row" key={session.id}><strong>{session.started_at.slice(0, 10)}</strong><span>{session.workout_templates?.[0]?.name ?? "Workout"} · {[...(session.session_exercises ?? [])].sort((a, b) => a.position - b.position).map((exercise) => exercise.exercises?.[0]?.name).filter(Boolean).join(", ")}</span><Link href={`/history/${session.id}`}>Open</Link></article>) : <p className="muted">No completed workouts found.</p>}</div></section><nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">History</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
