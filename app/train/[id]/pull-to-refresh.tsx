"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const triggerDistance = 64;
const maxDistance = 86;

export function PullToRefresh() {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const [distance, setDistance] = useState(0);
  const [isPending, startTransition] = useTransition();

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (window.scrollY > 0 || isPending) return;
    startY.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (startY.current == null || window.scrollY > 0) return;
    const currentY = event.touches[0]?.clientY ?? startY.current;
    const pulled = Math.max(0, currentY - startY.current);
    setDistance(Math.min(maxDistance, pulled * 0.55));
  }

  function finishPull() {
    const shouldRefresh = distance >= triggerDistance;
    startY.current = null;
    setDistance(0);

    if (!shouldRefresh || isPending) return;
    startTransition(() => {
      router.refresh();
    });
  }

  const active = distance > 0 || isPending;
  const ready = distance >= triggerDistance;

  return (
    <div
      className="pull-refresh-zone"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishPull}
      onTouchCancel={finishPull}
    >
      {active && (
        <div
          className={`pull-refresh-indicator${ready ? " is-ready" : ""}`}
          style={{ transform: `translate(-50%, ${Math.max(8, distance)}px)` }}
          aria-live="polite"
        >
          {isPending ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}
    </div>
  );
}
