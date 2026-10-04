"use client";

import { useEffect, useState } from "react";

/** Renders a countdown to `serverEndAt`. Recomputes from the wall clock on
 * every tick and on tab resume, so a backgrounded/throttled tab never drifts
 * — the displayed value is never the source of truth for timing, only the
 * server-side check on each write is. */
export default function Timer({
  serverEndAt,
  onExpire,
}: {
  serverEndAt: string;
  onExpire: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    new Date(serverEndAt).getTime() - Date.now(),
  );

  useEffect(() => {
    function tick() {
      const remaining = new Date(serverEndAt).getTime() - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0) onExpire();
    }
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [serverEndAt, onExpire]);

  const clamped = Math.max(0, remainingMs);
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const low = clamped < 60000;

  return (
    <div
      className={`rounded-md px-3 py-1 font-mono text-sm tabular-nums ${
        low ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" : "bg-zinc-100 dark:bg-zinc-800"
      }`}
    >
      {minutes}:{seconds.toString().padStart(2, "0")}
    </div>
  );
}
