import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { testTemplates } from "@/lib/db/schema";
import StartAttemptButton from "@/components/StartAttemptButton";

export default async function PracticeTemplatePage({
  params,
}: {
  params: Promise<{ templateSlug: string }>;
}) {
  const { templateSlug } = await params;
  const [template] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, templateSlug))
    .limit(1);
  if (!template) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{template.name}</h1>
      {template.description && <p className="text-zinc-500">{template.description}</p>}
      <ul className="text-sm text-zinc-500">
        <li>{template.config.questionCount} questions</li>
        <li>{Math.round(template.config.durationSeconds / 60)} minutes, once started</li>
      </ul>
      <p className="text-sm text-zinc-500">
        The timer starts the moment you click Start and keeps running even if you
        close the tab — there&apos;s no pausing, just like the real thing.
      </p>
      <StartAttemptButton templateSlug={template.slug} />
    </main>
  );
}
