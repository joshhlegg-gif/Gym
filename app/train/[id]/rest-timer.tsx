"use client";

import { useEffect, useRef, useState } from "react";

type TimerState = {
  endAt: number | null;
  pausedSeconds: number | null;
  durationSeconds: number;
  alerted: boolean;
};

function remainingSeconds(timer: TimerState) {
  if (timer.endAt == null) return timer.pausedSeconds ?? 0;
  return Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
}

export function RestTimer({ workoutId, startSeconds }: { workoutId: string; startSeconds: number | null }) {
  const storageKey = `gym-rest-timer:${workoutId}`;
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [editedSeconds, setEditedSeconds] = useState("");
  const hasStartedFromQuery = useRef(false);

  function save(next: TimerState | null) {
    if (next) localStorage.setItem(storageKey, JSON.stringify(next));
    else localStorage.removeItem(storageKey);
    setTimer(next);
    setRemaining(next ? remainingSeconds(next) : 0);
  }

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const restored = stored ? JSON.parse(stored) as TimerState : null;
    const seconds = startSeconds && startSeconds > 0 ? startSeconds : null;
    const next = seconds
      ? { endAt: Date.now() + seconds * 1000, pausedSeconds: null, durationSeconds: seconds, alerted: false }
      : restored;

    if (!hasStartedFromQuery.current && seconds) {
      hasStartedFromQuery.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("rest");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }

    if (next) localStorage.setItem(storageKey, JSON.stringify(next));
    const frame = window.requestAnimationFrame(() => {
      setRemaining(next ? remainingSeconds(next) : 0);
      setTimer(next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [startSeconds, storageKey]);

  useEffect(() => {
    if (!timer?.endAt || timer.alerted) return;

    const tick = () => {
      const seconds = remainingSeconds(timer);
      setRemaining(seconds);
      if (seconds > 0) return;

      const expired = { ...timer, alerted: true };
      localStorage.setItem(storageKey, JSON.stringify(expired));
      setTimer(expired);
      navigator.vibrate?.([180, 90, 180]);
      window.alert("Rest complete");
    };

    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [storageKey, timer]);

  if (!timer) return null;

  const isPaused = timer.endAt == null;
  const isExpired = !isPaused && remaining === 0;
  const label = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const applyEditedSeconds = () => {
    const seconds = Number(editedSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) return;
    save({ endAt: isPaused ? null : Date.now() + seconds * 1000, pausedSeconds: isPaused ? seconds : null, durationSeconds: seconds, alerted: false });
    setEditedSeconds("");
  };

  return (
    <aside className="rest-timer" aria-live="polite">
      <strong>{isExpired ? "Rest complete" : `Rest ${label}`}</strong>
      <div className="rest-timer-edit">
        <label>Set rest seconds<input type="number" min="0" inputMode="numeric" value={editedSeconds} onChange={(event) => setEditedSeconds(event.target.value)} placeholder={String(remaining)} /></label>
        <button type="button" onClick={applyEditedSeconds}>Apply</button>
      </div>
      <div className="rest-timer-controls">
        {!isExpired && (isPaused ? (
          <button type="button" onClick={() => save({ ...timer, endAt: Date.now() + remaining * 1000, pausedSeconds: null })}>Resume</button>
        ) : (
          <button type="button" onClick={() => save({ ...timer, endAt: null, pausedSeconds: remaining })}>Pause</button>
        ))}
        <button type="button" onClick={() => save({ ...timer, endAt: Date.now() + timer.durationSeconds * 1000, pausedSeconds: null, alerted: false })}>Reset</button>
        <button type="button" onClick={() => {
          const nextRemaining = remaining + 30;
          save(isPaused
            ? { ...timer, pausedSeconds: nextRemaining, alerted: false }
            : { ...timer, endAt: Date.now() + nextRemaining * 1000, pausedSeconds: null, alerted: false });
        }}>+30s</button>
        <button type="button" onClick={() => save(null)}>Dismiss</button>
      </div>
    </aside>
  );
}
