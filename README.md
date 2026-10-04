# Assessment Practice

A personal web app for practising the online assessments used in graduate /
early-career job application processes — situational judgement tests,
personality questionnaires, numerical & verbal reasoning, coding challenges,
and SQL challenges. Formats are config-driven templates, not tied to any one
employer; content is written to match the *style and difficulty* of real
assessments, never reproduce them.

**Status: V1 slice 1 — situational judgement, end to end.** The other four
test types (personality, reasoning, coding, SQL) are future phases; see
"What's not built yet" below.

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
5. Seed the default SJT template + question bank + your login:
   `npm run db:seed`
6. `npm run dev`, then sign in at `http://localhost:3000/login` with
   `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD`

Without a real `ANTHROPIC_API_KEY`, everything works except the "Show AI
feedback" button on the results page, which fails with a clear error instead
of crashing anything else.

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
- **LLM feedback is generated once and cached** in `llm_feedback`, keyed by
  `(attempt_question_id, feedback_type)` with a DB-level unique constraint —
  reopening the results page never re-calls the API.
- **Scoring is a direct SJT-specific implementation** (`lib/scoring/sjtScorer.ts`),
  not a generic multi-type dispatcher — with only one test type built, an
  abstraction over types that don't exist yet would be speculative. The
  plan is for personality/reasoning/coding/SQL to each get their own scorer
  module, with a thin dispatcher introduced once the shared shape is clear
  from having more than one real case.
- **No `server-only` guard on `lib/auth/password.ts`**, unlike the rest of
  `lib/`: `scripts/seed.ts` runs via `tsx` outside Next's bundler, where the
  `server-only` package's always-throw stub would fire even though nothing
  client-side is involved. Node's own `crypto` import already makes the
  module unbundleable into a client component.
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`** (same mechanism, new
  name) — the auth gate lives in `proxy.ts` at the repo root.

## What's not built yet

Per the agreed build order: personality questionnaires, numerical/verbal
reasoning, the Gemini + Groq free-tier LLM providers (behind the existing
`LLMProvider` interface), self-hosted Judge0 for coding + SQL challenges,
and progress-dashboard polish beyond a plain attempt history table.
