"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const triggerDistance = 64;
const maxDistance = 86;

export function PullToRefresh() {
  const router = useRouter();
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const [distance, setDistance] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function updateDistance(next: number) {
      distanceRef.current = next;
      setDistance(next);
    }

    function handleTouchStart(event: TouchEvent) {
      if (window.scrollY > 0 || isPending) return;
      startY.current = event.touches[0]?.clientY ?? null;
      updateDistance(0);
    }

    function handleTouchMove(event: TouchEvent) {
      if (startY.current == null || window.scrollY > 0) return;
      const currentY = event.touches[0]?.clientY ?? startY.current;
      const pulled = Math.max(0, currentY - startY.current);
      updateDistance(Math.min(maxDistance, pulled * 0.55));
    }

    function finishPull() {
      const shouldRefresh = distanceRef.current >= triggerDistance;
      startY.current = null;
      updateDistance(0);

      if (!shouldRefresh || isPending) return;
      startTransition(() => {
        router.refresh();
      });
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", finishPull, { passive: true });
    window.addEventListener("touchcancel", finishPull, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", finishPull);
      window.removeEventListener("touchcancel", finishPull);
    };
  }, [isPending, router]);

  const active = distance > 0 || isPending;
  const ready = distance >= triggerDistance;

  if (!active) return null;

  return (
    <div
      className={`pull-refresh-indicator${ready ? " is-ready" : ""}`}
      style={{ transform: `translate(-50%, ${Math.max(8, distance)}px)` }}
      aria-live="polite"
    >
      {isPending ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
    </div>
  );
}
