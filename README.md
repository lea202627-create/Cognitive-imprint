# Cognitive Imprint

**Version:** v1.0  
**Status:** MVP

Extract cognitive patterns from a public author's writing. Ingest articles from RSS, analyze them with Claude, and generate a structured report covering reasoning habits, argument gaps, strengths, and risk signals.

---

## Access control

The whole app sits behind HTTP Basic Auth (`middleware.ts`), because every API route either spends OpenRouter credits or can delete data. Set `BASIC_AUTH_PASSWORD` in production; leave it unset locally and the gate is skipped. Vercel Cron reaches `GET /api/track` with `Authorization: Bearer $CRON_SECRET`, which bypasses the gate for that one path only.

---

## Governance docs

- [docs/CONSTITUTION.md](docs/CONSTITUTION.md) — 项目宪法：设计理念（工具为何存在）、分析伦理红线、工程原则、演进路线
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 当前架构、两段式分析管道、数据模型
- [docs/ENGINEERING.md](docs/ENGINEERING.md) — 开发规范与合入前验证清单
- [CLAUDE.md](CLAUDE.md) — AI 协作者的工程入口（硬性规则速查）

---

## What it does

1. You add an author with their feed URL (RSS 2.0, RSS 1.0/RDF, or Atom)
2. New articles are picked up automatically — a daily cron (or the one-click **Auto-import** button) fetches, cleans, and analyzes each new article with Claude; a manual check-and-select flow also exists as a fallback
3. The author page shows a **Recent focus** card — what the author has been thinking about lately (topics + core claims from the latest analyzed articles)
4. You can generate a Cognitive Imprint report at any time — a versioned snapshot of the author's cognitive patterns across the full corpus
5. Reports can be exported as Markdown

---

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Drizzle ORM** + **Supabase Postgres** (via `postgres.js`)
- **OpenRouter** for LLM calls (default model `anthropic/claude-sonnet-4`, swappable)

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the two required values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Supabase Postgres connection string — use the **Transaction pooler** URI (port 6543) |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key (starts with `sk-or-v1-`) |
| `OPENROUTER_MODEL` | no | Model id to use. Defaults to `anthropic/claude-sonnet-4` |
| `OPENROUTER_SITE_URL` | no | Your deployed URL, sent to OpenRouter as attribution |
| `CRON_SECRET` | no | Protects the auto-tracking endpoint `GET /api/track`; on Vercel, set it and Vercel Cron sends it automatically |
| `BASIC_AUTH_PASSWORD` | **yes in production** | Enables the HTTP Basic Auth gate (`middleware.ts`). Leave empty locally to skip the login prompt |
| `BASIC_AUTH_USER` | no | Username for the gate. Defaults to `admin` |

### Getting DATABASE_URL (Supabase)
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a project
2. Click **Connect** in the top bar
3. Under **Transaction pooler**, copy the URI (port **6543**) — it looks like:  
   `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
4. Replace `[YOUR-PASSWORD]` with your database password

> Use the **transaction pooler** (6543), not the direct connection (5432). Serverless functions open many short-lived connections; the pooler is built for that, and `lib/db.ts` disables prepared statements accordingly.

### Getting OPENROUTER_API_KEY
1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create a new key and add credits to your account
3. To use a different model, set `OPENROUTER_MODEL` to any id from [openrouter.ai/models](https://openrouter.ai/models) (e.g. `openai/gpt-4o`, `google/gemini-2.5-pro`)

---

## Local setup

```bash
# 1. Clone and install
git clone <repo>
cd cognitive-imprint
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in DATABASE_URL and OPENROUTER_API_KEY

# 3. Run database migration
npm run db:push

# 4. Start dev server
npm run dev
```

App runs at `http://localhost:3000`

---

## Database migration

Drizzle pushes schema directly to Supabase. No migration files needed for MVP.

```bash
npm run db:push
```

This creates three tables: `authors`, `articles`, `imprint_reports`. They appear in the Supabase dashboard under **Table Editor**.

`drizzle.config.ts` loads `.env.local` automatically, so no extra env setup is needed for this command.

To inspect data:
```bash
npm run db:studio
```
Opens Drizzle Studio at `http://localhost:4983`

---

## Local build

```bash
npm run build
npm run start
```

---

