"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartAttemptButton({ templateSlug }: { templateSlug: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start attempt");
        return;
      }
      router.push(`/attempts/${data.attemptId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={start}
        disabled={loading}
        className="w-full rounded-md bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {loading ? "Starting…" : "Start attempt"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
