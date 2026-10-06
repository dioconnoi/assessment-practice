// Runs via tsx (not through Next's bundler), so it deliberately avoids
// importing lib/db or anything else marked "server-only" — see the note in
// lib/auth/password.ts.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

const { users, testTemplates, questions, sjtQuestions, personalityItems, personalityBlocks } =
  schema;
type Db = ReturnType<typeof drizzle<typeof schema>>;

async function seedUser(db: Db) {
  const email = (process.env.BOOTSTRAP_EMAIL ?? "me@example.com").toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD ?? "change-me-now";

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existingUser) {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({ email, passwordHash });
    console.log(`Created user ${email} (password from BOOTSTRAP_PASSWORD env var)`);
  } else {
    console.log(`User ${email} already exists, skipping`);
  }
}

const sjtSeedData: {
  scenario: string;
  tags: string[];
  options: { id: string; text: string; rank: number; points: number }[];
}[] = [
  {
    scenario:
      "You're midway through a task your manager asked for by end of day when a senior " +
      "colleague from another team asks you to drop everything to help with an issue they " +
      "describe as urgent. You don't think it's actually your responsibility.",
    tags: ["prioritisation", "conflicting_demands"],
    options: [
      { id: "a", text: "Drop your task immediately and help the colleague, since they outrank you.", rank: 3, points: 1 },
      {
        id: "b",
        text: "Briefly explain your current deadline, ask the colleague what exactly they need, and agree a time you can help once your task is done or find out if it's genuinely urgent.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Tell the colleague it's not your job and continue your own task.", rank: 4, points: 0 },
      {
        id: "d",
        text: "Quietly message your manager asking what to do, without responding to the colleague yet.",
        rank: 2,
        points: 2,
      },
    ],
  },
  {
    scenario:
      "A teammate keeps submitting work with small errors that you have to fix before you can " +
      "use it, which is slowing you down. You've mentioned it once before, casually, with no change.",
    tags: ["feedback", "teamwork"],
    options: [
      {
        id: "a",
        text: "Keep quietly fixing the errors yourself to avoid an awkward conversation.",
        rank: 4,
        points: 0,
      },
      {
        id: "b",
        text: "Raise it directly and specifically with your teammate, give concrete examples, and ask what support would help them avoid the errors.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Escalate straight to your manager without speaking to the teammate again.", rank: 3, points: 1 },
      {
        id: "d",
        text: "Mention it again casually in a group chat, hoping they pick up on it.",
        rank: 2,
        points: 2,
      },
    ],
  },
  {
    scenario:
      "You notice a mistake in a report a colleague already sent to a client. The mistake is minor " +
      "and probably won't be noticed, but it is factually incorrect.",
    tags: ["integrity", "client_communication"],
    options: [
      { id: "a", text: "Say nothing, since the mistake is minor and unlikely to be noticed.", rank: 4, points: 0 },
      {
        id: "b",
        text: "Tell your colleague privately what you found so they can decide whether and how to correct it with the client.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Email the client yourself to correct the mistake without telling your colleague.", rank: 3, points: 1 },
      {
        id: "d",
        text: "Mention it to your manager instead of your colleague.",
        rank: 2,
        points: 2,
      },
    ],
  },
  {
    scenario:
      "You're assigned to a project with a tight deadline and realise partway through that the " +
      "scope is larger than anyone accounted for. At the current pace, it won't be done on time.",
    tags: ["planning", "escalation"],
    options: [
      {
        id: "a",
        text: "Work longer hours quietly to try to catch up without telling anyone.",
        rank: 3,
        points: 1,
      },
      {
        id: "b",
        text: "Flag the scope and timeline concern to your manager as soon as you notice it, with a clear view of what's achievable and options to close the gap.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Wait until the deadline to explain why the work isn't finished.", rank: 4, points: 0 },
      {
        id: "d",
        text: "Cut corners on quality to hit the deadline without raising the concern.",
        rank: 2,
        points: 2,
      },
    ],
  },
  {
    scenario:
      "During a team meeting, a colleague presents an idea that you're fairly sure has a significant " +
      "flaw, but you haven't had time to fully verify it.",
    tags: ["communication", "collaboration"],
    options: [
      {
        id: "a",
        text: "Say nothing in the meeting to avoid putting them on the spot in front of others.",
        rank: 3,
        points: 1,
      },
      {
        id: "b",
        text: "Ask a clarifying question in the meeting that surfaces the potential flaw constructively, then follow up afterwards if needed.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Bluntly tell them in the meeting that their idea doesn't work.", rank: 4, points: 0 },
      {
        id: "d",
        text: "Raise your concern privately with the manager after the meeting instead of with your colleague.",
        rank: 2,
        points: 2,
      },
    ],
  },
  {
    scenario:
      "You're given a task using a tool or process you've never used before, with no training and a " +
      "deadline in two days. Asking for help might make you look unprepared.",
    tags: ["initiative", "learning"],
    options: [
      {
        id: "a",
        text: "Try to figure it out entirely on your own and say nothing if you're stuck, to avoid looking unprepared.",
        rank: 4,
        points: 0,
      },
      {
        id: "b",
        text: "Spend a short amount of time trying it yourself, then ask a specific, well-framed question to someone who can unblock you quickly.",
        rank: 1,
        points: 3,
      },
      { id: "c", text: "Immediately ask someone to just do it for you.", rank: 3, points: 1 },
      {
        id: "d",
        text: "Tell your manager you can't do the task and ask for it to be reassigned.",
        rank: 2,
        points: 2,
      },
    ],
  },
];

