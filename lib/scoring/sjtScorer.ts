import type { SjtOption, SjtResponse } from "@/lib/db/schema";

export interface SjtScoreResult {
  isCorrect: boolean;
  pointsAwarded: number;
  maxPoints: number;
}

/** Rank-based partial credit: each option's `points` value already encodes
 * how effective it is (highest points = most effective / best answer). */
export function scoreSjtQuestion(
  options: SjtOption[],
  bestOptionId: string,
  response: SjtResponse | null,
): SjtScoreResult {
  const maxPoints = Math.max(...options.map((o) => o.points));
  if (!response) {
    return { isCorrect: false, pointsAwarded: 0, maxPoints };
  }
  const selected = options.find((o) => o.id === response.selectedOptionId);
  return {
    isCorrect: response.selectedOptionId === bestOptionId,
    pointsAwarded: selected?.points ?? 0,
    maxPoints,
  };
}
