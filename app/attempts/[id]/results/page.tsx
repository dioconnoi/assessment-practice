import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  attempts,
  attemptQuestions,
  questions,
  sjtQuestions,
  traitScores,
  reasoningQuestions,
  reasoningPassages,
  type SjtOption,
  type ReasoningOption,
} from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeIfExpired } from "@/lib/attempts/finalize";
import QuestionFeedback from "@/components/QuestionFeedback";
import PersonalityNarrative from "@/components/PersonalityNarrative";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getUserId();
  const attemptId = Number((await params).id);

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== userId) notFound();

  await finalizeIfExpired(attempt);
  const [current] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (current.status === "in_progress") redirect(`/attempts/${attemptId}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h1 className="text-xl font-semibold">
          {current.status === "expired" ? "Time's up" : "Results"}
        </h1>
        {current.testType === "personality" ? (
          <p className="text-sm text-zinc-500">Trait profile below — personality questionnaires aren&apos;t scored right or wrong.</p>
        ) : (
          <p className="text-2xl font-bold">
            {current.totalScore} / {current.maxScore}
          </p>
        )}
      </div>

      {current.testType === "personality" ? (
        <PersonalityResults attemptId={attemptId} />
      ) : current.testType === "numerical_reasoning" || current.testType === "verbal_reasoning" ? (
        <ReasoningResults attemptId={attemptId} />
      ) : (
        <SjtResults attemptId={attemptId} />
      )}
    </main>
  );
}

async function SjtResults({ attemptId }: { attemptId: number }) {
  const rows = await db
    .select({
      questionId: attemptQuestions.questionId,
      response: attemptQuestions.response,
      isCorrect: attemptQuestions.isCorrect,
      pointsAwarded: attemptQuestions.pointsAwarded,
      scenarioText: sjtQuestions.scenarioText,
      options: sjtQuestions.options,
      bestOptionId: sjtQuestions.bestOptionId,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
    .innerJoin(sjtQuestions, eq(sjtQuestions.questionId, questions.id))
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.ordinal));

  return (
    <>
      {rows.map((row) => {
        const options = row.options as SjtOption[];
        const selected = options.find(
          (o) => o.id === (row.response as { selectedOptionId: string } | null)?.selectedOptionId,
        );
        const best = options.find((o) => o.id === row.bestOptionId);
        return (
          <div
            key={row.questionId}
            className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10"
          >
            <p className="text-sm text-zinc-500">{row.scenarioText}</p>
            <p className="text-sm">
              Your answer: <span className="font-medium">{selected?.text ?? "No answer"}</span>{" "}
              {row.isCorrect ? "✓" : `(${row.pointsAwarded} pts)`}
            </p>
            {!row.isCorrect && (
              <p className="text-sm text-zinc-500">
                Best answer: <span className="font-medium">{best?.text}</span>
              </p>
            )}
            <QuestionFeedback attemptId={attemptId} questionId={row.questionId} />
          </div>
        );
      })}
    </>
  );
}

async function ReasoningResults({ attemptId }: { attemptId: number }) {
  const rows = await db
    .select({
      questionId: attemptQuestions.questionId,
      response: attemptQuestions.response,
      isCorrect: attemptQuestions.isCorrect,
      stem: questions.stem,
      options: reasoningQuestions.options,
      correctOptionId: reasoningQuestions.correctOptionId,
      explanation: reasoningQuestions.explanation,
      passageId: reasoningQuestions.passageId,
      passageTitle: reasoningPassages.title,
      passageBody: reasoningPassages.body,
      passageDataTable: reasoningPassages.dataTable,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
    .innerJoin(reasoningQuestions, eq(reasoningQuestions.questionId, questions.id))
    .leftJoin(reasoningPassages, eq(reasoningPassages.id, reasoningQuestions.passageId))
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.ordinal));

  return (
    <>
      {rows.map((row) => {
        const options = row.options as ReasoningOption[];
        const selected = options.find(
          (o) => o.id === (row.response as { selectedOptionId: string } | null)?.selectedOptionId,
        );
        const correct = options.find((o) => o.id === row.correctOptionId);
        return (
          <div
            key={row.questionId}
            className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10"
          >
            {row.passageId !== null && (
              <div className="rounded-md bg-zinc-50 p-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {row.passageTitle && <p className="mb-1 font-medium">{row.passageTitle}</p>}
                {row.passageDataTable ? (
                  <table className="w-full">
                    <thead>
                      <tr>
                        {row.passageDataTable.columns.map((c) => (
                          <th key={c} className="text-left font-medium text-zinc-500">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {row.passageDataTable.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>{row.passageBody}</p>
                )}
              </div>
            )}
            <p className="text-sm font-medium">{row.stem}</p>
            <p className="text-sm">
              Your answer: <span className="font-medium">{selected?.text ?? "No answer"}</span>{" "}
              {row.isCorrect ? "✓" : "✗"}
            </p>
            {!row.isCorrect && (
              <p className="text-sm text-zinc-500">
                Correct answer: <span className="font-medium">{correct?.text}</span>
              </p>
            )}
            <p className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">{row.explanation}</p>
          </div>
        );
      })}
    </>
  );
}

function traitLabel(trait: string): string {
  return trait.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function PersonalityResults({ attemptId }: { attemptId: number }) {
  const traits = await db
    .select()
    .from(traitScores)
    .where(eq(traitScores.attemptId, attemptId))
    .orderBy(asc(traitScores.trait));

  if (traits.length === 0) {
    return <p className="text-zinc-500">Not enough answered items to build a trait profile.</p>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-medium">Trait profile</h2>
      <div className="flex flex-col gap-3">
        {traits.map((t) => {
          const score = Math.round(Number(t.normalizedScore));
          return (
            <div key={t.trait} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{traitLabel(t.trait)}</span>
                <span className="text-zinc-500">{score}</span>
              </div>
              <div
                className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800"
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={traitLabel(t.trait)}
              >
                <div
                  className="h-2 rounded-full bg-black dark:bg-white"
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <PersonalityNarrative attemptId={attemptId} />
    </div>
  );
}
