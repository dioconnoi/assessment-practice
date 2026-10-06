import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  jsonb,
  numeric,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- enums ---

export const testTypeEnum = pgEnum("test_type", [
  "sjt",
  "personality",
  "numerical_reasoning",
  "verbal_reasoning",
  "coding",
  "sql",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "expired",
  "abandoned",
]);

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "sjt_explanation",
  "code_review",
  "sql_review",
  "personality_narrative",
]);

// --- shared JSON payload shapes ---

export interface TemplateConfig {
  durationSeconds: number;
  questionCount: number;
  selectionMode: "random" | "fixed";
}

export interface SjtOption {
  id: string;
  text: string;
  /** 1 = most effective response, higher = less effective */
  rank: number;
  /** points awarded if this option is selected */
  points: number;
}

export interface SjtResponse {
  selectedOptionId: string;
}

export interface TraitWeight {
  trait: string;
  /** negative = reverse-scored */
  weight: number;
}

export interface ForcedChoiceStatement {
  id: string;
  text: string;
  traits: TraitWeight[];
}

export interface LikertResponse {
  kind: "likert";
  value: number;
}

export interface ForcedChoiceResponse {
  kind: "forced_choice";
  mostLikeId?: string;
  leastLikeId?: string;
}

export type PersonalityResponse = LikertResponse | ForcedChoiceResponse;

// --- tables ---

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const testTemplates = pgTable("test_templates", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  testType: testTypeEnum("test_type").notNull(),
  description: text("description"),
  config: jsonb("config").notNull().$type<TemplateConfig>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    testType: testTypeEnum("test_type").notNull(),
    stem: text("stem").notNull(),
    difficulty: integer("difficulty"),
    tags: text("tags").array(),
    sourceNote: text("source_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("questions_test_type_idx").on(table.testType),
    index("questions_tags_idx").using("gin", table.tags),
  ],
);

// 1:1 child table for SJT-specific structure
export const sjtQuestions = pgTable("sjt_questions", {
  questionId: integer("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  scenarioText: text("scenario_text").notNull(),
  options: jsonb("options").notNull().$type<SjtOption[]>(),
  bestOptionId: varchar("best_option_id", { length: 50 }).notNull(),
  traitTags: text("trait_tags").array(),
});

// 1:1 child table for Likert-scale personality items. The statement text
// lives in questions.stem — short enough to need no separate column.
export const personalityItems = pgTable("personality_items", {
  questionId: integer("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  scaleMin: integer("scale_min").notNull().default(1),
  scaleMax: integer("scale_max").notNull().default(5),
  traits: jsonb("traits").notNull().$type<TraitWeight[]>(),
});

// 1:1 child table for forced-choice personality blocks (2-4 statements,
// judged together — one block is one question, one screen, see
// AttemptRunner.tsx). questions.stem holds the block instruction text.
export const personalityBlocks = pgTable("personality_blocks", {
  questionId: integer("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  statements: jsonb("statements").notNull().$type<ForcedChoiceStatement[]>(),
});

// Attempt-level trait profile snapshot — not per-question, since a trait
// pools contributions from several items/statements across the attempt.
export const traitScores = pgTable(
  "trait_scores",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    trait: varchar("trait", { length: 50 }).notNull(),
    rawScore: numeric("raw_score", { precision: 10, scale: 4 }).notNull(),
    normalizedScore: numeric("normalized_score", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("trait_scores_attempt_trait_idx").on(table.attemptId, table.trait)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    templateId: integer("template_id")
      .notNull()
      .references(() => testTemplates.id),
    testType: testTypeEnum("test_type").notNull(),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // server-authoritative deadline — the only clock that matters for timing
    serverEndAt: timestamp("server_end_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // snapshots at scoring time; never recomputed if scoring rules change later
    totalScore: numeric("total_score", { precision: 10, scale: 2 }),
    maxScore: numeric("max_score", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attempts_user_type_started_idx").on(
      table.userId,
      table.testType,
      table.startedAt,
    ),
  ],
);

export const attemptQuestions = pgTable(
  "attempt_questions",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    ordinal: integer("ordinal").notNull(),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    timeSpentMs: integer("time_spent_ms").notNull().default(0),
    response: jsonb("response").$type<SjtResponse | PersonalityResponse>(),
    isCorrect: boolean("is_correct"),
    pointsAwarded: numeric("points_awarded", { precision: 10, scale: 2 }),
  },
  (table) => [
    uniqueIndex("attempt_questions_attempt_ordinal_idx").on(
      table.attemptId,
      table.ordinal,
    ),
    index("attempt_questions_attempt_idx").on(table.attemptId),
  ],
);

export const llmFeedback = pgTable(
  "llm_feedback",
  {
    id: serial("id").primaryKey(),
    attemptQuestionId: integer("attempt_question_id").references(
      () => attemptQuestions.id,
      { onDelete: "cascade" },
    ),
    attemptId: integer("attempt_id").references(() => attempts.id, {
      onDelete: "cascade",
    }),
    feedbackType: feedbackTypeEnum("feedback_type").notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    rawResponse: text("raw_response").notNull(),
    structured: jsonb("structured"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // these two partial uniques are what make feedback "generate once, never re-billed"
    uniqueIndex("llm_feedback_aq_type_idx")
      .on(table.attemptQuestionId, table.feedbackType)
      .where(sql`${table.attemptQuestionId} is not null`),
    uniqueIndex("llm_feedback_attempt_type_idx")
      .on(table.attemptId, table.feedbackType)
      .where(sql`${table.attemptId} is not null`),
  ],
);
