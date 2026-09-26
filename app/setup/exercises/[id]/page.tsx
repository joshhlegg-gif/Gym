import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateExercise } from "../../actions";

export default async function ExercisePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params; const { saved, error } = await searchParams; const supabase = await createClient(); const { data: identity } = await supabase.auth.getClaims(); if (!identity?.claims.sub) redirect("/login");
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle(); if (!exercise) notFound();
  return <main className="app-shell"><header className="topbar"><h1>Edit exercise</h1><Link href="/setup">Setup</Link></header>{saved && <p className="notice">Exercise saved.</p>}{error && <p className="error">{error}</p>}<form action={updateExercise} className="section measurement-form"><input type="hidden" name="id" value={id} /><label>Name<input name="name" required defaultValue={exercise.name} /></label><label>Notes<textarea name="notes" rows={3} defaultValue={exercise.notes ?? ""} /></label><label><input type="checkbox" name="archived" value="true" defaultChecked={exercise.archived} /> Archive this exercise</label><button className="primary">Save exercise</button></form></main>;
}
