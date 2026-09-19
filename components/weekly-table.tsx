import type { WeeklyAverage } from '@/lib/calc/types';

const fmtKg = (kg?: number) => (kg === undefined ? '—' : kg.toFixed(2));
const fmtInt = (n?: number) => (n === undefined ? '—' : Math.round(n).toLocaleString('en-AU'));

function fmtChange(g?: number) {
  if (g === undefined) return '—';
  const rounded = Math.round(g);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-AU')} g`;
}

export function WeeklyTable({ weeks }: { weeks: WeeklyAverage[] }) {
  if (weeks.length === 0) {
    return <p className="text-sm text-muted">No weeks logged yet.</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-lg border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Week</th>
            <th className="py-2 pr-3 text-right font-medium">Avg</th>
            <th className="py-2 pr-3 text-right font-medium">Change</th>
            <th className="py-2 pr-3 text-right font-medium">kcal</th>
            <th className="py-2 pr-3 text-right font-medium">Steps</th>
            <th className="py-2 text-right font-medium">Tracked</th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].reverse().map((week) => (
            <tr key={week.weekStart} className="border-b border-line/60">
              <td className="py-2.5 pr-3 tabular whitespace-nowrap">
                {week.weekStart}
                {week.lowConfidence && week.readingCount > 0 ? (
                  <span
                    className="ml-1.5 text-muted"
                    title={`${week.readingCount} reading${week.readingCount === 1 ? '' : 's'} — low confidence`}
                  >
                    ·
                  </span>
                ) : null}
              </td>
              <td className="py-2.5 pr-3 text-right tabular">{fmtKg(week.averageKg)}</td>
              <td className="py-2.5 pr-3 text-right tabular">{fmtChange(week.changeG)}</td>
              <td className="py-2.5 pr-3 text-right tabular">{fmtInt(week.averageKcal)}</td>
              <td className="py-2.5 pr-3 text-right tabular">{fmtInt(week.averageSteps)}</td>
              <td className="py-2.5 text-right tabular">{week.trackedDays}/7</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        A dot marks a week built on fewer than four readings — the average is shown, but it is
        thin evidence.
      </p>
    </div>
  );
}
