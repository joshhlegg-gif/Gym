import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getLogsBetween, getOrCreateProfile } from '@/lib/queries';
import { addDays, dayKeyOf } from '@/lib/calc/dates';
import { buildTrend, trendRate, weeklyAverages } from '@/lib/calc/weight';
import { TrendChart } from '@/components/trend-chart';
import { WeeklyTable } from '@/components/weekly-table';

export const dynamic = 'force-dynamic';

function rateLabel(gramsPerWeek: number, samples: number) {
  if (samples < 7) return '—';
  const rounded = Math.round(gramsPerWeek);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-AU')} g/wk`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const profile = await getOrCreateProfile(user.id, user.email ?? '');
  const today = dayKeyOf(new Date(), profile.timeZone);

  const logs = await getLogsBetween(profile.id, addDays(today, -365), today);
  const trend = buildTrend(logs);
  const weeks = weeklyAverages(logs, profile.weekStartsOn);

  const fortnight = trendRate(trend, 14);
  const month = trendRate(trend, 28);

  return (
    <main>
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>

      <section className="mt-6">
        <TrendChart trend={trend} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Rate · 14 days</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {rateLabel(fortnight.gramsPerWeek, fortnight.sampleCount)}
          </p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Rate · 28 days</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {rateLabel(month.gramsPerWeek, month.sampleCount)}
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">By week</h2>
        <div className="mt-3">
          <WeeklyTable weeks={weeks} />
        </div>
      </section>
    </main>
  );
}
