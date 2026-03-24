# Cognitive Imprint

**Version:** v1.0  
**Status:** MVP

Extract cognitive patterns from a public author's writing. Ingest articles from RSS, analyze them with Claude, and generate a structured report covering reasoning habits, argument gaps, strengths, and risk signals.

---

## What it does

1. You add an author with their RSS feed URL
2. You manually check for new articles and choose which ones to import
3. Each article is fetched, cleaned, and analyzed by Claude
4. You can generate a Cognitive Imprint report at any time — a versioned snapshot of the author's cognitive patterns across the full corpus
5. Reports can be exported as Markdown

---

## Tech stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Drizzle ORM** + **Neon Postgres**
- **Anthropic Claude** (claude-sonnet-4-20250514)

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in both values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (with `?sslmode=require`) |
| `ANTHROPIC_API_KEY` | Anthropic API key (starts with `sk-ant-`) |

### Getting DATABASE_URL
1. Go to [console.neon.tech](https://console.neon.tech)
2. Create a new project
3. Go to **Connection Details**
4. Copy the connection string — it should look like:  
   `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

### Getting ANTHROPIC_API_KEY
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys**
3. Create a new key

---

## Local setup

```bash
# 1. Clone and install
git clone <repo>
cd cognitive-imprint
npm install

# 2. Set up environment
cp .env.example .env.local
# Fill in DATABASE_URL and ANTHROPIC_API_KEY

# 3. Run database migration
npm run db:push

# 4. Start dev server
npm run dev
```

App runs at `http://localhost:3000`

---

## Database migration

Drizzle pushes schema directly to Neon. No migration files needed for MVP.

```bash
npm run db:push
```

This creates three tables: `authors`, `articles`, `imprint_reports`.

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
   - `DATABASE_URL` — your Neon connection string
   - `ANTHROPIC_API_KEY` — your Anthropic key

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
- If timeout errors occur: import articles in smaller batches (3–5 at a time)
- Generating the imprint report (single LLM call) should complete within the limit for corpora under 30 articles

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
│       │   ├── route.ts        # GET articles by authorId
│       │   ├── check/route.ts  # POST: check RSS for new items
│       │   └── ingest/route.ts # POST: fetch + analyze selected articles
│       └── analyze/
│           ├── route.ts        # POST: generate imprint, GET: list reports
│           └── export/route.ts # GET: export report as Markdown
│   └── authors/
│       └── [id]/
│           ├── page.tsx        # Author detail: articles, check, ingest
│           └── report/
│               └── page.tsx    # Imprint report viewer + export
├── lib/
│   ├── db.ts                   # Drizzle + Neon connection
│   ├── schema.ts               # Database schema
│   ├── fetcher.ts              # RSS parser + article text extractor
│   ├── analyzer.ts             # LLM pipeline: per-doc + corpus analysis
│   └── export.ts               # Markdown export
├── types/
│   └── index.ts                # All TypeScript types
├── drizzle.config.ts
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── .env.example
└── package.json
```

---

## User flow

1. Open `/` → Add author (name, RSS feed URL, optional site URL + description)
2. Click author → Author detail page
3. Click **Check for new articles** → system checks RSS, shows new items
4. Select articles to import → click **Import**
5. Each article is fetched and analyzed (takes ~5–15 seconds per article)
6. When corpus is ready → click **Generate imprint**
7. Report opens at `/authors/[id]/report`
8. Export as Markdown from the report page

---

## Scope (v1.0)

**In scope:**
- Single-author corpus analysis
- Manual article import from RSS
- Per-document cognitive feature extraction
- Corpus-level imprint report generation
- Versioned reports (each generation saved separately)
- Markdown export

**Out of scope for v1.0:**
- Auto-crawling / scheduled fetch
- Multi-author comparison
- Real-time monitoring
- Writing style imitation
