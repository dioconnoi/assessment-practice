import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attemptQuestions,
  questions,
  sjtQuestions,
  llmFeedback,
  type SjtOption,
  type SjtResponse,
} from "@/lib/db/schema";
import { getLLMProvider } from "@/lib/llm/provider";

const FEEDBACK_TYPE = "sjt_explanation" as const;

export async function getOrGenerateSjtFeedback(
  attemptQuestionId: number,
): Promise<string> {
  const [cached] = await db
    .select()
    .from(llmFeedback)
    .where(
      and(
        eq(llmFeedback.attemptQuestionId, attemptQuestionId),
        eq(llmFeedback.feedbackType, FEEDBACK_TYPE),
      ),
    )
    .limit(1);
  if (cached) return cached.rawResponse;

  const [row] = await db
    .select({
      response: attemptQuestions.response,
      scenarioText: sjtQuestions.scenarioText,
      options: sjtQuestions.options,
      bestOptionId: sjtQuestions.bestOptionId,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
    .innerJoin(sjtQuestions, eq(sjtQuestions.questionId, questions.id))
    .where(eq(attemptQuestions.id, attemptQuestionId))
    .limit(1);

  if (!row || !row.response) {
    throw new Error(
      `No answered SJT question found for attempt_question ${attemptQuestionId}`,
    );
  }

  const response = row.response as SjtResponse;
  const options = row.options as SjtOption[];
  const selected = options.find((o) => o.id === response.selectedOptionId);
  const best = options.find((o) => o.id === row.bestOptionId);
  if (!selected || !best) {
    throw new Error(`Option data inconsistent for question ${attemptQuestionId}`);
  }

  const provider = getLLMProvider();
  const result = await provider.complete({
    system:
      "You coach candidates preparing for workplace situational judgement " +
      "tests. Given a scenario, the response they picked, and the best " +
      "response, explain in 2-4 short sentences why their choice was or " +
      "wasn't effective relative to the best response. Be specific and " +
      "constructive, not generic. Do not repeat the full scenario text back.",
    messages: [
      {
        role: "user",
        content: [
          `Scenario: ${row.scenarioText}`,
          `Candidate's chosen response: "${selected.text}"`,
          `Best response: "${best.text}"`,
          selected.id === best.id
            ? "The candidate chose the best response — explain what makes it effective."
            : "Explain what makes the best response more effective than the candidate's choice.",
        ].join("\n\n"),
      },
    ],
    maxTokens: 400,
  });

  await db.insert(llmFeedback).values({
    attemptQuestionId,
    feedbackType: FEEDBACK_TYPE,
    provider: result.provider,
    model: result.model,
    rawResponse: result.text,
  });

  return result.text;
}