## Deploying to Vercel

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "initial"
git remote add origin <your-github-repo>
git push -u origin main
```

### Step 2 — Create Vercel project
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Add environment variables:
   - `DATABASE_URL` — your Supabase transaction-pooler connection string
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - `CRON_SECRET` — any random string, so only Vercel Cron can trigger auto-tracking
   - `BASIC_AUTH_PASSWORD` — **required.** Without it the deployment is wide open: anyone who finds the URL can spend your OpenRouter credits and delete your data
   - `OPENROUTER_MODEL` / `OPENROUTER_SITE_URL` / `BASIC_AUTH_USER` — optional

### Step 3 — Deploy
Click **Deploy**. Vercel builds and deploys automatically.

### Step 4 — Run DB migration after first deploy
```bash
# From local machine with .env.local set
npm run db:push
```
This only needs to run once (or after schema changes).

### Notes on Vercel serverless limits
- Hobby plan: 60s function timeout
- Ingesting many articles at once may approach this limit
- If timeout errors occur: import articles in smaller batches (3–5 at a time). Auto-tracking already caps itself at 5 articles per author and 8 per cron run
- Generating the imprint report (single LLM call) should complete within the limit for corpora under 30 articles
- Always use the Supabase **transaction pooler** URI here — the direct connection (5432) exhausts its connection limit under serverless

---

## Project structure

```
cognitive-imprint/
├── app/
│   ├── layout.tsx              # Root layout, fonts, global styles
│   ├── page.tsx                # Home: author list + add author
│   ├── globals.css
│   └── api/
│       ├── authors/
│       │   └── route.ts        # GET all authors, POST new author
│       ├── articles/
│       │   ├── route.ts        # GET articles by authorId (optionally with features)
│       │   ├── check/route.ts  # POST: check RSS for new items
│       │   └── ingest/route.ts # POST: fetch + analyze selected articles
│       ├── track/
│       │   └── route.ts        # GET: cron auto-tracking (all authors), POST: one author
│       └── analyze/
│           ├── route.ts        # POST: generate imprint, GET: list reports
│           └── export/route.ts # GET: export report as Markdown
│   └── authors/
│       └── [id]/
│           ├── page.tsx        # Author detail: articles, check, ingest
│           └── report/
│               └── page.tsx    # Imprint report viewer + export
├── lib/
│   ├── db.ts                   # Drizzle + Supabase (postgres.js) connection
│   ├── schema.ts               # Database schema
│   ├── fetcher.ts              # Feed parser (RSS/RDF/Atom) + article text extractor
│   ├── analyzer.ts             # LLM pipeline: per-doc + corpus analysis
│   ├── tracker.ts              # Auto-tracking: check feed → dedupe → ingest + analyze
│   └── export.ts               # Markdown export
├── types/
│   └── index.ts                # All TypeScript types
├── drizzle.config.ts
├── vercel.json                 # Daily cron → /api/track
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── .env.example
└── package.json
```

---

## User flow

1. Open `/` → Add author (name, feed URL, optional site URL + description). RSS 2.0, RSS 1.0/RDF, and Atom feeds all work; a URL that isn't a feed returns a clear error rather than silently finding nothing.
2. Click author → Author detail page
3. Click **Auto-import new articles** → system checks RSS and automatically fetches + analyzes everything new (up to 5 per run). Or use **Check manually** to pick articles yourself. In production, a daily cron does the auto-import for all authors without any clicks.
4. The **Recent focus** card at the top of the author page updates as articles come in — recent topics and core claims, i.e. what the author is thinking about lately
5. When corpus is ready → click **Generate imprint**
6. Report opens at `/authors/[id]/report`
7. Export as Markdown from the report page

## Auto-tracking

- **Vercel Cron** (configured in `vercel.json`) calls `GET /api/track` daily at 02:00 UTC: every author's feed is checked, new articles are deduped (by URL/GUID), fetched, analyzed, and stored — capped at 5 articles per author and 8 per run to stay inside the 60s serverless limit; the remainder is picked up on the next run.
- **Manual trigger**: the **Auto-import new articles** button on the author page runs the same pipeline for one author, or hit the endpoint directly:

```bash
curl -X POST http://localhost:3000/api/track -H 'Content-Type: application/json' -d '{"authorId": 1}'
```

- Set `CRON_SECRET` in production to prevent strangers from triggering the cron endpoint.

---

## Scope (v1.0)

**In scope:**
- Single-author corpus analysis
- Auto-tracking: daily scheduled fetch + one-click auto-import (v1.1)
- Recent focus view: what the author is thinking about lately (v1.1)
- Manual article import from RSS (fallback path)
- Per-document cognitive feature extraction
- Corpus-level imprint report generation
- Versioned reports (each generation saved separately)
- Markdown export

**Out of scope (see docs/CONSTITUTION.md for the roadmap):**
- Multi-author comparison
- Cognitive trajectory diff between report versions (planned v2.x)
- X/Twitter as a source (future; RSS-bridged sources work today)
- Writing style imitation (permanently excluded)
