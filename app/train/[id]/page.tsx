import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { abandonWorkout, addSessionExercise, addSet, completeWorkout, deleteSet, duplicateSet, moveSessionExercise, removeSessionExercise, saveSessionExerciseNotes, saveWorkoutNotes, updateActiveSet } from "../actions";
import { PullToRefresh } from "./pull-to-refresh";
import { RestTimer } from "./rest-timer";

type WorkoutSet = {
  id: string;
  set_number: number;
  set_type: string;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
};

function formatSet(set: WorkoutSet) {
  return `${set.weight_kg ?? "—"} kg × ${set.reps ?? "—"}${set.rir != null ? ` · RIR ${set.rir}` : ""}`;
}

function relationName(value: { name: string } | { name: string }[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

function formatRest(seconds: number | null) {
  if (seconds == null) return "No rest target";
  if (seconds < 60) return `Rest ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `Rest ${minutes}m${remainder ? ` ${remainder}s` : ""}`;
}

function formatRepRange(repMin: number | null, repMax: number | null) {
  if (repMin != null && repMax != null) return repMin === repMax ? `${repMin} reps` : `${repMin}–${repMax} reps`;
  if (repMin != null) return `${repMin}+ reps`;
  if (repMax != null) return `Up to ${repMax} reps`;
  return "No rep target";
}

function previousMatch(currentSet: WorkoutSet, currentSets: WorkoutSet[], previousSets: WorkoutSet[]) {
  const ordinal = currentSets
    .filter((set) => set.set_type === currentSet.set_type && set.set_number <= currentSet.set_number)
    .length;
  return previousSets.filter((set) => set.set_type === currentSet.set_type)[ordinal - 1];
}

export default async function WorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rest?: string; error?: string }> }) {
  const { id } = await params;
  const { rest, error } = await searchParams;
  const restSeconds = Number(rest);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const ownerId = auth?.claims.sub;
  if (!ownerId) redirect("/login");

  const { data: workout } = await supabase
    .from("workout_sessions")
    .select(
      "id,template_id,started_at,notes,workout_templates(name),session_exercises(id,position,exercise_id,notes,exercises(name),workout_sets(id,set_number,set_type,weight_kg,reps,rir))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!workout) notFound();

  const exerciseIds = (workout.session_exercises ?? []).map((exercise) => exercise.exercise_id);
  const [{ data: plans }, { data: completedSessions }, { data: availableExercises }] = await Promise.all([
    workout.template_id
      ? supabase
          .from("template_exercises")
          .select("exercise_id,rep_min,rep_max,default_rest_seconds")
          .eq("template_id", workout.template_id)
      : Promise.resolve({ data: [] }),
    exerciseIds.length
      ? supabase
          .from("workout_sessions")
          .select("id,started_at")
          .eq("owner_id", ownerId)
          .eq("status", "completed")
          .lt("started_at", workout.started_at)
          .order("started_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("exercises")
      .select("id,name")
      .eq("owner_id", ownerId)
      .eq("archived", false)
      .order("name"),
  ]);

  const previousSessionIds = completedSessions?.map((session) => session.id) ?? [];
  const { data: previousExercises } = previousSessionIds.length && exerciseIds.length
    ? await supabase
        .from("session_exercises")
        .select("session_id,exercise_id,workout_sets(id,set_number,set_type,weight_kg,reps,rir)")
        .eq("owner_id", ownerId)
        .in("session_id", previousSessionIds)
        .in("exercise_id", exerciseIds)
    : { data: [] };

  const planByExercise = new Map(plans?.map((plan) => [plan.exercise_id, plan]));
  const historyByExercise = new Map<string, { date: string; sets: WorkoutSet[] }[]>();

  for (const exercise of workout.session_exercises ?? []) {
    const history = (completedSessions ?? []).flatMap((session) => {
      const previousExercise = previousExercises?.find(
        (item) => item.session_id === session.id && item.exercise_id === exercise.exercise_id,
      );
      if (!previousExercise) return [];
      return [{
        date: session.started_at,
        sets: [...(previousExercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number),
      }];
    }).slice(0, 5);

    historyByExercise.set(exercise.id, history);
  }

  return (
    <main className="app-shell">
      <PullToRefresh />
      <header className="topbar">
        <h1>{relationName(workout.workout_templates) ?? "Workout"}</h1>
        <Link href="/train">Exit</Link>
      </header>
      <RestTimer workoutId={id} startSeconds={Number.isFinite(restSeconds) && restSeconds > 0 ? restSeconds : null} />
      {error && <p className="error">{error}</p>}

      <section className="section logger-utility">
        <details>
          <summary>Workout notes</summary>
          <form action={saveWorkoutNotes} className="measurement-form">
            <input type="hidden" name="workout_id" value={id} />
            <label>Workout notes<textarea name="notes" rows={2} defaultValue={workout.notes ?? ""} placeholder="Optional notes for this session" /></label>
            <button className="secondary-button" type="submit">Save notes</button>
          </form>
        </details>
      </section>

      <section className="section logger-add-exercise logger-utility">
        <details>
          <summary>Add an exercise</summary>
          <form action={addSessionExercise} className="measurement-grid">
            <label>Add an exercise
              <select name="exercise_id" required defaultValue="">
                <option value="" disabled>Select exercise</option>
                {(availableExercises ?? []).map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
              </select>
            </label>
            <input type="hidden" name="workout_id" value={id} />
            <button className="secondary-button" type="submit">Add exercise</button>
          </form>
        </details>
      </section>

      <section className="logger-exercises">
        {[...(workout.session_exercises ?? [])].sort((a, b) => a.position - b.position).map((exercise, index, orderedExercises) => {
          const plan = planByExercise.get(exercise.exercise_id);
          const history = historyByExercise.get(exercise.id) ?? [];
          const previous = history[0];
          const earlierHistory = history.slice(1);
          const currentSets = [...(exercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number);

          return (
            <article className="card logger-exercise" key={exercise.id}>
              <header className="logger-exercise-heading"><h2>{relationName(exercise.exercises) ?? "Exercise"}</h2><p className="muted">
                {formatRepRange(plan?.rep_min ?? null, plan?.rep_max ?? null)} · {formatRest(plan?.default_rest_seconds ?? null)}
              </p></header>
              <div className="logger-set-actions">
                <form action={moveSessionExercise}><input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><input type="hidden" name="direction" value="up" /><button className="secondary-button" type="submit" disabled={index === 0}>Move up</button></form>
                <form action={moveSessionExercise}><input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><input type="hidden" name="direction" value="down" /><button className="secondary-button" type="submit" disabled={index === orderedExercises.length - 1}>Move down</button></form>
              </div>
              <details>
                <summary>Exercise notes</summary>
                <form action={saveSessionExerciseNotes} className="measurement-grid">
                  <input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} />
                  <label>Notes<input name="notes" defaultValue={exercise.notes ?? ""} /></label><button className="secondary-button" type="submit">Save notes</button>
                </form>
              </details>

              {previous && (
                <div className="logger-previous muted">
                  <p className="eyebrow">Last time · {new Date(previous.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
                  <p>{previous.sets.map((set) => `#${set.set_number} ${formatSet(set)}`).join(" · ")}</p>
                </div>
              )}

              {earlierHistory.length > 0 && (
                <details className="logger-history">
                  <summary>Earlier history · {earlierHistory.length} session{earlierHistory.length === 1 ? "" : "s"}</summary>
                  <div className="logger-history-list">
                    {earlierHistory.map((entry) => (
                      <div className="logger-history-row" key={entry.date}>
                        <strong>{new Date(entry.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</strong>
                        <span>{entry.sets.map((set) => `#${set.set_number} ${formatSet(set)}`).join(" · ")}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="logger-current-sets">{currentSets.map((set) => {
                const matchingPreviousSet = previous ? previousMatch(set, currentSets, previous.sets) : undefined;
                return (
                  <div className="logger-set-row" key={set.id}>
                    <div className="logger-set-values"><strong>Set {set.set_number}</strong><span><small>Type</small>{set.set_type}</span><span><small>Weight</small>{set.weight_kg ?? "—"} kg</span><span><small>Reps</small>{set.reps ?? "—"}</span><span><small>RIR</small>{set.rir ?? "—"}</span></div>
                    {matchingPreviousSet && <p className="logger-match">Previous match: {formatSet(matchingPreviousSet)}</p>}
                    <div className="logger-set-actions"><form action={duplicateSet}>
                      <input type="hidden" name="workout_id" value={id} />
                      <input type="hidden" name="session_exercise_id" value={exercise.id} />
                      <input type="hidden" name="source_set_id" value={set.id} />
                      <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                      <button className="secondary-button" type="submit">Duplicate</button>
                    </form>
                    <form action={deleteSet}>
                      <input type="hidden" name="workout_id" value={id} />
                      <input type="hidden" name="session_exercise_id" value={exercise.id} />
                      <input type="hidden" name="set_id" value={set.id} />
                      <button className="secondary-button" type="submit">Delete</button>
                    </form></div>
                    <details>
                      <summary>Edit set</summary>
                      <form action={updateActiveSet} className="measurement-grid">
                        <input type="hidden" name="workout_id" value={id} /><input type="hidden" name="session_exercise_id" value={exercise.id} /><input type="hidden" name="set_id" value={set.id} />
                        <label>Type<select name="set_type" defaultValue={set.set_type}><option>working</option><option>warmup</option><option>backoff</option><option>drop</option><option>rest_pause</option></select></label>
                        <label>Weight (kg)<input name="weight_kg" type="number" step="0.5" inputMode="decimal" defaultValue={set.weight_kg ?? ""} /></label>
                        <label>Reps<input name="reps" type="number" inputMode="numeric" defaultValue={set.reps ?? ""} /></label>
                        <label>RIR<input name="rir" type="number" step="0.5" inputMode="decimal" defaultValue={set.rir ?? ""} /></label>
                        <button className="secondary-button" type="submit">Save set</button>
                      </form>
                    </details>
                  </div>
                );
              })}</div>

              {previous && <div className="logger-previous-copies">{previous.sets.map((set) => (
                <form action={duplicateSet} key={set.id}>
                  <input type="hidden" name="workout_id" value={id} />
                  <input type="hidden" name="session_exercise_id" value={exercise.id} />
                  <input type="hidden" name="source_set_id" value={set.id} />
                  <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                  <button className="secondary-button" type="submit">Copy previous #{set.set_number}</button>
                </form>
              ))}</div>}

              <form action={addSet} className="logger-entry-row">
                <input type="hidden" name="workout_id" value={id} />
                <input type="hidden" name="session_exercise_id" value={exercise.id} />
                <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                <label>Type<select name="set_type"><option>working</option><option>warmup</option><option>backoff</option><option>drop</option><option>rest_pause</option></select></label>
                <label>Weight (kg)<input name="weight_kg" type="number" step="0.5" inputMode="decimal" /></label>
                <label>Reps<input name="reps" type="number" inputMode="numeric" /></label>
                <label>RIR<input name="rir" type="number" step="0.5" inputMode="decimal" /></label>
                <button className="primary logger-log-button">Log set</button>
              </form>
              {currentSets.length === 0 && <form action={removeSessionExercise}>
                <input type="hidden" name="workout_id" value={id} />
                <input type="hidden" name="session_exercise_id" value={exercise.id} />
                <button className="secondary-button" type="submit">Skip exercise</button>
              </form>}
            </article>
          );
        })}
      </section>

      <form action={completeWorkout}>
        <input type="hidden" name="workout_id" value={id} />
        <button className="primary" type="submit">Complete workout</button>
      </form>
      <form action={abandonWorkout}>
        <input type="hidden" name="workout_id" value={id} />
        <button className="secondary-button" type="submit">Abandon workout</button>
      </form>
    </main>
  );
}
