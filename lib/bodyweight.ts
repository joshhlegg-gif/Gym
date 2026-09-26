export type BodyweightEntry = { date: string; weight: number };

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function rollingSevenDayAverage(entries: BodyweightEntry[]) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.map((entry) => {
    const start = shiftDate(entry.date, -6);
    const window = ordered.filter((candidate) => candidate.date >= start && candidate.date <= entry.date);
    return { date: entry.date, weight: window.reduce((sum, candidate) => sum + candidate.weight, 0) / window.length };
  });
}
