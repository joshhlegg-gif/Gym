import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProgram } from "../../actions";

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params; const { saved, error } = await searchParams; const supabase = await createClient(); const { data: identity } = await supabase.auth.getClaims(); if (!identity?.claims.sub) redirect("/login");
  const { data: program } = await supabase.from("programs").select("*").eq("id", id).maybeSingle(); if (!program) notFound();
  return <main className="app-shell"><header className="topbar"><h1>Edit program</h1><Link href="/setup">Setup</Link></header>{saved && <p className="notice">Program saved.</p>}{error && <p className="error">{error}</p>}<form action={updateProgram} className="section measurement-form"><input type="hidden" name="id" value={id} /><label>Name<input name="name" required defaultValue={program.name} /></label><div className="measurement-grid"><label>Start<input name="start_date" type="date" required defaultValue={program.start_date} /></label><label>End<input name="end_date" type="date" defaultValue={program.end_date ?? ""} /></label></div><label>Notes<textarea name="notes" rows={3} defaultValue={program.notes ?? ""} /></label><button className="primary">Save program</button></form></main>;
}
