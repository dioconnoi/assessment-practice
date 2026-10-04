"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Timer from "@/components/Timer";

interface AttemptQuestion {
  attemptQuestionId: number;
  ordinal: number;
  questionId: number;
  scenarioText: string;
  options: { id: string; text: string }[];
  response: { selectedOptionId: string } | null;
}

interface AttemptData {
  id: number;
  status: string;
  serverEndAt: string;
  questions: AttemptQuestion[];
}

export default function AttemptRunner({ attemptId }: { attemptId: number }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptData | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 0 until the mount effect below sets a real timestamp — Date.now() is an
  // impure call and can't run directly during render.
  const questionStartedAt = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/attempts/${attemptId}`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load attempt");
        return;
      }
      if (data.status !== "in_progress") {
        router.replace(`/attempts/${attemptId}/results`);
        return;
      }
      setAttempt(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, router]);

  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [index]);

  const current = attempt?.questions[index];

  const save = useCallback(
    (questionId: number, selectedOptionId: string) => {
      const timeSpentMs = Date.now() - questionStartedAt.current;
      fetch(`/api/attempts/${attemptId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId, timeSpentMs }),
        keepalive: true,
      }).catch(() => {
        // best-effort autosave — a transient failure here just means the
        // next save (or the final submit) carries the latest answer instead
      });
    },
    [attemptId],
  );

  function selectOption(optionId: string) {
    if (!attempt || !current) return;
    const updated = { ...attempt };
    updated.questions = attempt.questions.map((q, i) =>
      i === index ? { ...q, response: { selectedOptionId: optionId } } : q,
    );
    setAttempt(updated);

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => save(current.questionId, optionId), 400);
  }

  // flush the latest answer if the tab is hidden/closed before the debounce fires
  useEffect(() => {
    function flush() {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      if (current?.response) save(current.questionId, current.response.selectedOptionId);
    }
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [current, save]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      router.push(`/attempts/${attemptId}/results`);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <main className="p-4 text-red-600">{error}</main>;
  if (!attempt || !current) return <main className="p-4 text-zinc-500">Loading…</main>;

  const isLast = index === attempt.questions.length - 1;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
          Question {index + 1} of {attempt.questions.length}
        </span>
        <Timer serverEndAt={attempt.serverEndAt} onExpire={handleSubmit} />
      </div>

      <p className="text-base leading-relaxed">{current.scenarioText}</p>

      <p className="text-sm font-medium text-zinc-500">
        Which response would be most effective?
      </p>
      <div className="flex flex-col gap-2">
        {current.options.map((option) => {
          const selected = current.response?.selectedOptionId === option.id;
          return (
            <button
              key={option.id}
              onClick={() => selectOption(option.id)}
              className={`rounded-lg border p-3 text-left text-sm ${
                selected
                  ? "border-black bg-black/5 dark:border-white dark:bg-white/10"
                  : "border-black/10 dark:border-white/10"
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-black/10 pt-4 dark:border-white/10">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-md px-4 py-2 text-sm disabled:opacity-30"
        >
          Prev
        </button>
        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(attempt.questions.length - 1, i + 1))}
            className="rounded-md bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Next
          </button>
        )}
      </div>
    </main>
  );
}
