import type { ReasoningResponse } from "@/lib/db/schema";

export interface ReasoningScoreResult {
  isCorrect: boolean;
  pointsAwarded: number;
  maxPoints: number;
}

/** Pure, no DB/IO — mirrors scoreSjtQuestion's (answer key, response) ->
 * result shape, but simpler: a single correct answer, no ranking or
 * partial credit. */
export function scoreReasoningQuestion(
  correctOptionId: string,
  response: ReasoningResponse | null,
): ReasoningScoreResult {
  if (!response) return { isCorrect: false, pointsAwarded: 0, maxPoints: 1 };
  const isCorrect = response.selectedOptionId === correctOptionId;
  return { isCorrect, pointsAwarded: isCorrect ? 1 : 0, maxPoints: 1 };
}
