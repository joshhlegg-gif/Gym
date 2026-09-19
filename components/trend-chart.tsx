import type { TrendPoint } from '@/lib/calc/types';

/**
 * Hand-rolled SVG rather than a charting library.
 *
 * The chart this app needs is a line, some dots and, later, coloured bands
 * behind them. That is a few dozen lines of path arithmetic, against a
 * dependency that would ship a layout engine and an animation runtime to draw
 * it. Revisit if the dashboard ever needs interaction beyond reading it.
 */

interface Props {
  trend: TrendPoint[];
  /** Rendered viewBox. The SVG scales to its container. */
  width?: number;
  height?: number;
}

export function TrendChart({ trend, width = 720, height = 220 }: Props) {
  if (trend.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-line text-sm text-muted">
        Two weigh-ins and a line appears.
      </div>
    );
  }

  const pad = { top: 12, right: 8, bottom: 20, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = trend.flatMap((p) => [p.trendKg, ...(p.readingKg === undefined ? [] : [p.readingKg])]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; give it a kilogram of air either side.
  const span = max - min < 0.5 ? 1 : (max - min) * 1.15;
  const mid = (max + min) / 2;
  const lo = mid - span / 2;

  const x = (i: number) => pad.left + (i / (trend.length - 1)) * plotW;
  const y = (kg: number) => pad.top + plotH - ((kg - lo) / span) * plotH;

  const line = trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join('');

  const ticks = [lo + span * 0.15, mid, lo + span * 0.85];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-52 w-full"
      role="img"
      aria-label={`Bodyweight trend from ${trend[0]!.date} to ${trend[trend.length - 1]!.date}`}
    >
      {ticks.map((kg) => (
        <g key={kg}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(kg)}
            y2={y(kg)}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
          <text
            x={pad.left - 6}
            y={y(kg) + 3.5}
            textAnchor="end"
            className="tabular"
            fontSize={10}
            fill="var(--color-muted)"
          >
            {kg.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Readings sit behind the trend and stay faint: they are the noise. */}
      {trend.map((p) =>
        p.readingKg === undefined ? null : (
          <circle key={p.date} cx={x(trend.indexOf(p))} cy={y(p.readingKg)} r={1.8} fill="var(--color-reading)" />
        ),
      )}

      <path d={line} fill="none" stroke="var(--color-trend)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

      <text x={pad.left} y={height - 4} fontSize={10} fill="var(--color-muted)">
        {trend[0]!.date}
      </text>
      <text x={width - pad.right} y={height - 4} textAnchor="end" fontSize={10} fill="var(--color-muted)">
        {trend[trend.length - 1]!.date}
      </text>
    </svg>
  );
}
