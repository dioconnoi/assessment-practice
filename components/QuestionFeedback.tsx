"use client";

import { useState } from "react";

export default function QuestionFeedback({
  attemptId,
  questionId,
}: {
  attemptId: number;
  questionId: number;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/questions/${questionId}/feedback`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load feedback");
        return;
      }
      setFeedback(data.feedback);
    } finally {
      setLoading(false);
    }
  }

  if (feedback) {
    return <p className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">{feedback}</p>;
  }

  return (
    <div>
      <button
        onClick={load}
        disabled={loading}
        className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
      >
        {loading ? "Thinking…" : "Show AI feedback"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
