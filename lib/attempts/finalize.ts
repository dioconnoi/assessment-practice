import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attempts,
  attemptQuestions,
  questions,
  sjtQuestions,
  type SjtOption,
  type SjtResponse,
} from "@/lib/db/schema";
import { scoreSjtQuestion } from "@/lib/scoring/sjtScorer";
import { isExpired } from "@/lib/session/timer";

/**
 * Scores every question in an attempt and marks it submitted/expired.
 * Idempotent: a no-op if the attempt isn't `in_progress` any more.
 * `expired` is passed by the caller because only it knows why finalization
 * was triggered (explicit submit vs. a lazy expiry check on read).
 */
export async function finalizeAttempt(
  attemptId: number,
  outcome: "submitted" | "expired",
): Promise<void> {
  const rows = await db
    .select({
      attemptQuestionId: attemptQuestions.id,
      response: attemptQuestions.response,
      options: sjtQuestions.options,
      bestOptionId: sjtQuestions.bestOptionId,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
    .innerJoin(sjtQuestions, eq(sjtQuestions.questionId, questions.id))
    .where(eq(attemptQuestions.attemptId, attemptId));

  let totalScore = 0;
  let maxScore = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const result = scoreSjtQuestion(
        row.options as SjtOption[],
        row.bestOptionId,
        row.response as SjtResponse | null,
      );
      totalScore += result.pointsAwarded;
      maxScore += result.maxPoints;
      await tx
        .update(attemptQuestions)
        .set({ isCorrect: result.isCorrect, pointsAwarded: String(result.pointsAwarded) })
        .where(eq(attemptQuestions.id, row.attemptQuestionId));
    }

    await tx
      .update(attempts)
      .set({
        status: outcome,
        submittedAt: new Date(),
        totalScore: String(totalScore),
        maxScore: String(maxScore),
      })
      .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")));
  });
}

/** Finalizes an in-progress attempt as expired if its deadline has passed.
 * Call this on every read so an abandoned session resolves itself lazily. */
export async function finalizeIfExpired(attempt: {
  id: number;
  status: string;
  serverEndAt: Date;
}): Promise<void> {
  if (attempt.status === "in_progress" && isExpired(attempt.serverEndAt)) {
    await finalizeAttempt(attempt.id, "expired");
  }
}
