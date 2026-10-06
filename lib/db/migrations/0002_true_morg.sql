CREATE TABLE "reasoning_passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"test_type" "test_type" NOT NULL,
	"title" varchar(200),
	"body" text NOT NULL,
	"data_table" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reasoning_questions" (
	"question_id" integer PRIMARY KEY NOT NULL,
	"passage_id" integer,
	"options" jsonb NOT NULL,
	"correct_option_id" varchar(50) NOT NULL,
	"explanation" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reasoning_questions" ADD CONSTRAINT "reasoning_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasoning_questions" ADD CONSTRAINT "reasoning_questions_passage_id_reasoning_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reasoning_passages"("id") ON DELETE cascade ON UPDATE no action;