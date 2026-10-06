// Runs via tsx (not through Next's bundler), so it deliberately avoids
// importing lib/db or anything else marked "server-only" — see the note in
// lib/auth/password.ts.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

const {
  users,
  testTemplates,
  questions,
  sjtQuestions,
  personalityItems,
  personalityBlocks,
  reasoningPassages,
  reasoningQuestions,
} = schema;
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

interface ReasoningOptionSeed {
  id: string;
  text: string;
}
interface ReasoningQuestionSeed {
  stem: string;
  options: ReasoningOptionSeed[];
  correctOptionId: string;
  explanation: string;
}
interface NumericalPassageSeed {
  title: string;
  dataTable: { caption?: string; columns: string[]; rows: (string | number)[][] };
  questions: ReasoningQuestionSeed[];
}
interface VerbalPassageSeed {
  title: string;
  body: string;
  questions: ReasoningQuestionSeed[];
}

const TRUE_FALSE_CANNOT_SAY: ReasoningOptionSeed[] = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
  { id: "cannot_say", text: "Cannot say" },
];

const numericalPassages: NumericalPassageSeed[] = [
  {
    title: "Quarterly Team Headcount",
    dataTable: {
      caption: "Headcount by team, Q1–Q4",
      columns: ["Team", "Q1", "Q2", "Q3", "Q4"],
      rows: [
        ["Engineering", 42, 45, 48, 51],
        ["Sales", 18, 20, 19, 22],
        ["Support", 12, 12, 14, 15],
      ],
    },
    questions: [
      {
        stem: "By how many people did the Engineering team grow from Q1 to Q4?",
        options: [
          { id: "a", text: "6" },
          { id: "b", text: "9" },
          { id: "c", text: "12" },
          { id: "d", text: "51" },
        ],
        correctOptionId: "b",
        explanation: "Engineering went from 42 in Q1 to 51 in Q4, an increase of 9 people.",
      },
      {
        stem: "Which team had the largest percentage increase in headcount from Q1 to Q4?",
        options: [
          { id: "a", text: "Engineering" },
          { id: "b", text: "Sales" },
          { id: "c", text: "Support" },
          { id: "d", text: "They are all equal" },
        ],
        correctOptionId: "c",
        explanation:
          "Support grew 25% (12 to 15), the highest of the three — Engineering grew about 21% and Sales about 22%.",
      },
      {
        stem: "What was the total headcount across all three teams in Q3?",
        options: [
          { id: "a", text: "79" },
          { id: "b", text: "81" },
          { id: "c", text: "84" },
          { id: "d", text: "88" },
        ],
        correctOptionId: "b",
        explanation: "Q3 figures are 48 (Engineering) + 19 (Sales) + 14 (Support) = 81.",
      },
    ],
  },
  {
    title: "Monthly Website Traffic",
    dataTable: {
      caption: "Visitors and signups by month",
      columns: ["Month", "Visitors", "Signups"],
      rows: [
        ["January", 10000, 250],
        ["February", 12000, 360],
        ["March", 15000, 300],
      ],
    },
    questions: [
      {
        stem: "What was the signup conversion rate in January (signups ÷ visitors)?",
        options: [
          { id: "a", text: "1.5%" },
          { id: "b", text: "2.0%" },
          { id: "c", text: "2.5%" },
          { id: "d", text: "3.0%" },
        ],
        correctOptionId: "c",
        explanation: "250 signups ÷ 10,000 visitors = 2.5%.",
      },
      {
        stem: "Which month had the highest number of signups?",
        options: [
          { id: "a", text: "January" },
          { id: "b", text: "February" },
          { id: "c", text: "March" },
          { id: "d", text: "They're equal" },
        ],
        correctOptionId: "b",
        explanation: "February had 360 signups, more than January (250) or March (300).",
      },
      {
        stem: "By what percentage did visitors increase from January to March?",
        options: [
          { id: "a", text: "25%" },
          { id: "b", text: "40%" },
          { id: "c", text: "50%" },
          { id: "d", text: "60%" },
        ],
        correctOptionId: "c",
        explanation: "(15,000 − 10,000) ÷ 10,000 = 50%.",
      },
    ],
  },
  {
    title: "Product Pricing Comparison",
    dataTable: {
      caption: "Monthly price and included users by plan",
      columns: ["Plan", "Monthly Price ($)", "Users Included"],
      rows: [
        ["Basic", 29, 5],
        ["Pro", 99, 15],
        ["Team", 199, 25],
      ],
    },
    questions: [
      {
        stem: "What is the price per user for the Pro plan?",
        options: [
          { id: "a", text: "$5.80" },
          { id: "b", text: "$6.60" },
          { id: "c", text: "$7.20" },
          { id: "d", text: "$9.90" },
        ],
        correctOptionId: "b",
        explanation: "$99 ÷ 15 users = $6.60 per user.",
      },
      {
        stem: "Which plan offers the lowest price per user?",
        options: [
          { id: "a", text: "Basic" },
          { id: "b", text: "Pro" },
          { id: "c", text: "Team" },
          { id: "d", text: "They're equal" },
        ],
        correctOptionId: "a",
        explanation: "Basic is $5.80/user, versus $6.60 for Pro and $7.96 for Team.",
      },
      {
        stem: "How much more expensive per month is the Team plan than the Basic plan?",
        options: [
          { id: "a", text: "$140" },
          { id: "b", text: "$150" },
          { id: "c", text: "$170" },
          { id: "d", text: "$180" },
        ],
        correctOptionId: "c",
        explanation: "$199 − $29 = $170.",
      },
    ],
  },
];