async function seedSjt(db: Db) {
  const [existing] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, "sjt-default"))
    .limit(1);
  if (existing) {
    console.log("Default SJT template already seeded, skipping");
    return;
  }

  await db.insert(testTemplates).values({
    slug: "sjt-default",
    name: "Situational Judgement Test",
    testType: "sjt",
    description: "6 workplace scenarios, pick the most effective response.",
    config: { durationSeconds: 10 * 60, questionCount: 6, selectionMode: "random" },
    isDefault: true,
  });

  for (const item of sjtSeedData) {
    await db.transaction(async (tx) => {
      const [question] = await tx
        .insert(questions)
        .values({ testType: "sjt", stem: item.scenario.slice(0, 80), tags: item.tags })
        .returning({ id: questions.id });

      const best = item.options.find((o) => o.rank === 1)!;
      await tx.insert(sjtQuestions).values({
        questionId: question.id,
        scenarioText: item.scenario,
        options: item.options,
        bestOptionId: best.id,
      });
    });
  }

  console.log(`Seeded ${sjtSeedData.length} SJT questions and the default template`);
}

// Six generic, non-proprietary work-style trait dimensions.
const likertSeedData: {
  stem: string;
  tags: string[];
  traits: { trait: string; weight: number }[];
}[] = [
  { stem: "I double-check my work before considering it finished.", tags: ["conscientiousness"], traits: [{ trait: "conscientiousness", weight: 1 }] },
  { stem: "I keep track of deadlines without needing reminders.", tags: ["conscientiousness"], traits: [{ trait: "conscientiousness", weight: 1 }] },
  { stem: "I often start tasks without fully reading the instructions.", tags: ["conscientiousness"], traits: [{ trait: "conscientiousness", weight: -1 }] },
  { stem: "I actively ask teammates for their input before finalizing a decision.", tags: ["collaboration"], traits: [{ trait: "collaboration", weight: 1 }] },
  { stem: "I'd rather solve a problem alone than loop other people in.", tags: ["collaboration"], traits: [{ trait: "collaboration", weight: -1 }] },
  { stem: "Unexpected setbacks don't throw off my focus for long.", tags: ["resilience"], traits: [{ trait: "resilience", weight: 1 }] },
  { stem: "A single piece of harsh feedback can affect my mood for the rest of the day.", tags: ["resilience"], traits: [{ trait: "resilience", weight: -1 }] },
  { stem: "I adjust my plans easily when priorities change at short notice.", tags: ["adaptability"], traits: [{ trait: "adaptability", weight: 1 }] },
  { stem: "I find it frustrating when a process changes after I've learned it.", tags: ["adaptability"], traits: [{ trait: "adaptability", weight: -1 }] },
  { stem: "I set goals for myself beyond what's strictly required.", tags: ["drive"], traits: [{ trait: "drive", weight: 1 }] },
  { stem: "I look for ways to take on more responsibility over time.", tags: ["drive"], traits: [{ trait: "drive", weight: 1 }] },
  { stem: "I'm content doing just enough to meet expectations.", tags: ["drive"], traits: [{ trait: "drive", weight: -1 }] },
  { stem: "I say what I think plainly, even if it might not be what people want to hear.", tags: ["communication_style"], traits: [{ trait: "communication_style", weight: 1 }] },
  { stem: "I usually soften my opinions to avoid friction in a conversation.", tags: ["communication_style"], traits: [{ trait: "communication_style", weight: -1 }] },
];

