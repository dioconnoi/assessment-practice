import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attempts,
  attemptQuestions,
  questions,
  sjtQuestions,
  personalityItems,
  personalityBlocks,
  traitScores,
  type SjtOption,
  type SjtResponse,
  type PersonalityResponse,
} from "@/lib/db/schema";
import { scoreSjtQuestion } from "@/lib/scoring/sjtScorer";
import { scorePersonalityItem, type PersonalityItemData } from "@/lib/scoring/personalityScorer";
import { isExpired } from "@/lib/session/timer";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  const [attempt] = await db
    .select({ testType: attempts.testType })
    .from(attempts)
    .where(eq(attempts.id, attemptId))
    .limit(1);
  if (!attempt) return;

  await db.transaction(async (tx) => {
    const { totalScore, maxScore } =
      attempt.testType === "personality"
        ? await finalizePersonalityRows(tx, attemptId)
        : await finalizeSjtRows(tx, attemptId);

    await tx
      .update(attempts)
      .set({
        status: outcome,
        submittedAt: new Date(),
        totalScore: totalScore === null ? null : String(totalScore),
        maxScore: maxScore === null ? null : String(maxScore),
      })
      .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress")));
  });
}

async function finalizeSjtRows(
  tx: Tx,
  attemptId: number,
): Promise<{ totalScore: number | null; maxScore: number | null }> {
  const rows = await tx
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

  return { totalScore, maxScore };
}

/**
 * Personality attempts have no "correct answer" concept, so unlike SJT
 * there is no single totalScore/maxScore worth storing — the real output
 * is the trait profile written to trait_scores below. Returning nulls here
 * keeps attempts.totalScore/maxScore honest about that (see
 * app/progress/page.tsx for the corresponding null-handling).
 */
async function finalizePersonalityRows(
  tx: Tx,
  attemptId: number,
): Promise<{ totalScore: null; maxScore: null }> {
  const rows = await tx
    .select({
      response: attemptQuestions.response,
      likertScaleMin: personalityItems.scaleMin,
      likertScaleMax: personalityItems.scaleMax,
      likertTraits: personalityItems.traits,
      blockStatements: personalityBlocks.statements,
    })
    .from(attemptQuestions)
    .leftJoin(personalityItems, eq(personalityItems.questionId, attemptQuestions.questionId))
    .leftJoin(personalityBlocks, eq(personalityBlocks.questionId, attemptQuestions.questionId))
    .where(eq(attemptQuestions.attemptId, attemptId));

  const byTrait = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    const item: PersonalityItemData | null = row.likertTraits
      ? {
          format: "likert",
          scaleMin: row.likertScaleMin!,
          scaleMax: row.likertScaleMax!,
          traits: row.likertTraits,
        }
      : row.blockStatements
        ? { format: "forced_choice", statements: row.blockStatements }
        : null;
    if (!item) continue;

    for (const c of scorePersonalityItem(item, row.response as PersonalityResponse | null)) {
      const bucket = byTrait.get(c.trait) ?? { sum: 0, count: 0 };
      bucket.sum += c.score;
      bucket.count += 1;
      byTrait.set(c.trait, bucket);
    }
  }

  for (const [trait, { sum, count }] of byTrait) {
    if (count === 0) continue;
    await tx
      .insert(traitScores)
      .values({
        attemptId,
        trait,
        rawScore: String(sum),
        normalizedScore: String(sum / count),
      })
      .onConflictDoUpdate({
        target: [traitScores.attemptId, traitScores.trait],
        set: { rawScore: String(sum), normalizedScore: String(sum / count) },
      });
  }

  return { totalScore: null, maxScore: null };
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
