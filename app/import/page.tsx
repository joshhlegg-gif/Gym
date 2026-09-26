import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ imported?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims.sub) redirect("/login");
  const { imported, error } = await searchParams;

  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Legacy data</p><h1>Import GYM JSON</h1></div><Link href="/setup">Setup</Link></header>{imported && <p className="notice">Import complete. Added {imported} new session(s); sessions with matching source references were skipped.</p>}{error && <p className="error">{error}</p>}<section className="section"><p className="eyebrow">Safe alpha import</p><p>Paste normalized JSON from the legacy-sheet conversion. Nothing is written until it validates and you press Import.</p><ImportForm /></section><section className="section"><p className="eyebrow">Idempotency and limits</p><p>Sessions with a source reference are skipped when that reference has already been imported. Phases and events have no source-reference column, so exact matching records are skipped conservatively.</p><p className="muted">Existing daily-log values are never replaced; imported values only fill empty fields. Sessions without a source reference cannot be safely de-duplicated automatically. Review flags are stored for sessions and sets only; flagged daily logs, phases, and events are rejected.</p></section><nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav></main>;
}
