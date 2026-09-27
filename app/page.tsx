import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const kg = (value: number | null | undefined) => value == null ? "—" : `${Number(value).toFixed(1)} kg`;

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(new Date(`${today}T00:00:00.000Z`).getTime() - 604800000).toISOString();
  const [phase, program, sessions, active, logs, event] = await Promise.all([
    supabase.from("phases").select("name,nutrition_goal,training_goal,target_calories_kcal,estimated_maintenance_kcal").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("programs").select("name").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("start_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("status", "completed").gte("started_at", weekAgo),
    supabase.from("workout_sessions").select("id").eq("status", "active").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("daily_logs").select("weight_kg").not("weight_kg", "is", null).order("date", { ascending: false }).limit(14),
    supabase.from("life_events").select("title,type,start_date,end_date").lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("start_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const weights = (logs.data ?? []).map((entry) => Number(entry.weight_kg)).filter(Number.isFinite);
  const average = (items: number[]) => items.length ? items.reduce((total, value) => total + value, 0) / items.length : null;
  const currentAverage = average(weights.slice(0, 7));
  const previousAverage = average(weights.slice(7));

  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Today</p><h1>Gym log</h1></div><Link href="/setup">Setup</Link></header><div className="today-focus"><section className="today-phase"><p className="eyebrow">Current phase</p>{phase.data ? <><h2>{phase.data.name}</h2><p>{phase.data.nutrition_goal.replaceAll("_", " ")} · {phase.data.training_goal}</p><p className="muted">{phase.data.target_calories_kcal ?? "—"} kcal target · {phase.data.estimated_maintenance_kcal ?? "—"} maintenance</p></> : <><h2>No active phase</h2><Link href="/setup/phases">Create a phase</Link></>}</section><section className="today-body"><div><p className="eyebrow">Latest bodyweight</p><p className="today-body-value">{kg(weights[0])}</p><p className="muted">7-day average {kg(currentAverage)}</p></div><div><p className="eyebrow">Trend</p><p>{currentAverage != null && previousAverage != null ? `${currentAverage - previousAverage >= 0 ? "+" : ""}${(currentAverage - previousAverage).toFixed(1)} kg` : "No comparison"}</p><p className="muted">Previous {kg(previousAverage)}</p></div></section><section className="today-training"><div><p className="eyebrow">Training</p><strong>{active.data ? "Workout in progress" : "Ready to train"}</strong><p className="muted">{sessions.count ?? 0} sessions this week · {program.data?.name ?? "No active program"}</p></div><Link className="primary" href={active.data ? `/train/${active.data.id}` : "/train"}>{active.data ? "Resume" : "Start workout"}</Link></section><div className="today-quick-actions"><Link href="/body">Log weight</Link><Link href="/body#measurements">Measurements</Link><Link href="/body#photos">Progress photo</Link><Link href="/diary">Life event</Link></div>{event.data && <section className="today-context"><div><p className="eyebrow">Current context</p><strong>{event.data.title}</strong><p className="muted">{event.data.type} · {event.data.start_date} to {event.data.end_date ?? "present"}</p></div><Link href="/diary">Manage</Link></section>}<p><Link href="/history">View timeline</Link></p></div><nav className="bottom-nav"><Link href="/" aria-current="page">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
