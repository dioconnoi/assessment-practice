"use client";

import { useState } from "react";

export default function PersonalityNarrative({ attemptId }: { attemptId: number }) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/narrative`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load summary");
        return;
      }
      setNarrative(data.narrative);
    } finally {
      setLoading(false);
    }
  }

  if (narrative) {
    return (
      <p className="whitespace-pre-line rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
        {narrative}
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={load}
        disabled={loading}
        className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        {loading ? "Thinking…" : "Show AI summary"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
