import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attempts,
  attemptQuestions,
  questions,
  sjtQuestions,
  personalityItems,
  personalityBlocks,
  reasoningQuestions,
  reasoningPassages,
  type SjtOption,
} from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeIfExpired } from "@/lib/attempts/finalize";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const attemptId = Number((await params).id);
  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await finalizeIfExpired(attempt);
  // re-read in case it was just finalized
  const [current] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  const finished = current.status !== "in_progress";

  const questionList =
    current.testType === "personality"
      ? await getPersonalityQuestions(attemptId)
      : current.testType === "numerical_reasoning" || current.testType === "verbal_reasoning"
        ? await getReasoningQuestions(attemptId, finished)
        : await getSjtQuestions(attemptId, finished);

  return NextResponse.json({
    id: current.id,
    status: current.status,
    testType: current.testType,
    startedAt: current.startedAt,
    serverEndAt: current.serverEndAt,
    submittedAt: current.submittedAt,
    totalScore: current.totalScore,
    maxScore: current.maxScore,
    questions: questionList,
  });
}

async function getSjtQuestions(attemptId: number, finished: boolean) {
  const rows = await db
    .select({
      attemptQuestionId: attemptQuestions.id,
      ordinal: attemptQuestions.ordinal,
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

  return rows.map((row) => ({
    format: "sjt" as const,
    attemptQuestionId: row.attemptQuestionId,
    ordinal: row.ordinal,
    questionId: row.questionId,
    scenarioText: row.scenarioText,
    // hide the answer key (rank/points/bestOptionId) until the attempt is over
    options: (row.options as SjtOption[]).map((o) => ({
      id: o.id,
      text: o.text,
      ...(finished ? { rank: o.rank, points: o.points } : {}),
    })),
    bestOptionId: finished ? row.bestOptionId : undefined,
    response: row.response,
    isCorrect: finished ? row.isCorrect : undefined,
    pointsAwarded: finished ? row.pointsAwarded : undefined,
  }));
}

// No finished-conditional reveal needed here, unlike SJT: trait weights are
// never sent to the client at all (the results page reads trait_scores,
// not re-exposed weights), so there's no answer key to withhold or reveal.
async function getPersonalityQuestions(attemptId: number) {
  const rows = await db
    .select({
      attemptQuestionId: attemptQuestions.id,
      ordinal: attemptQuestions.ordinal,
      questionId: attemptQuestions.questionId,
      response: attemptQuestions.response,
      stem: questions.stem,
      scaleMin: personalityItems.scaleMin,
      scaleMax: personalityItems.scaleMax,
      statements: personalityBlocks.statements,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
    .leftJoin(personalityItems, eq(personalityItems.questionId, attemptQuestions.questionId))
    .leftJoin(personalityBlocks, eq(personalityBlocks.questionId, attemptQuestions.questionId))
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.ordinal));

  return rows.map((row) =>
    row.statements
      ? {
          format: "forced_choice" as const,
          attemptQuestionId: row.attemptQuestionId,
          ordinal: row.ordinal,
          questionId: row.questionId,
          stem: row.stem,
          statements: row.statements.map((s) => ({ id: s.id, text: s.text })),
          response: row.response,
        }
      : {
          format: "likert" as const,
          attemptQuestionId: row.attemptQuestionId,
          ordinal: row.ordinal,
          questionId: row.questionId,
          stem: row.stem,
          scaleMin: row.scaleMin!,
          scaleMax: row.scaleMax!,
          response: row.response,
        },
  );
}

// Options never carry answer-key data (correctOptionId/explanation live in
// separate columns), so there's nothing to strip from them — only those
// two fields plus isCorrect need finished-gating, unlike SJT's options.
async function getReasoningQuestions(attemptId: number, finished: boolean) {
  const rows = await db
    .select({
      attemptQuestionId: attemptQuestions.id,
      ordinal: attemptQuestions.ordinal,
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

  return rows.map((row) => ({
    format: "reasoning" as const,
    attemptQuestionId: row.attemptQuestionId,
    ordinal: row.ordinal,
    questionId: row.questionId,
    stem: row.stem,
    // check the FK, not passageBody's truthiness — a numerical passage can
    // have an empty body string (all its content lives in dataTable)
    passage: row.passageId !== null
      ? { title: row.passageTitle, body: row.passageBody, dataTable: row.passageDataTable }
      : null,
    options: row.options,
    response: row.response,
    correctOptionId: finished ? row.correctOptionId : undefined,
    isCorrect: finished ? row.isCorrect : undefined,
    explanation: finished ? row.explanation : undefined,
  }));
}
