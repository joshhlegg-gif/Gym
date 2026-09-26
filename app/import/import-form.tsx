"use client";

import { useMemo, useState } from "react";
import { importGymJson } from "./actions";
import { validateImportJson } from "./validation";

export function ImportForm() {
  const [json, setJson] = useState("");
  const result = useMemo(() => json.trim() ? validateImportJson(json) : null, [json]);
  const preview = result?.preview;

  return <form action={importGymJson} className="measurement-form"><label>Normalized JSON<textarea name="json" rows={16} required value={json} onChange={(event) => setJson(event.target.value)} placeholder={'{\n  "dailyLogs": [],\n  "phases": [],\n  "events": [],\n  "sessions": []\n}'} /></label>{result?.errors.length ? <div className="error"><strong>Fix these before importing:</strong><ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}{preview && !result?.errors.length ? <section className="card"><p className="eyebrow">Dry-run preview</p><p>{preview.dailyLogs} daily logs · {preview.phases} phases · {preview.events} events · {preview.sessions} sessions</p><p>{preview.exercises} exercises · {preview.sets} sets · {preview.needsReview} records flagged for review</p>{preview.sessionsWithoutSourceRef > 0 && <p className="muted">{preview.sessionsWithoutSourceRef} session(s) have no source reference and cannot be automatically de-duplicated on a repeat import.</p>}</section> : null}<button className="primary" type="submit" disabled={!preview || Boolean(result?.errors.length)}>Import validated data</button></form>;
}
