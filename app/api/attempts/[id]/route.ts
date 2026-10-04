import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, attemptQuestions, questions, sjtQuestions, type SjtOption } from "@/lib/db/schema";
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

  return NextResponse.json({
    id: current.id,
    status: current.status,
    testType: current.testType,
    startedAt: current.startedAt,
    serverEndAt: current.serverEndAt,
    submittedAt: current.submittedAt,
    totalScore: current.totalScore,
    maxScore: current.maxScore,
    questions: rows.map((row) => ({
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
    })),
  });
}
