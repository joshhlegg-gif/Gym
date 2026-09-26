"use client";

import { useMemo, useState } from "react";

const metrics = [
  ["chest_cm", "Chest"],
  ["waist_cm", "Waist"],
  ["left_arm_cm", "Left bicep"],
  ["right_arm_cm", "Right bicep"],
  ["left_thigh_cm", "Left thigh"],
  ["right_thigh_cm", "Right thigh"],
  ["left_calf_cm", "Left calf"],
  ["right_calf_cm", "Right calf"],
] as const;

type Point = { date: string; value: number; label: string };
type Measurement = { date: string } & Partial<Record<(typeof metrics)[number][0], number | null>>;
type Phase = { id: string; name: string; start_date: string; end_date: string | null };

const number = (value: number) => Number(value).toFixed(2).replace(/\.?0+$/, "");
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00.000Z`));

function TrendChart({ title, unit, series, phases, raw }: { title: string; unit: string; series: { name: string; color: string; points: Point[] }[]; phases: Phase[]; raw?: boolean }) {
  const [selected, setSelected] = useState<Point | null>(null);
  const points = series.flatMap((item) => item.points);
  if (!points.length) return <p className="muted">Add more data to see this trend.</p>;

  const orderedDates = [...new Set(points.map((point) => point.date))].sort();
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.12, 0.5);
  const lower = minimum - padding;
  const upper = maximum + padding;
  const width = 360;
  const height = 210;
  const left = 44;
  const right = 12;
  const top = 18;
  const bottom = 36;
  const firstTime = new Date(`${orderedDates[0]}T00:00:00.000Z`).getTime();
  const lastTime = new Date(`${orderedDates.at(-1)!}T00:00:00.000Z`).getTime();
  const x = (date: string) => orderedDates.length === 1 ? (left + width - right) / 2 : left + ((width - right - left) * (new Date(`${date}T00:00:00.000Z`).getTime() - firstTime)) / (lastTime - firstTime);
  const y = (value: number) => top + ((upper - value) * (height - top - bottom)) / (upper - lower || 1);
  const phaseLines = phases.flatMap((phase) => [phase.start_date, phase.end_date].filter((date): date is string => Boolean(date && date >= orderedDates[0] && date <= orderedDates.at(-1)!)));

  return <div className="trend-chart">
    <div className="trend-chart-key"><strong>{title}</strong><span>{series.map((item) => <span className="trend-key" key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} trend with selectable points`}>
      <line x1={left} y1={top} x2={left} y2={height - bottom} className="trend-axis" />
      <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} className="trend-axis" />
      <text x="3" y={top + 5} className="trend-label">{number(upper)} {unit}</text>
      <text x="3" y={height - bottom} className="trend-label">{number(lower)} {unit}</text>
      <text x={left} y={height - 10} className="trend-label">{dateLabel(orderedDates[0])}</text>
      {orderedDates.length > 1 && <text x={width - right} y={height - 10} textAnchor="end" className="trend-label">{dateLabel(orderedDates.at(-1)!)}</text>}
      {phaseLines.map((date) => <line className="trend-phase-line" key={date} x1={x(date)} y1={top} x2={x(date)} y2={height - bottom}><title>Phase boundary: {date}</title></line>)}
      {series.map((item) => <polyline key={item.name} points={item.points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")} fill="none" stroke={item.color} strokeWidth={item.name === "Rolling 7-day average" ? 3 : 1.5} opacity={item.name === "Raw weight" ? 0.65 : 1} />)}
      {series.flatMap((item) => item.points.map((point) => <circle className="trend-point" key={`${item.name}-${point.date}`} cx={x(point.date)} cy={y(point.value)} r={item.name === "Rolling 7-day average" ? 4 : 3.5} fill={item.color} tabIndex={0} role="button" aria-label={`${item.name}: ${dateLabel(point.date)}, ${number(point.value)} ${unit}`} onClick={() => setSelected({ ...point, label: item.name })} onFocus={() => setSelected({ ...point, label: item.name })}><title>{item.name}: {dateLabel(point.date)} · {number(point.value)} {unit}</title></circle>))}
    </svg>
    {selected ? <p className="trend-selection" aria-live="polite">{selected.label}: <strong>{dateLabel(selected.date)} · {number(selected.value)} {unit}</strong></p> : <p className="muted">Tap a point for its exact date and value.</p>}
    {phases.length > 0 && <p className="muted">Phase boundaries: {phases.map((phase) => `${phase.name} (${phase.start_date}–${phase.end_date ?? "present"})`).join(" · ")}</p>}
    {raw && <p className="muted">Raw weight points are shown alongside the rolling average; missing weigh-ins are not filled in.</p>}
  </div>;
}

export function BodyHistoryCharts({ weights, rolling, measurements, phases }: { weights: { date: string; weight: number }[]; rolling: { date: string; weight: number }[]; measurements: Measurement[]; phases: Phase[] }) {
  const [metric, setMetric] = useState<(typeof metrics)[number][0]>("chest_cm");
  const metricLabel = metrics.find(([field]) => field === metric)?.[1] ?? "Measurement";
  const measurementPoints = useMemo(() => measurements.flatMap((measurement) => measurement[metric] == null ? [] : [{ date: measurement.date, value: Number(measurement[metric]), label: metricLabel }]).sort((a, b) => a.date.localeCompare(b.date)), [measurements, metric, metricLabel]);

  return <>
    <section className="section">
      <p className="eyebrow">Bodyweight trend</p>
      <TrendChart title="Bodyweight" unit="kg" phases={phases} raw series={[{ name: "Raw weight", color: "#176b45", points: [...weights].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => ({ date: entry.date, value: entry.weight, label: "Raw weight" })) }, { name: "Rolling 7-day average", color: "#80520d", points: rolling.map((entry) => ({ date: entry.date, value: entry.weight, label: "Rolling 7-day average" })) }]} />
    </section>
    <section className="section">
      <p className="eyebrow">Measurement trend</p>
      <label className="trend-selector">Metric<select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)}>{metrics.map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>
      <TrendChart title={metricLabel} unit="cm" phases={phases} series={[{ name: metricLabel, color: "#176b45", points: measurementPoints }]} />
    </section>
  </>;
}
