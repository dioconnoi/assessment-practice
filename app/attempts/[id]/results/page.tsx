import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { attempts, attemptQuestions, questions, sjtQuestions, type SjtOption } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeIfExpired } from "@/lib/attempts/finalize";
import QuestionFeedback from "@/components/QuestionFeedback";

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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h1 className="text-xl font-semibold">
          {current.status === "expired" ? "Time's up" : "Results"}
        </h1>
        <p className="text-2xl font-bold">
          {current.totalScore} / {current.maxScore}
        </p>
      </div>

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
    </main>
  );
}
