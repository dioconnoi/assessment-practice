import { and, desc, eq, isNotNull } from "drizzle-orm";
import { attempts } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth/session";

export default async function ProgressPage() {
  const userId = await getUserId();

  const rows = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.userId, userId!), isNotNull(attempts.submittedAt)))
    .orderBy(desc(attempts.startedAt));

  const average =
    rows.length === 0
      ? null
      : rows.reduce((sum, r) => sum + Number(r.totalScore) / Number(r.maxScore), 0) /
        rows.length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Progress</h1>
      {rows.length === 0 ? (
        <p className="text-zinc-500">No completed attempts yet.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            Average: {Math.round((average ?? 0) * 100)}% across {rows.length} attempt
            {rows.length === 1 ? "" : "s"}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/10">
                <th className="py-2">Date</th>
                <th className="py-2">Type</th>
                <th className="py-2">Score</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="py-2">{r.testType}</td>
                  <td className="py-2">
                    {r.totalScore} / {r.maxScore}
                  </td>
                  <td className="py-2 capitalize">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
