import Link from "next/link";
import { db } from "@/lib/db";
import { testTemplates } from "@/lib/db/schema";

export default async function Home() {
  const templates = await db.select().from(testTemplates);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Practice</h1>
      {templates.length === 0 && (
        <p className="text-zinc-500">
          No templates seeded yet — run <code>npm run db:seed</code>.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {templates.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded-lg border border-black/10 p-4 dark:border-white/10"
          >
            <div>
              <p className="font-medium">{t.name}</p>
              {t.description && (
                <p className="text-sm text-zinc-500">{t.description}</p>
              )}
              <p className="text-xs text-zinc-400">
                {t.config.questionCount} questions ·{" "}
                {Math.round(t.config.durationSeconds / 60)} min
              </p>
            </div>
            <Link
              href={`/practice/${t.slug}`}
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Start
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
