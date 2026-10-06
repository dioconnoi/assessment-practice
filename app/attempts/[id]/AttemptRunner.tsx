"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Timer from "@/components/Timer";

interface BaseQuestion {
  attemptQuestionId: number;
  ordinal: number;
  questionId: number;
}

interface SjtQuestionView extends BaseQuestion {
  format: "sjt";
  scenarioText: string;
  options: { id: string; text: string }[];
  response: { selectedOptionId: string } | null;
}

interface LikertQuestionView extends BaseQuestion {
  format: "likert";
  stem: string;
  scaleMin: number;
  scaleMax: number;
  response: { kind: "likert"; value: number } | null;
}

interface ForcedChoiceQuestionView extends BaseQuestion {
  format: "forced_choice";
  stem: string;
  statements: { id: string; text: string }[];
  response: { kind: "forced_choice"; mostLikeId?: string; leastLikeId?: string } | null;
}

interface ReasoningQuestionView extends BaseQuestion {
  format: "reasoning";
  stem: string;
  passage: {
    title: string | null;
    body: string;
    dataTable: { caption?: string; columns: string[]; rows: (string | number)[][] } | null;
  } | null;
  options: { id: string; text: string }[];
  response: { selectedOptionId: string } | null;
}

type AttemptQuestionView =
  | SjtQuestionView
  | LikertQuestionView
  | ForcedChoiceQuestionView
  | ReasoningQuestionView;

interface AttemptData {
  id: number;
  status: string;
  serverEndAt: string;
  questions: AttemptQuestionView[];
}

export default function AttemptRunner({ attemptId }: { attemptId: number }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptData | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 0 until the mount effect below sets a real timestamp — Date.now() is an
  // impure call and can't run directly during render.
  const questionStartedAt = useRef<number>(0);
  // Tracks the most recent answer-save request so Submit can wait for it —
  // otherwise a click on the very last answer, immediately followed by
  // Submit, could race the PATCH and score the attempt without it.
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());

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

  const postAnswer = useCallback(
    (questionId: number, body: Record<string, unknown>) => {
      const timeSpentMs = Date.now() - questionStartedAt.current;
      const promise = fetch(`/api/attempts/${attemptId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, timeSpentMs }),
        keepalive: true,
      }).catch(() => {
        // best-effort autosave — a transient failure here just means the
        // next save (or the final submit) carries the latest answer instead
      });
      lastSave.current = promise;
      return promise;
    },
    [attemptId],
  );

  function updateCurrent(response: AttemptQuestionView["response"]) {
    if (!attempt) return;
    setAttempt({
      ...attempt,
      questions: attempt.questions.map((q, i) =>
        i === index ? ({ ...q, response } as AttemptQuestionView) : q,
      ),
    });
  }

  // Every answer here is a discrete button click, not a text/drag input, so
  // there's no high-frequency event stream worth debouncing — save
  // immediately on each click. (An earlier debounced version using one
  // shared timeout silently dropped the answer if the user moved to the
  // next question, or submitted, within the debounce window.)

  function selectOption(optionId: string) {
    if (!current) return;
    updateCurrent({ selectedOptionId: optionId });
    postAnswer(current.questionId, { selectedOptionId: optionId });
  }

  function selectReasoningOption(optionId: string) {
    if (!current) return;
    updateCurrent({ selectedOptionId: optionId });
    postAnswer(current.questionId, { selectedOptionId: optionId });
  }

  function selectLikert(value: number) {
    if (!current) return;
    updateCurrent({ kind: "likert", value });
    postAnswer(current.questionId, { value });
  }

  function selectForcedChoice(statementId: string, which: "most" | "least") {
    if (!current || current.format !== "forced_choice") return;
    const prev = current.response;
    let mostLikeId = prev?.mostLikeId;
    let leastLikeId = prev?.leastLikeId;
    if (which === "most") {
      mostLikeId = statementId;
      if (leastLikeId === statementId) leastLikeId = undefined;
    } else {
      leastLikeId = statementId;
      if (mostLikeId === statementId) mostLikeId = undefined;
    }
    updateCurrent({ kind: "forced_choice", mostLikeId, leastLikeId });
    postAnswer(current.questionId, { mostLikeId, leastLikeId });
  }

  // Safety net: re-send the current answer if the tab is hidden/closed.
  // Saves already fire immediately on click (above), so this mainly covers
  // a save that's still in flight when the page unloads — fetch's
  // `keepalive: true` already lets that request complete, but resending
  // costs nothing and is simplest to reason about.
  useEffect(() => {
    function flush() {
      if (!current?.response) return;
      if (current.format === "sjt" || current.format === "reasoning")
        postAnswer(current.questionId, current.response);
      else if (current.format === "likert") postAnswer(current.questionId, { value: current.response.value });
      else
        postAnswer(current.questionId, {
          mostLikeId: current.response.mostLikeId,
          leastLikeId: current.response.leastLikeId,
        });
    }
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [current, postAnswer]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await lastSave.current;
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

      {current.format === "sjt" && (
        <>
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
        </>
      )}

      {current.format === "likert" && (
        <>
          <p className="text-base leading-relaxed">{current.stem}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">Disagree</span>
            {Array.from(
              { length: current.scaleMax - current.scaleMin + 1 },
              (_, i) => current.scaleMin + i,
            ).map((value) => {
              const selected = current.response?.value === value;
              return (
                <button
                  key={value}
                  onClick={() => selectLikert(value)}
                  aria-label={`${value}`}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm ${
                    selected
                      ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-black/10 dark:border-white/10"
                  }`}
                >
                  {value}
                </button>
              );
            })}
            <span className="text-xs text-zinc-500">Agree</span>
          </div>
        </>
      )}

      {current.format === "forced_choice" && (
        <>
          <p className="text-base leading-relaxed">{current.stem}</p>
          <div className="flex flex-col gap-3">
            {current.statements.map((statement) => {
              const isMost = current.response?.mostLikeId === statement.id;
              const isLeast = current.response?.leastLikeId === statement.id;
              return (
                <div
                  key={statement.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
                >
                  <p className="flex-1 text-sm">{statement.text}</p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => selectForcedChoice(statement.id, "most")}
                      className={`rounded-md px-2 py-1 text-xs ${
                        isMost
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "border border-black/10 dark:border-white/10"
                      }`}
                    >
                      Most like me
                    </button>
                    <button
                      onClick={() => selectForcedChoice(statement.id, "least")}
                      className={`rounded-md px-2 py-1 text-xs ${
                        isLeast
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "border border-black/10 dark:border-white/10"
                      }`}
                    >
                      Least like me
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {current.format === "reasoning" && (
        <>
          {current.passage && (
            <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              {current.passage.title && (
                <p className="mb-1 text-sm font-medium">{current.passage.title}</p>
              )}
              {current.passage.dataTable ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {current.passage.dataTable.columns.map((c) => (
                        <th key={c} className="text-left font-medium text-zinc-500">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {current.passage.dataTable.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {current.passage.body}
                </p>
              )}
            </div>
          )}
          <p className="text-base leading-relaxed">{current.stem}</p>
          <div className="flex flex-col gap-2">
            {current.options.map((option) => {
              const selected = current.response?.selectedOptionId === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => selectReasoningOption(option.id)}
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
        </>
      )}

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
