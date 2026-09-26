import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteLifeEvent, saveLifeEvent } from "./actions";

const eventTypes = ["illness", "injury", "holiday", "travel", "deload", "diet_break", "stress", "other"] as const;
const label = (type: string) => type.replaceAll("_", " ");

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string; deleted?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims.sub) redirect("/login");
  const { edit, saved, deleted, error } = await searchParams;
  const [{ data: events }, { data: phases }, { data: editing }] = await Promise.all([
    supabase.from("life_events").select("id,phase_id,type,title,start_date,end_date,notes,phases(name)").order("start_date", { ascending: false }),
    supabase.from("phases").select("id,name,start_date").order("start_date", { ascending: false }),
    edit ? supabase.from("life_events").select("id,phase_id,type,title,start_date,end_date,notes").eq("id", edit).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Context diary</p><h1>Life events</h1></div><Link href="/">Today</Link></header>{saved && <p className="notice">Life event saved.</p>}{deleted && <p className="notice">Life event deleted.</p>}{error && <p className="error">{error}</p>}<section className="section"><div><p className="eyebrow">{editing ? "Correct event" : "Add context"}</p><h2>{editing ? editing.title : "What affected your training?"}</h2></div><form action={saveLifeEvent} className="measurement-form"><input type="hidden" name="id" value={editing?.id ?? ""} /><label>Title<input name="title" required defaultValue={editing?.title ?? ""} placeholder="Shoulder irritation" /></label><label>Type<select name="type" defaultValue={editing?.type ?? "other"}>{eventTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label><div className="measurement-grid"><label>Start date<input name="start_date" type="date" required defaultValue={editing?.start_date ?? today} /></label><label>End date<input name="end_date" type="date" defaultValue={editing?.end_date ?? ""} /></label></div><label>Linked phase<select name="phase_id" defaultValue={editing?.phase_id ?? ""}><option value="">No linked phase</option>{(phases ?? []).map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label><label>Notes<textarea name="notes" rows={3} defaultValue={editing?.notes ?? ""} placeholder="Optional context" /></label><button className="primary" type="submit">{editing ? "Save changes" : "Save event"}</button></form>{editing && <form action={deleteLifeEvent}><input type="hidden" name="id" value={editing.id} /><button type="submit">Delete event</button></form>}</section><section className="section"><p className="eyebrow">Event history</p><div className="history-list">{events?.length ? events.map((event) => <article className="history-row" key={event.id}><strong>{event.start_date}{event.end_date ? ` to ${event.end_date}` : ""}</strong><span>{event.title} · {label(event.type)}{event.phases?.[0]?.name ? ` · ${event.phases[0].name}` : ""}{event.notes ? ` · ${event.notes}` : ""}</span><Link href={`/diary?edit=${event.id}`}>Edit</Link></article>) : <p className="muted">No life events yet.</p>}</div></section><nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
