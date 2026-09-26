import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addSet, completeWorkout, deleteSet, duplicateSet } from "../actions";
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

export default async function WorkoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rest?: string }> }) {
  const { id } = await params;
  const { rest } = await searchParams;
  const restSeconds = Number(rest);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const ownerId = auth?.claims.sub;
  if (!ownerId) redirect("/login");

  const { data: workout } = await supabase
    .from("workout_sessions")
    .select(
      "id,template_id,started_at,workout_templates(name),session_exercises(id,position,exercise_id,exercises(name),workout_sets(id,set_number,set_type,weight_kg,reps,rir))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!workout) notFound();

  const exerciseIds = (workout.session_exercises ?? []).map((exercise) => exercise.exercise_id);
  const [{ data: plans }, { data: completedSessions }] = await Promise.all([
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
  const previousByExercise = new Map<string, { date: string; sets: WorkoutSet[] }>();

  for (const exercise of workout.session_exercises ?? []) {
    const previous = completedSessions?.find((session) =>
      previousExercises?.some(
        (item) => item.session_id === session.id && item.exercise_id === exercise.exercise_id,
      ),
    );
    const previousExercise = previous && previousExercises?.find(
      (item) => item.session_id === previous.id && item.exercise_id === exercise.exercise_id,
    );

    if (previous && previousExercise) {
      previousByExercise.set(exercise.id, {
        date: previous.started_at,
        sets: [...(previousExercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number),
      });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>{workout.workout_templates?.[0]?.name ?? "Workout"}</h1>
        <Link href="/train">Exit</Link>
      </header>
      <RestTimer workoutId={id} startSeconds={Number.isFinite(restSeconds) && restSeconds > 0 ? restSeconds : null} />

      <section className="section">
        {workout.session_exercises?.sort((a, b) => a.position - b.position).map((exercise) => {
          const plan = planByExercise.get(exercise.exercise_id);
          const previous = previousByExercise.get(exercise.id);
          const currentSets = [...(exercise.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number);

          return (
            <article className="card" key={exercise.id}>
              <h2>{exercise.exercises?.[0]?.name}</h2>
              <p className="muted">
                {formatRepRange(plan?.rep_min ?? null, plan?.rep_max ?? null)} · {formatRest(plan?.default_rest_seconds ?? null)}
              </p>

              {previous && (
                <div className="muted">
                  <p>Last time — {new Date(previous.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
                  {previous.sets.map((set) => <p key={set.id}>#{set.set_number} · {set.set_type} · {formatSet(set)}</p>)}
                </div>
              )}

              {currentSets.map((set) => {
                const matchingPreviousSet = previous ? previousMatch(set, currentSets, previous.sets) : undefined;
                return (
                  <div key={set.id}>
                    <p>#{set.set_number} · {set.set_type} · {formatSet(set)}</p>
                    {matchingPreviousSet && <p className="muted">Previous: {formatSet(matchingPreviousSet)}</p>}
                    <form action={duplicateSet}>
                      <input type="hidden" name="workout_id" value={id} />
                      <input type="hidden" name="session_exercise_id" value={exercise.id} />
                      <input type="hidden" name="source_set_id" value={set.id} />
                      <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                      <button type="submit">Duplicate set</button>
                    </form>
                    <form action={deleteSet}>
                      <input type="hidden" name="workout_id" value={id} />
                      <input type="hidden" name="session_exercise_id" value={exercise.id} />
                      <input type="hidden" name="set_id" value={set.id} />
                      <button type="submit">Delete set</button>
                    </form>
                  </div>
                );
              })}

              {previous && previous.sets.map((set) => (
                <form action={duplicateSet} key={set.id}>
                  <input type="hidden" name="workout_id" value={id} />
                  <input type="hidden" name="session_exercise_id" value={exercise.id} />
                  <input type="hidden" name="source_set_id" value={set.id} />
                  <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                  <button type="submit">Duplicate previous #{set.set_number}</button>
                </form>
              ))}

              <form action={addSet} className="measurement-grid">
                <input type="hidden" name="workout_id" value={id} />
                <input type="hidden" name="session_exercise_id" value={exercise.id} />
                <input type="hidden" name="rest_seconds" value={plan?.default_rest_seconds ?? 0} />
                <label>Type<select name="set_type"><option>working</option><option>warmup</option><option>backoff</option><option>drop</option><option>rest_pause</option></select></label>
                <label>kg<input name="weight_kg" type="number" step="0.5" /></label>
                <label>Reps<input name="reps" type="number" /></label>
                <label>RIR<input name="rir" type="number" step="0.5" /></label>
                <button className="primary">Add set</button>
              </form>
            </article>
          );
        })}
      </section>

      <form action={completeWorkout}>
        <input type="hidden" name="workout_id" value={id} />
        <button className="primary" type="submit">Complete workout</button>
      </form>
    </main>
  );
}
