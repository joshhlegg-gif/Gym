import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rollingSevenDayAverage } from "@/lib/bodyweight";
import { deleteMeasurement, saveBodyweight, saveMeasurements } from "./actions";
import { BodyHistoryCharts } from "./body-history-charts";

const fields = [
  "chest_cm",
  "waist_cm",
  "left_arm_cm",
  "right_arm_cm",
  "left_thigh_cm",
  "right_thigh_cm",
  "left_calf_cm",
  "right_calf_cm",
] as const;

const labels: Record<(typeof fields)[number], string> = {
  chest_cm: "Chest",
  waist_cm: "Waist",
  left_arm_cm: "Left bicep",
  right_arm_cm: "Right bicep",
  left_thigh_cm: "Left thigh",
  right_thigh_cm: "Right thigh",
  left_calf_cm: "Left calf",
  right_calf_cm: "Right calf",
};

const decimal = (number: number | null | undefined) =>
  number == null ? "—" : Number(number).toFixed(2).replace(/\.?0+$/, "");
const value = (number: number | null | undefined) =>
  number == null ? "—" : `${decimal(number)} cm`;
const kilograms = (number: number | null) => number == null ? "—" : `${number.toFixed(1)} kg`;

type WeightEntry = { date: string; weight: number };

function average(entries: WeightEntry[]) {
  return entries.length ? entries.reduce((sum, entry) => sum + entry.weight, 0) / entries.length : null;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function BodyPage({ searchParams }: { searchParams: Promise<{ saved?: string; weightSaved?: string; error?: string; edit?: string }> }) {
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  const ownerId = identity?.claims.sub;
  if (!ownerId) redirect("/login");

  const { saved, weightSaved, error, edit } = await searchParams;
  const [{ data: measurements }, { data: logs }, { data: phases }, { data: editing }] = await Promise.all([
    supabase.from("body_measurements").select("*").order("date", { ascending: false }),
    supabase.from("daily_logs").select("date,weight_kg").not("weight_kg", "is", null).order("date", { ascending: false }),
    supabase.from("phases").select("id,name,start_date,end_date,nutrition_goal,target_rate_kg_per_week").eq("owner_id", ownerId).order("start_date", { ascending: false }),
    edit
      ? supabase.from("body_measurements").select("*").eq("id", edit).eq("owner_id", ownerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const weights = (logs ?? [])
    .map((row) => ({ date: row.date, weight: Number(row.weight_kg) }))
    .filter((entry) => Number.isFinite(entry.weight));
  const currentAverage = average(weights.filter((entry) => entry.date >= daysAgo(6) && entry.date <= daysAgo(0)));
  const previousAverage = average(weights.filter((entry) => entry.date >= daysAgo(13) && entry.date < daysAgo(6)));
  const averageChange = currentAverage != null && previousAverage != null ? currentAverage - previousAverage : null;
  const rolling = rollingSevenDayAverage(weights);
  const latest = measurements?.[0];
  const previous = measurements?.[1];
  const today = daysAgo(0);
  const activePhase = (phases ?? []).find((phase) => phase.start_date <= today && (!phase.end_date || phase.end_date >= today));
  const phaseRates = (phases ?? []).filter((phase) => phase.target_rate_kg_per_week != null).map((phase) => {
    const end = phase.end_date && phase.end_date < today ? phase.end_date : today;
    const averages = rolling.filter((entry) => entry.date >= phase.start_date && entry.date <= end);
    const first = averages[0];
    const last = averages.at(-1);
    const elapsedWeeks = first && last ? (new Date(`${last.date}T00:00:00.000Z`).getTime() - new Date(`${first.date}T00:00:00.000Z`).getTime()) / 604_800_000 : 0;
    return { phase, actual: first && last && elapsedWeeks >= 1 ? (last.weight - first.weight) / elapsedWeeks : null };
  });

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Body</p><h1>Weight & measurements</h1></div>
      <Link href="/">Today</Link>
    </header>
    {saved && <p className="notice">Measurements saved.</p>}
    {weightSaved && <p className="notice">Bodyweight saved.</p>}
    {error && <p className="error">{error}</p>}

    <section className="section">
      <div><p className="eyebrow">Daily bodyweight</p><h2>Log or correct a weigh-in</h2></div>
      <form action={saveBodyweight} className="measurement-grid">
        <label>Date<input type="date" name="date" required defaultValue={today} /></label>
        <label>Weight (kg)<input name="weight_kg" type="number" step="0.1" inputMode="decimal" required autoFocus /></label>
        <button className="primary" type="submit">Save weight</button>
      </form>
    </section>

    <section className="grid">
      <article className="card"><p className="eyebrow">Latest bodyweight</p><h2>{kilograms(weights[0]?.weight ?? null)}</h2><p>Latest date {weights[0]?.date ?? "—"}</p></article>
      <article className="card"><p className="eyebrow">7-day average</p><h2>{kilograms(currentAverage)}</h2><p>Previous {kilograms(previousAverage)}</p><p className="muted">{averageChange == null ? "No prior comparison" : `${averageChange >= 0 ? "+" : ""}${averageChange.toFixed(1)} kg`}</p></article>
      <article className="card"><p className="eyebrow">Current phase</p><h2>{activePhase?.name ?? "No active phase"}</h2><Link href="/setup/phases">Manage phases</Link></article>
    </section>

    <BodyHistoryCharts weights={weights} rolling={rolling} measurements={measurements ?? []} phases={phases ?? []} />

    {phaseRates.length > 0 && <section className="section"><p className="eyebrow">Phase bodyweight rate</p><div className="history-list">{phaseRates.map(({ phase, actual }) => { const target = Number(phase.target_rate_kg_per_week); return <article className="history-row" key={phase.id}><strong>{phase.name}</strong><span>Target {target >= 0 ? "+" : ""}{target.toFixed(2)} kg/week</span><span className="muted">{actual == null ? "Actual rate not yet available" : `Actual ${actual >= 0 ? "+" : ""}${actual.toFixed(2)} kg/week`}</span></article>; })}</div></section>}

    <section className="section">
      <p className="eyebrow">Recent bodyweight</p>
      <div className="history-list">
        {weights.length ? weights.slice(0, 20).map((entry) => <article className="history-row" key={entry.date}><strong>{entry.date}</strong><span>{kilograms(entry.weight)}</span></article>) : <p className="muted">No weigh-ins yet.</p>}
      </div>
    </section>

    <section className="section">
      <div><p className="eyebrow">Measurement session</p><h2>{editing ? `Correct: ${editing.date}` : latest ? `Latest: ${latest.date}` : "First measurement"}</h2></div>
      <form action={saveMeasurements} className="measurement-form">
        <input type="hidden" name="measurement_id" value={editing?.id ?? ""} />
        <label>Date<input type="date" name="date" required defaultValue={editing?.date ?? today} /></label>
        <div className="measurement-grid">
          {fields.map((field) => <label key={field}>{labels[field]}<input name={field} type="number" step="0.01" inputMode="decimal" placeholder="cm" defaultValue={editing?.[field] ?? ""} /></label>)}
        </div>
        <label>Notes<textarea name="notes" rows={2} placeholder="Optional" defaultValue={editing?.notes ?? ""} /></label>
        <button className="primary" type="submit">{editing ? "Save correction" : "Save measurements"}</button>
        {editing && <Link href="/body">Cancel</Link>}
      </form>
      {editing && <form action={deleteMeasurement}><input type="hidden" name="measurement_id" value={editing.id} /><button type="submit">Delete measurement</button></form>}
    </section>

    <section className="section">
      <p className="eyebrow">Recent changes</p>
      <div className="history-list">
        {fields.map((field) => {
          const current = latest?.[field] as number | null;
          const old = previous?.[field] as number | null;
          return <article className="history-row" key={field}><strong>{labels[field]}</strong><span>{value(current)}</span><span className="muted">{current != null && old != null ? `${decimal(Number(current) - Number(old))} cm since ${previous?.date}` : "No prior comparison"}</span></article>;
        })}
      </div>
    </section>

    <section className="section">
      <p className="eyebrow">Measurement history</p>
      <div className="history-list">
        {(measurements ?? []).map((measurement) => <article className="history-row" key={measurement.id}><strong>{measurement.date}</strong><span>{fields.map((field) => measurement[field] == null ? null : `${labels[field]} ${decimal(measurement[field])}`).filter(Boolean).join(" · ") || "No measurements"}</span><Link href={`/body?edit=${measurement.id}`}>Correct</Link></article>)}
      </div>
    </section>

    <nav className="bottom-nav"><Link href="/">Today</Link><Link href="/train">Train</Link><Link href="/history">Timeline</Link><Link href="/body">Body</Link><Link href="/setup">Setup</Link></nav>
  </main>;
}