const verbalPassages: VerbalPassageSeed[] = [
  {
    title: "Expense Policy",
    body:
      "The company's new expense policy requires all claims over $50 to include " +
      "a receipt and a brief justification note. Claims under $50 need only a receipt. " +
      "Managers must approve any claim over $200 before it is submitted to finance. " +
      "The policy does not change how travel bookings are made, which continue to go " +
      "through the existing centralized booking tool.",
    questions: [
      {
        stem: "A $40 claim requires a justification note.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "false",
        explanation:
          "Claims under $50 need only a receipt; the justification note is only required above $50.",
      },
      {
        stem: "A $250 claim must be approved by a manager before submission to finance.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "true",
        explanation:
          "The passage states managers must approve any claim over $200 before submission, and $250 exceeds that threshold.",
      },
      {
        stem: "The new policy will slow down how quickly travel bookings can be made.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "cannot_say",
        explanation:
          "The passage says the policy doesn't change how travel bookings are made, but says nothing about booking speed either way, so this can't be determined from the passage.",
      },
    ],
  },
  {
    title: "Remote Work Policy",
    body:
      "Employees may work remotely up to three days per week, provided their manager " +
      "agrees to the schedule in advance. Teams that collaborate closely across time " +
      "zones are expected to maintain at least four hours of overlapping availability " +
      "each day. Remote work requests are reviewed quarterly, and a manager may ask an " +
      "employee to return to the office more frequently if team performance metrics " +
      "decline. The policy applies to all full-time staff; contractors are covered " +
      "separately under their individual agreements.",
    questions: [
      {
        stem: "An employee can work remotely every day of the week without approval.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "false",
        explanation:
          "Remote work is capped at three days per week and requires the manager's advance agreement.",
      },
      {
        stem: "Contractors are subject to the same remote work policy as full-time staff.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "false",
        explanation: "The passage states contractors are covered separately under their own agreements.",
      },
      {
        stem: "A manager can require more in-office days if a team's performance declines.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "true",
        explanation: "This is stated directly: a manager may ask for more in-office days if metrics decline.",
      },
    ],
  },
  {
    title: "Software Deployment Process",
    body:
      "All code changes must pass automated tests before merging into the main branch. " +
      "Once merged, changes are deployed automatically to a staging environment, where " +
      "they remain for at least 24 hours before being eligible for production release. " +
      "Production releases require sign-off from a senior engineer who was not the " +
      "author of the change. Emergency fixes may skip the staging wait time only with " +
      "written approval from an engineering director.",
    questions: [
      {
        stem: "Code can be deployed to production immediately after merging to main.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "false",
        explanation:
          "Changes must sit in staging for at least 24 hours before being eligible for production, unless an emergency fix has director approval.",
      },
      {
        stem: "The engineer who wrote a change can also approve its production release.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "false",
        explanation:
          "Sign-off must come from a senior engineer who was not the author of the change.",
      },
      {
        stem: "Emergency fixes are deployed faster than regular changes on average.",
        options: TRUE_FALSE_CANNOT_SAY,
        correctOptionId: "cannot_say",
        explanation:
          "The passage says emergency fixes may skip the staging wait with approval, but gives no data on actual average deployment speed, so this can't be concluded from the passage.",
      },
    ],
  },
];

