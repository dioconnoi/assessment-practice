import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, attemptQuestions } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeIfExpired } from "@/lib/attempts/finalize";

const bodySchema = z.object({
  selectedOptionId: z.string(),
  timeSpentMs: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
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

  await finalizeIfExpired(attempt);
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "Attempt is no longer open" }, { status: 409 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await db
    .update(attemptQuestions)
    .set({
      response: { selectedOptionId: parsed.data.selectedOptionId },
      firstViewedAt: sql`coalesce(${attemptQuestions.firstViewedAt}, now())`,
      ...(parsed.data.timeSpentMs !== undefined
        ? { timeSpentMs: parsed.data.timeSpentMs }
        : {}),
    })
    .where(
      and(
        eq(attemptQuestions.attemptId, attemptId),
        eq(attemptQuestions.questionId, questionId),
      ),
    )
    .returning({ id: attemptQuestions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Question not in this attempt" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
