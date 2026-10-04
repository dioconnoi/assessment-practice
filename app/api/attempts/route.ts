import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts, attemptQuestions, questions, testTemplates } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { computeServerEndAt } from "@/lib/session/timer";

const bodySchema = z.object({ templateSlug: z.string() });

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [template] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, parsed.data.templateSlug))
    .limit(1);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const picked = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.testType, template.testType))
    .orderBy(sql`random()`)
    .limit(template.config.questionCount);

  if (picked.length === 0) {
    return NextResponse.json(
      { error: "No questions available for this template" },
      { status: 409 },
    );
  }

  const startedAt = new Date();
  const serverEndAt = computeServerEndAt(template.config.durationSeconds, startedAt);

  const attemptId = await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(attempts)
      .values({
        userId,
        templateId: template.id,
        testType: template.testType,
        startedAt,
        serverEndAt,
      })
      .returning({ id: attempts.id });

    await tx.insert(attemptQuestions).values(
      picked.map((q, index) => ({
        attemptId: attempt.id,
        questionId: q.id,
        ordinal: index,
      })),
    );

    return attempt.id;
  });

  return NextResponse.json({ attemptId });
}
