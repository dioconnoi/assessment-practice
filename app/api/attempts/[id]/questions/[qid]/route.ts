import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  attempts,
  attemptQuestions,
  type SjtResponse,
  type PersonalityResponse,
  type ReasoningResponse,
} from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeIfExpired } from "@/lib/attempts/finalize";

const sjtBodySchema = z.object({
  selectedOptionId: z.string(),
  timeSpentMs: z.number().int().min(0).optional(),
});

const personalityBodySchema = z
  .object({
    value: z.number().int().optional(),
    mostLikeId: z.string().optional(),
    leastLikeId: z.string().optional(),
    timeSpentMs: z.number().int().min(0).optional(),
  })
  .refine((b) => b.value !== undefined || b.mostLikeId !== undefined || b.leastLikeId !== undefined, {
    message: "At least one of value, mostLikeId, or leastLikeId is required",
  });

const reasoningBodySchema = z.object({
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

  const body = await request.json().catch(() => null);
  let response: SjtResponse | PersonalityResponse | ReasoningResponse;
  let timeSpentMs: number | undefined;

  if (attempt.testType === "personality") {
    const parsed = personalityBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    timeSpentMs = parsed.data.timeSpentMs;
    response =
      parsed.data.value !== undefined
        ? { kind: "likert", value: parsed.data.value }
        : {
            kind: "forced_choice",
            mostLikeId: parsed.data.mostLikeId,
            leastLikeId: parsed.data.leastLikeId,
          };
  } else if (attempt.testType === "numerical_reasoning" || attempt.testType === "verbal_reasoning") {
    const parsed = reasoningBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    timeSpentMs = parsed.data.timeSpentMs;
    response = { selectedOptionId: parsed.data.selectedOptionId };
  } else {
    const parsed = sjtBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    timeSpentMs = parsed.data.timeSpentMs;
    response = { selectedOptionId: parsed.data.selectedOptionId };
  }

  const result = await db
    .update(attemptQuestions)
    .set({
      response,
      firstViewedAt: sql`coalesce(${attemptQuestions.firstViewedAt}, now())`,
      ...(timeSpentMs !== undefined ? { timeSpentMs } : {}),
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
