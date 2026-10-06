import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmFeedback, traitScores } from "@/lib/db/schema";
import { getLLMProvider } from "@/lib/llm/provider";

const FEEDBACK_TYPE = "personality_narrative" as const;

export async function getOrGeneratePersonalityNarrative(attemptId: number): Promise<string> {
  const [cached] = await db
    .select()
    .from(llmFeedback)
    .where(
      and(eq(llmFeedback.attemptId, attemptId), eq(llmFeedback.feedbackType, FEEDBACK_TYPE)),
    )
    .limit(1);
  if (cached) return cached.rawResponse;

  const traits = await db
    .select({ trait: traitScores.trait, normalizedScore: traitScores.normalizedScore })
    .from(traitScores)
    .where(eq(traitScores.attemptId, attemptId));
  if (traits.length === 0) {
    throw new Error(`No trait scores found for attempt ${attemptId}`);
  }

  const provider = getLLMProvider();
  const result = await provider.complete({
    system:
      "You write brief, constructive work-style narrative summaries from a " +
      "candidate's trait profile from a personality/work-style questionnaire. " +
      "Given trait names and normalized 0-100 scores, write 2-3 short " +
      "paragraphs in second person covering likely work style, strengths, and " +
      "potential blind spots. Be specific to the actual scores, avoid " +
      "clinical or diagnostic language, and don't imply this is a validated " +
      "psychometric instrument.",
    messages: [
      {
        role: "user",
        content: traits.map((t) => `${t.trait}: ${t.normalizedScore}/100`).join("\n"),
      },
    ],
    maxTokens: 600,
  });

  await db.insert(llmFeedback).values({
    attemptId,
    feedbackType: FEEDBACK_TYPE,
    provider: result.provider,
    model: result.model,
    rawResponse: result.text,
  });

  return result.text;
}
