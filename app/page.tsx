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
  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Today</p><h1>Gym log</h1></div><Link href="/setup">Setup</Link></header><section className="action-card"><div><p className="muted">{active.data ? "Workout in progress" : "Ready to train"}</p><strong>{active.data ? "Resume your workout" : "Start your next session"}</strong></div><Link className="primary" href={active.data ? `/train/${active.data.id}` : "/train"}>{active.data ? "Resume" : "Train"}</Link></section><section className="grid"><article className="card"><p className="eyebrow">Current phase</p>{phase.data ? <><h2>{phase.data.name}</h2><p>{phase.data.nutrition_goal.replaceAll("_", " ")} · {phase.data.training_goal}</p><p className="muted">{phase.data.target_calories_kcal ?? "—"} kcal target · {phase.data.estimated_maintenance_kcal ?? "—"} maintenance</p></> : <p className="muted">No active phase. <Link href="/setup/phases">Create one</Link>.</p>}</article><article className="card"><p className="eyebrow">Bodyweight</p><h2>{kg(weights[0])}</h2><p>7-day avg {kg(currentAverage)}</p><p className="muted">Previous {kg(previousAverage)}{currentAverage != null && previousAverage != null ? ` · ${(currentAverage - previousAverage).toFixed(1)} kg` : ""}</p><Link href="/body">Log weight</Link></article><article className="card"><p className="eyebrow">Training</p><h2>{sessions.count ?? 0} sessions</h2><p>This week · {program.data?.name ?? "No active program"}</p><Link href="/history">View timeline</Link></article>{event.data && <article className="card alert-card"><p className="eyebrow">Current context</p><h2>{event.data.title}</h2><p>{event.data.type} · {event.data.start_date} to {event.data.end_date ?? "present"}</p><Link href="/diary">Manage context</Link></article>}</section><p><Link href="/diary">Log life event or context</Link></p><nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
