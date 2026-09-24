# Compass

**Your four years. Mapped.**

Compass turns graduation requirements, prerequisites, and a student's goals into a
personalized path through high school — and shows what changes if they take another
route.

A student tells Compass where they are (grade, the math they finished before high
school, courses behind them) and what they want (goals, how challenging a schedule
should feel, commitments outside class). Compass generates a complete four-year
plan, six to seven courses a semester, checks every constraint, and explains each
placement in plain language. They can drag courses around, try "what if" scenarios,
and ask Compass AI about their plan. Nothing changes without their say.

> **AI explains the path. The academic engine proves the path.**

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No setup needed: without `DATABASE_URL`, Compass runs an embedded Postgres (PGlite)
in `.data/pglite`, migrates it, and seeds the demo catalog on first request.

To turn on Compass AI, add a Gemini key to `.env.local` (see `.env.example`):

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash   # optional
```

Without a key, Compass AI shows itself as offline and everything else works.

## Checks

```bash
npm test             # engine, database + authorization, AI (mocked), ingestion
npm run typecheck
npm run lint
npm run build
```

## What's inside

| Area | Where |
| --- | --- |
| Deterministic academic engine | `lib/engine` |
| Four-year plan generator | `lib/engine/generate` |
| Demo catalog (fictional) | `lib/catalog/demo-school.ts` |
| Course-catalog PDF pipeline | `lib/ingest`, `scripts/*-catalog.ts`, `data/catalogs` |
| Database (Drizzle, Postgres/PGlite) | `lib/db` |
| Auth + student data access | `lib/auth`, `lib/data` |
| Compass AI (Gemini, server-side) | `lib/ai`, `app/api/assistant` |
| Pages | `app/` — Home, My Plan, Explore, Requirements, What If?, Compass AI, Settings |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together and why, and
[CLAUDE.md](CLAUDE.md) for the invariants every change must keep.

## Using a real school's catalog

The demo catalog is fictional development data. To load a real catalog (for
example `coursed.pdf`), follow [data/catalogs/README.md](data/catalogs/README.md):
extract a draft with page-level sources, review it, supply anything the PDF
doesn't state in `overrides.json`, build, and seed.

## Deploying

Set `DATABASE_URL` to a Postgres database, then:

```bash
npm run db:migrate
npm run db:seed
npm run build && npm start
```

Set `GEMINI_API_KEY` in the server environment only — never with a `NEXT_PUBLIC_`
prefix. Session cookies are `Secure` in production, so serve over HTTPS.
