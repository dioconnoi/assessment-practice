import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attempts } from "@/lib/db/schema";
import { getUserId } from "@/lib/auth/session";
import { getOrGeneratePersonalityNarrative } from "@/lib/llm/usecases/personalityNarrative";

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
  if (attempt.status === "in_progress") {
    return NextResponse.json({ error: "Attempt is still in progress" }, { status: 409 });
  }

  try {
    const text = await getOrGeneratePersonalityNarrative(attemptId);
    return NextResponse.json({ narrative: text });
  } catch (err) {
    console.error("Personality narrative generation failed", err);
    return NextResponse.json({ error: "Narrative generation failed" }, { status: 502 });
  }
}
