import type {
  TraitWeight,
  ForcedChoiceStatement,
  PersonalityResponse,
} from "@/lib/db/schema";

export type PersonalityItemData =
  | { format: "likert"; scaleMin: number; scaleMax: number; traits: TraitWeight[] }
  | { format: "forced_choice"; statements: ForcedChoiceStatement[] };

export interface TraitContribution {
  trait: string;
  /** Already normalized to 0-100 (100 = strongest endorsement, 0 =
   * strongest counter-endorsement, reverse-scoring already applied) so the
   * caller can average contributions from either format without separate
   * range bookkeeping. */
  score: number;
}

/** Pure, no DB/IO — mirrors scoreSjtQuestion's (answer key, response) ->
 * result shape. Unlike SJT there is no single isCorrect/points result: one
 * item can feed several traits, so the caller sums/averages
 * TraitContribution[] across every item in the attempt before normalizing
 * per trait. */
export function scorePersonalityItem(
  item: PersonalityItemData,
  response: PersonalityResponse | null,
): TraitContribution[] {
  if (!response) return [];

  if (item.format === "likert" && response.kind === "likert") {
    const fraction =
      (response.value - item.scaleMin) / (item.scaleMax - item.scaleMin);
    return item.traits.map((t) => ({
      trait: t.trait,
      score: (t.weight >= 0 ? fraction : 1 - fraction) * 100,
    }));
  }

  if (item.format === "forced_choice" && response.kind === "forced_choice") {
    const contributions: TraitContribution[] = [];
    for (const statement of item.statements) {
      const picked =
        statement.id === response.mostLikeId
          ? "most"
          : statement.id === response.leastLikeId
            ? "least"
            : null;
      if (!picked) continue; // not selected either way — no data point
      for (const t of statement.traits) {
        const endorsed = picked === "most";
        const positive = t.weight >= 0;
        contributions.push({ trait: t.trait, score: endorsed === positive ? 100 : 0 });
      }
    }
    return contributions;
  }

  return []; // format/response mismatch — treat as unanswered
}
