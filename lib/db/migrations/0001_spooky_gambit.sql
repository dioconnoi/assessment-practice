CREATE TABLE "personality_blocks" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"statements" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_items" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"scale_min" integer DEFAULT 1 NOT NULL,
	"scale_max" integer DEFAULT 5 NOT NULL,
	"traits" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trait_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"trait" varchar(50) NOT NULL,
	"raw_score" numeric(10, 4) NOT NULL,
	"normalized_score" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personality_blocks" ADD CONSTRAINT "personality_blocks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_items" ADD CONSTRAINT "personality_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trait_scores" ADD CONSTRAINT "trait_scores_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trait_scores_attempt_trait_idx" ON "trait_scores" USING btree ("attempt_id","trait");