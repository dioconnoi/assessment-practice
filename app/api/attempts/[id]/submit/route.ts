import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { finalizeAttempt, finalizeIfExpired } from "@/lib/attempts/finalize";

export async function POST(
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
  if (attempt.status === "in_progress") {
    await finalizeAttempt(attemptId, "submitted");
  }

  const [result] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  return NextResponse.json({
    status: result.status,
    totalScore: result.totalScore,
    maxScore: result.maxScore,
  });
}
