CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'expired', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('sjt_explanation', 'code_review', 'sql_review', 'personality_narrative');--> statement-breakpoint
CREATE TYPE "public"."test_type" AS ENUM('sjt', 'personality', 'numerical_reasoning', 'verbal_reasoning', 'coding', 'sql');--> statement-breakpoint
CREATE TABLE "attempt_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"first_viewed_at" timestamp with time zone,
	"time_spent_ms" integer DEFAULT 0 NOT NULL,
	"response" jsonb,
	"is_correct" boolean,
	"points_awarded" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"test_type" "test_type" NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_end_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"total_score" numeric(10, 2),
	"max_score" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_question_id" integer,
	"attempt_id" integer,
	"feedback_type" "feedback_type" NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"raw_response" text NOT NULL,
	"structured" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_type" "test_type" NOT NULL,
	"stem" text NOT NULL,
	"difficulty" integer,
	"tags" text[],
	"source_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sjt_questions" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"scenario_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"best_option_id" varchar(50) NOT NULL,
	"trait_tags" text[]
);
--> statement-breakpoint
CREATE TABLE "test_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"test_type" "test_type" NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_template_id_test_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."test_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_attempt_question_id_attempt_questions_id_fk" FOREIGN KEY ("attempt_question_id") REFERENCES "public"."attempt_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_feedback" ADD CONSTRAINT "llm_feedback_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sjt_questions" ADD CONSTRAINT "sjt_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_questions_attempt_ordinal_idx" ON "attempt_questions" USING btree ("attempt_id","ordinal");--> statement-breakpoint
CREATE INDEX "attempt_questions_attempt_idx" ON "attempt_questions" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attempts_user_type_started_idx" ON "attempts" USING btree ("user_id","test_type","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_feedback_aq_type_idx" ON "llm_feedback" USING btree ("attempt_question_id","feedback_type") WHERE "llm_feedback"."attempt_question_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_feedback_attempt_type_idx" ON "llm_feedback" USING btree ("attempt_id","feedback_type") WHERE "llm_feedback"."attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "questions_test_type_idx" ON "questions" USING btree ("test_type");--> statement-breakpoint
CREATE INDEX "questions_tags_idx" ON "questions" USING gin ("tags");