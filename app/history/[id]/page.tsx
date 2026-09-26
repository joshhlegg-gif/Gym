import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteHistoricalSet, deleteHistoricalWorkout, updateHistoricalExercise, updateHistoricalSet, updateWorkoutDate } from "../actions";

const setTypes = ["warmup", "working", "backoff", "drop", "rest_pause"];

export default async function HistoricalWorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");
  const [{ data: workout }, { data: exercises }] = await Promise.all([
    supabase.from("workout_sessions").select("id,started_at,workout_templates(name),session_exercises(id,position,exercise_id,exercises(name),workout_sets(id,set_number,set_type,weight_kg,reps,rir))").eq("id", id).eq("owner_id", ownerId).eq("status", "completed").maybeSingle(),
    supabase.from("exercises").select("id,name").eq("archived", false).order("name"),
  ]);
  if (!workout) notFound();

  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Historical workout</p><h1>{workout.workout_templates?.[0]?.name ?? "Workout"}</h1></div><Link href="/history">History</Link></header>{saved && <p className="notice">Correction saved.</p>}{error && <p className="error">{error}</p>}<section className="section"><p className="eyebrow">Workout date</p><form action={updateWorkoutDate} className="measurement-grid"><input type="hidden" name="workout_id" value={id} /><label>Date<input type="date" name="date" defaultValue={workout.started_at.slice(0, 10)} required /></label><button className="primary" type="submit">Save date</button></form></section>{[...(workout.session_exercises ?? [])].sort((a, b) => a.position - b.position).map((exercise) => <section className="section" key={exercise.id}><form action={updateHistoricalExercise} className="measurement-grid"><input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><label>Exercise<select name="exercise_id" defaultValue={exercise.exercise_id}>{(exercises ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary" type="submit">Save exercise</button></form><div className="history-list">{[...(exercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number).map((set) => <article className="card" key={set.id}><p className="eyebrow">Set {set.set_number}</p><form action={updateHistoricalSet} className="measurement-grid"><input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><input type="hidden" name="set_id" value={set.id} /><label>Type<select name="set_type" defaultValue={set.set_type}>{setTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>kg<input name="weight_kg" type="number" step="0.5" defaultValue={set.weight_kg ?? ""} /></label><label>Reps<input name="reps" type="number" defaultValue={set.reps ?? ""} /></label><label>RIR<input name="rir" type="number" step="0.5" defaultValue={set.rir ?? ""} /></label><button className="primary" type="submit">Save set</button></form><form action={deleteHistoricalSet}><input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><input type="hidden" name="set_id" value={set.id} /><button type="submit">Delete set</button></form></article>)}</div></section>)}<section className="section"><p className="eyebrow">Danger zone</p><form action={deleteHistoricalWorkout}><input type="hidden" name="workout_id" value={id} /><button type="submit">Delete workout</button></form></section><nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">History</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