const forcedChoiceSeedData: {
  stem: string;
  tags: string[];
  statements: { id: string; text: string; traits: { trait: string; weight: number }[] }[];
}[] = [
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["prioritisation"],
    statements: [
      { id: "a", text: "I finish the task that's already in progress before switching to something new.", traits: [{ trait: "conscientiousness", weight: 1 }] },
      { id: "b", text: "I switch immediately to whatever feels most urgent right now.", traits: [{ trait: "adaptability", weight: 1 }] },
      { id: "c", text: "I check with my manager before changing my plan.", traits: [{ trait: "collaboration", weight: 1 }] },
    ],
  },
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["pressure"],
    statements: [
      { id: "a", text: "I stay calm and keep working through a stressful day.", traits: [{ trait: "resilience", weight: 1 }] },
      { id: "b", text: "I need some time away from the problem before I can refocus.", traits: [{ trait: "resilience", weight: -1 }] },
      { id: "c", text: "I talk it through with someone else to regain focus.", traits: [{ trait: "collaboration", weight: 1 }] },
    ],
  },
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["ambition"],
    statements: [
      { id: "a", text: "I'm already thinking about what's next after this project.", traits: [{ trait: "drive", weight: 1 }] },
      { id: "b", text: "I'm satisfied once the current task is done well.", traits: [{ trait: "drive", weight: -1 }] },
      { id: "c", text: "I double check the details before calling it finished.", traits: [{ trait: "conscientiousness", weight: 1 }] },
    ],
  },
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["change"],
    statements: [
      { id: "a", text: "I get energized by a sudden change of plan.", traits: [{ trait: "adaptability", weight: 1 }] },
      { id: "b", text: "I prefer to stick with the original plan once it's set.", traits: [{ trait: "adaptability", weight: -1 }] },
      { id: "c", text: "I let the team know plainly if I disagree with the change.", traits: [{ trait: "communication_style", weight: 1 }] },
    ],
  },
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["communication"],
    statements: [
      { id: "a", text: "I tell people directly when something isn't working.", traits: [{ trait: "communication_style", weight: 1 }] },
      { id: "b", text: "I wait for the right moment to raise a concern diplomatically.", traits: [{ trait: "communication_style", weight: -1 }] },
      { id: "c", text: "I ask others what they think before raising my own view.", traits: [{ trait: "collaboration", weight: 1 }] },
    ],
  },
  {
    stem: "Which of these is most / least like how you work?",
    tags: ["teamwork"],
    statements: [
      { id: "a", text: "I prefer figuring things out with a group.", traits: [{ trait: "collaboration", weight: 1 }] },
      { id: "b", text: "I prefer figuring things out on my own first.", traits: [{ trait: "collaboration", weight: -1 }] },
      { id: "c", text: "I set a personal target that's higher than what's asked.", traits: [{ trait: "drive", weight: 1 }] },
    ],
  },
];

async function seedPersonality(db: Db) {
  const [existing] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, "personality-default"))
    .limit(1);
  if (existing) {
    console.log("Default personality template already seeded, skipping");
    return;
  }

  await db.insert(testTemplates).values({
    slug: "personality-default",
    name: "Work-Style Questionnaire",
    testType: "personality",
    description: "Likert and forced-choice items covering 6 generic work-style traits.",
    config: { durationSeconds: 8 * 60, questionCount: 20, selectionMode: "random" },
    isDefault: true,
  });

  for (const item of likertSeedData) {
    await db.transaction(async (tx) => {
      const [question] = await tx
        .insert(questions)
        .values({ testType: "personality", stem: item.stem, tags: item.tags })
        .returning({ id: questions.id });
      await tx.insert(personalityItems).values({
        questionId: question.id,
        traits: item.traits,
      });
    });
  }

  for (const block of forcedChoiceSeedData) {
    await db.transaction(async (tx) => {
      const [question] = await tx
        .insert(questions)
        .values({ testType: "personality", stem: block.stem, tags: block.tags })
        .returning({ id: questions.id });
      await tx.insert(personalityBlocks).values({
        questionId: question.id,
        statements: block.statements,
      });
    });
  }

  console.log(
    `Seeded ${likertSeedData.length} Likert items + ${forcedChoiceSeedData.length} forced-choice blocks and the default personality template`,
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  await seedUser(db);
  await seedSjt(db);
  await seedPersonality(db);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
