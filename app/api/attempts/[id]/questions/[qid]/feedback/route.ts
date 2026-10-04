import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, attemptQuestions } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { getOrGenerateSjtFeedback } from "@/lib/llm/usecases/sjtFeedback";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; qid: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, qid } = await params;
  const attemptId = Number(id);
  const questionId = Number(qid);

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  if (!attempt || attempt.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attempt.status === "in_progress") {
    return NextResponse.json({ error: "Attempt is still in progress" }, { status: 409 });
  }

  const [aq] = await db
    .select({ id: attemptQuestions.id, response: attemptQuestions.response })
    .from(attemptQuestions)
    .where(
      and(eq(attemptQuestions.attemptId, attemptId), eq(attemptQuestions.questionId, questionId)),
    )
    .limit(1);
  if (!aq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!aq.response) {
    return NextResponse.json({ error: "Question was not answered" }, { status: 409 });
  }

  try {
    const text = await getOrGenerateSjtFeedback(aq.id);
    return NextResponse.json({ feedback: text });
  } catch (err) {
    console.error("SJT feedback generation failed", err);
    return NextResponse.json({ error: "Feedback generation failed" }, { status: 502 });
  }
}