async function seedNumericalReasoning(db: Db) {
  const [existing] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, "numerical-reasoning-default"))
    .limit(1);
  if (existing) {
    console.log("Default numerical reasoning template already seeded, skipping");
    return;
  }

  await db.insert(testTemplates).values({
    slug: "numerical-reasoning-default",
    name: "Numerical Reasoning Test",
    testType: "numerical_reasoning",
    description: "Interpret small data tables and answer questions based on them.",
    config: { durationSeconds: 15 * 60, questionCount: 9, selectionMode: "random" },
    isDefault: true,
  });

  let questionCount = 0;
  for (const passage of numericalPassages) {
    await db.transaction(async (tx) => {
      const [passageRow] = await tx
        .insert(reasoningPassages)
        .values({
          testType: "numerical_reasoning",
          title: passage.title,
          body: "",
          dataTable: passage.dataTable,
        })
        .returning({ id: reasoningPassages.id });

      for (const q of passage.questions) {
        const [question] = await tx
          .insert(questions)
          .values({ testType: "numerical_reasoning", stem: q.stem, tags: [passage.title] })
          .returning({ id: questions.id });
        await tx.insert(reasoningQuestions).values({
          questionId: question.id,
          passageId: passageRow.id,
          options: q.options,
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        });
        questionCount++;
      }
    });
  }

  console.log(
    `Seeded ${numericalPassages.length} numerical reasoning passages (${questionCount} questions) and the default template`,
  );
}

async function seedVerbalReasoning(db: Db) {
  const [existing] = await db
    .select()
    .from(testTemplates)
    .where(eq(testTemplates.slug, "verbal-reasoning-default"))
    .limit(1);
  if (existing) {
    console.log("Default verbal reasoning template already seeded, skipping");
    return;
  }

  await db.insert(testTemplates).values({
    slug: "verbal-reasoning-default",
    name: "Verbal Reasoning Test",
    testType: "verbal_reasoning",
    description: "Read a short passage, then judge statements as True, False, or Cannot Say.",
    config: { durationSeconds: 12 * 60, questionCount: 9, selectionMode: "random" },
    isDefault: true,
  });

  let questionCount = 0;
  for (const passage of verbalPassages) {
    await db.transaction(async (tx) => {
      const [passageRow] = await tx
        .insert(reasoningPassages)
        .values({
          testType: "verbal_reasoning",
          title: passage.title,
          body: passage.body,
        })
        .returning({ id: reasoningPassages.id });

      for (const q of passage.questions) {
        const [question] = await tx
          .insert(questions)
          .values({ testType: "verbal_reasoning", stem: q.stem, tags: [passage.title] })
          .returning({ id: questions.id });
        await tx.insert(reasoningQuestions).values({
          questionId: question.id,
          passageId: passageRow.id,
          options: q.options,
          correctOptionId: q.correctOptionId,
          explanation: q.explanation,
        });
        questionCount++;
      }
    });
  }

  console.log(
    `Seeded ${verbalPassages.length} verbal reasoning passages (${questionCount} questions) and the default template`,
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
  await seedNumericalReasoning(db);
  await seedVerbalReasoning(db);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
