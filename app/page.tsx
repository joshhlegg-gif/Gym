import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getLogsBetween, getOrCreateProfile } from '@/lib/queries';
import { addDays, dayKeyOf, weekStartOf } from '@/lib/calc/dates';
import { buildTrend, weeklyAverages } from '@/lib/calc/weight';
import { saveDay, signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const profile = await getOrCreateProfile(user.id, user.email ?? '');
  const today = dayKeyOf(new Date(), profile.timeZone);

  const logs = await getLogsBetween(profile.id, addDays(today, -180), today);
  const trend = buildTrend(logs);
  const weeks = weeklyAverages(logs, profile.weekStartsOn);

  const todayLog = logs.find((l) => l.date === today);
  const lastReading = [...logs].reverse().find((l) => l.weightKg !== undefined)?.weightKg;
  const trendToday = trend[trend.length - 1]?.trendKg;
  const thisWeek = weeks.find((w) => w.weekStart === weekStartOf(today, profile.weekStartsOn));

  return (
    <main>
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-muted tabular">{today}</p>
        </div>
        <form action={signOut}>
          <button className="text-xs text-muted underline underline-offset-4">Sign out</button>
        </form>
      </header>

      <form action={saveDay} className="mt-6">
        <input type="hidden" name="date" value={today} />

        <section className="rounded-xl border border-line p-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Weight</span>
            <div className="flex items-baseline gap-2">
              <input
                type="number"
                name="weightKg"
                step="0.1"
                min="20"
                max="400"
                inputMode="decimal"
                defaultValue={todayLog?.weightKg ?? lastReading ?? ''}
                className="w-40 bg-transparent text-5xl font-semibold tabular tracking-tight outline-none"
              />
              <span className="text-lg text-muted">kg</span>
            </div>
          </label>

          {/*
            The trend and the weekly average are the signal, so they get the
            emphasis. Today's raw reading is noise and is shown last and small
            — reversing this is the single easiest way to make the app lie.
          */}
          <dl className="mt-4 flex gap-6 border-t border-line pt-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Trend</dt>
              <dd className="text-2xl font-semibold tabular">
                {trendToday === undefined ? '—' : trendToday.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">This week</dt>
              <dd className="text-2xl font-semibold tabular">
                {thisWeek?.averageKg === undefined ? '—' : thisWeek.averageKg.toFixed(2)}
              </dd>
              <dd className="text-xs text-muted">
                {thisWeek ? `${thisWeek.readingCount} reading${thisWeek.readingCount === 1 ? '' : 's'}` : ''}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
            <span className="text-xs uppercase tracking-wide text-muted">Calories</span>
            <input
              type="number"
              name="caloriesKcal"
              min="0"
              max="20000"
              inputMode="numeric"
              defaultValue={todayLog?.caloriesKcal ?? ''}
              className="w-full bg-transparent text-2xl font-semibold tabular outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 rounded-xl border border-line p-4">
            <span className="text-xs uppercase tracking-wide text-muted">Steps</span>
            <input
              type="number"
              name="steps"
              min="0"
              max="200000"
              inputMode="numeric"
              defaultValue={todayLog?.steps ?? ''}
              className="w-full bg-transparent text-2xl font-semibold tabular outline-none"
            />
          </label>
        </section>

        <fieldset className="mt-4 rounded-xl border border-line p-4">
          <legend className="px-1 text-xs uppercase tracking-wide text-muted">Tracking</legend>
          <div className="flex gap-4">
            {(['tracked', 'partial', 'untracked'] as const).map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="radio"
                  name="trackingStatus"
                  value={status}
                  defaultChecked={(todayLog?.trackingStatus ?? 'untracked') === status}
                />
                {status}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Untracked days are left out of the maintenance estimate rather than counted as zero.
          </p>
        </fieldset>

        <button className="mt-4 w-full rounded-lg bg-trend px-4 py-3.5 font-medium text-paper">
          Save
        </button>
      </form>
    </main>
  );
}
