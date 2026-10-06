# Assessment Practice

A personal web app for practising the online assessments used in graduate /
early-career job application processes — situational judgement tests,
personality questionnaires, numerical & verbal reasoning, coding challenges,
and SQL challenges. Formats are config-driven templates, not tied to any one
employer; content is written to match the *style and difficulty* of real
assessments, never reproduce them.

**Status: situational judgement, personality questionnaires, and
numerical/verbal reasoning, end to end.** Coding and SQL challenges are the
remaining two; see "What's not built yet" below.

## Stack

- **Next.js 16** (App Router, TypeScript) — pages + API routes in one app
- **Postgres** via **Drizzle ORM** — schema in `lib/db/schema.ts`
- **iron-session** — single-user auth (one login, no OAuth)
- **Anthropic API** (`@anthropic-ai/sdk`) — SJT answer feedback, behind a
  swappable provider interface (`lib/llm/provider.ts`)
- **Docker Compose + Caddy** — deployment, automatic HTTPS

## Running locally

1. Install dependencies: `npm install`
2. Start a local Postgres (or point `DATABASE_URL` at one you already have)
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `SESSION_SECRET`
   (32+ random characters — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
   `BOOTSTRAP_PASSWORD`, and `ANTHROPIC_API_KEY`
4. Run migrations: `npm run db:migrate`
5. Seed the default templates + question banks + your login:
   `npm run db:seed` (idempotent per template — safe to re-run after
   pulling changes; it only inserts what's missing)
6. `npm run dev`, then sign in at `http://localhost:3000/login` with
   `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD`

Without a real `ANTHROPIC_API_KEY`, everything works except the "Show AI
feedback" (SJT) and "Show AI summary" (personality) buttons on the results
page, which fail with a clear error instead of crashing anything else.

## Deploying (Docker Compose + Caddy)

On the VPS:

```bash
git clone <this repo> && cd assessment-practice
cp .env.example .env   # fill in POSTGRES_PASSWORD, SESSION_SECRET, DOMAIN,
                        # ANTHROPIC_API_KEY, BOOTSTRAP_EMAIL/PASSWORD
docker compose build
docker compose --profile tools run --rm migrate
docker compose --profile tools run --rm seed
docker compose up -d
```

`DOMAIN` must already point at the VPS's IP — Caddy requests a Let's Encrypt
certificate for it automatically on first request. Re-run the `migrate`
profile (not `seed`, which is a no-op if the default template already
exists) after pulling schema changes in future.

The resource limits in `docker-compose.yml` (app 512MB, Postgres 640MB,
Caddy 64MB, ~1.7GB headroom) target a 4GB RAM / 2 vCPU VPS — adjust if yours
differs. Verified in this environment by building and running the full
image set (app + Postgres, migrate/seed one-offs) in plain Docker — `docker
compose up` itself wasn't runnable here since this sandbox had no reachable
Docker registry/network by default (worked once routed through this
session's proxy); it should work normally on a VPS with ordinary internet
access.

## Design notes

- **Timing is server-authoritative.** `attempts.server_end_at` is set once
  at start; the client countdown is cosmetic and every write checks
  `now > server_end_at` server-side. An abandoned attempt finalizes itself
  (scored as-is, status `expired`) lazily on the next request that touches
  it — there's no background job.
- **LLM feedback is generated once and cached** in `llm_feedback`. SJT
  feedback is keyed per-question (`attempt_question_id, feedback_type`);
  the personality narrative is keyed per-attempt (`attempt_id,
  feedback_type`, since it summarizes the whole trait profile, not one
  question) — both via DB-level unique constraints, so reopening the
  results page never re-calls the API either way.
- **Scoring has a thin dispatcher** (`lib/attempts/finalize.ts`), a `switch`
  on `attempts.testType` with a throwing default (so a future `coding`/`sql`
  attempt fails loudly instead of silently scoring as SJT). Each type gets
  its own pure scorer (`sjtScorer.ts`, `personalityScorer.ts`,
  `reasoningScorer.ts`) — still no shared interface/registry. Reasoning is
  the first real test of that choice: it produces the same
  `{isCorrect, pointsAwarded, maxPoints}` shape as SJT, but that's
  coincidence (flat correct/incorrect vs. points-per-option), not a shared
  contract, so it stayed separate rather than forcing a shared scorer
  signature around two different join shapes. Coding/SQL landing — async
  execution, partial test-case credit — is the point to revisit this with
  actual data instead of a guess.
- **Personality attempts have no `totalScore`/`maxScore`** — they stay
  `null` rather than holding a completion ratio, because the type
  deliberately has no "correct answer" concept; the real output is the
  trait profile in `trait_scores`. `app/progress/page.tsx` filters these
  out of its average and renders `—` for their Score column instead of
  `null / null`.
- **Trait profile bars are plain CSS `div`s, not a charting library** — at
  most ~6 static, non-interactive bars didn't justify a new dependency in a
  project that otherwise uses no UI kit; revisit if a later test type needs
  interactive/multi-series charts.
- **Autosave fix worth knowing about**: an earlier version debounced each
  answer save by 400ms behind one shared timeout, which could silently drop
  an answer if the user moved to the next question (or hit Submit) within
  that window — a real bug, caught while building the personality flow's
  e2e test, that also applied to SJT. Every answer here is a discrete
  button click, so there's no good reason to debounce at all: saves now
  fire immediately, and Submit explicitly awaits the most recent save
  before scoring, closing the race instead of just narrowing it.
- **No `server-only` guard on `lib/auth/password.ts`**, unlike the rest of
  `lib/`: `scripts/seed.ts` runs via `tsx` outside Next's bundler, where the
  `server-only` package's always-throw stub would fire even though nothing
  client-side is involved. Node's own `crypto` import already makes the
  module unbundleable into a client component.
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`** (same mechanism, new
  name) — the auth gate lives in `proxy.ts` at the repo root.
- **Reasoning passages are inlined per-question, not deduplicated on the
  wire** — several questions can share a `reasoning_passages` row, but each
  question's API response carries its own full copy of the passage. Simpler
  than a separate lookup map, and correct regardless of ordinal order
  (shared-passage questions aren't guaranteed to land adjacent after random
  selection). A real bug this caught on the way in: checking `passageBody`
  truthiness to decide "does this question have a passage" breaks for
  numerical passages, which store their content in `dataTable` and leave
  `body` as `""` — an empty string is falsy in JS, so that check silently
  dropped every numerical passage. Fixed by checking the actual FK
  (`passageId !== null`) instead of inferring presence from content.

## What's not built yet

Per the agreed build order: the Gemini + Groq free-tier LLM providers
(behind the existing `LLMProvider` interface), self-hosted Judge0 for
coding + SQL challenges, and progress-dashboard polish beyond a plain
attempt history table.
