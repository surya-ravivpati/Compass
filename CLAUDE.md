@AGENTS.md

# CLAUDE.md

Working notes for anyone (human or agent) changing Compass.

## What this is

Compass is a four-year academic planner for high school students. It answers one
question: *given who I am, what my school requires, what I've finished, and what I
want, what should my four years look like?* It generates a complete plan, explains
every placement, lets the student change anything, and shows the consequences.

The defining principle: **AI explains the path. Only the academic engine can
validate it.** Two systems, never mixed:

- **The engine** (`lib/engine`) — deterministic. Prerequisites, availability, grade
  limits, credits, requirements, reachability, validity, plan generation.
- **Compass AI** (`lib/ai`) — Gemini, server-side. Interprets questions, calls
  engine tools, explains results. It never decides what is allowed and never
  changes a plan.

## Commands

```bash
npm run dev            # embedded Postgres (PGlite) in .data/, migrated + seeded on first request
npm test               # vitest: engine, database, AI (mocked), ingestion
npm run typecheck
npm run lint
npm run build

npm run db:generate    # after editing lib/db/schema.ts
npm run db:migrate     # apply migrations to DATABASE_URL
npm run db:seed        # load the demo catalog + every data/catalogs/*/catalog.json

npm run catalog:validate
npm run catalog:extract -- catalog-sources/coursed.pdf --school <id>   # needs GEMINI_API_KEY
npm run catalog:build -- <id>
```

Test, typecheck, lint, and build must all pass before anything is done.

## Invariants

Breaking one of these is a bug even if the tests pass.

1. **`lib/engine` imports only relative paths and does no I/O.** No clock, no
   randomness, no fetch. Enforced by `no-restricted-imports` / `-globals` /
   `-properties` in `eslint.config.mjs`. `startTerm` is an input, never derived
   from `Date`.
2. **The engine is the source of truth.** Anything that says a plan is valid, a
   course is available, a prerequisite is met, or a requirement is satisfied comes
   from `validatePlan` / the engine — never from the model.
3. **Every academic fact Compass AI states comes from a tool result.** Tools live in
   `lib/ai/tools.ts` and wrap engine calls. The model gets only the signed-in
   student's plan and their school's catalog.
4. **Nothing is applied without the student.** Edits are previewed
   (`previewEdit`); consequences and a proposed adjustment are shown; the student
   chooses. AI proposals are always staged, even when conflict-free.
5. **The server re-validates every write.** `commitPlanAction` recomputes validity
   with the engine; a client-sent status is never stored.
6. **Student-owned rows only through `lib/data`**, filtered by the student id from
   the verified session. A plan or version id alone never grants access. Every
   table is listed in `STUDENT_OWNED_TABLES` or `REFERENCE_TABLES` (a test fails
   otherwise).
7. **`met` means completed, never planned.** A requirement is `complete` only from
   finished coursework.
8. **Catalog data is never invented.** Extracted records keep their page and quote.
   A field the engine needs that the source doesn't state must come from a
   reviewed `overrides.json` (tagged `school-config`), or the build fails naming it.
9. **Nothing fake.** No button that does nothing, no invented numbers, no fake AI.
   The demo catalog is labelled as fictional everywhere it appears. With no Gemini
   key, Compass AI says it is offline and the rest of the product still works.
10. **Explanations are readable by a fifteen-year-old**, and asserted verbatim in
    tests because the wording is the feature.

## Conventions

- Time in the engine is a **term index** 0–7 (0 = freshman fall); `-1` means before
  high school. Convert to grades/seasons at the boundary (`lib/engine/terms.ts`).
- Courses carry `durationTerms` (1 semester, 2 full year). Required — never defaulted.
  Full-year courses start in fall.
- Prerequisites are CNF: every group must be met; any option meets a group. Timing is
  `before`, `before-or-concurrent`, or `concurrent` (same time only).
- Courses in the same `equivalenceGroup` cover the same material; taking two is a repeat.
- Preferences only score; they never make something allowed or forbidden.
- School policies (`math every semester`, `World History in freshman year`, `Health
  in sophomore year`, language continuity) are school config with `required` or
  `target` enforcement — not hard-coded.
- Colour carries meaning only: blue = movement/progress/active/AI; green valid, amber
  needs a look, red conflict. Always with an icon and words.
- Commit messages: `feat:` / `fix:` / `test:` / `docs:` / `refactor:` / `chore:`,
  present tense, the *why* in the body.

## Where things are

- `lib/engine/` — types, terms, catalog index + validation, prerequisites, graph and
  reachability, requirement allocation (max-flow), validator, explanations, edits +
  cascades, what-if, workload, options; `generate/` is the planner.
- `lib/catalog/demo-school.ts` — the fictional demo catalog (development data).
- `lib/ingest/` — the coursed.pdf pipeline (extract → review → build).
- `lib/db/` — Drizzle schema, client (Postgres or PGlite), seeding, school loading.
- `lib/data/` — student-owned data access. `lib/auth/` — passwords, sessions, viewer.
- `lib/ai/` — Gemini client, tools, assistant loop, prompts, explainer cache.
- `app/` — routes; `(app)/` requires a signed-in, onboarded student. `proxy.ts` is
  only an optimistic cookie check.
- `components/map/` — the four-year path map; `components/plan/` — the workspace.

## Decisions already made

- **Next.js 16** (App Router, Turbopack, `proxy.ts`). Read `node_modules/next/dist/docs`
  before using an API you haven't checked — it differs from older versions.
- **Postgres via Drizzle; PGlite when `DATABASE_URL` is unset** (local dev and tests),
  so the database tests always run.
- **Custom sessions**: scrypt passwords, random tokens in HttpOnly cookies, only a
  SHA-256 of the token stored.
- **The generator is lane-based search with backtracking**, then elective fill, then
  the same validator the UI uses. Deterministic; bounded; explains every placement.
- **Edits propose a re-plan that keeps the student's edit** (`replanAround`),
  widening from the broken courses to their subjects' pathways, then falling back
  to shifting dependents later. A proposal that can't fix everything says what it
  leaves, and one that doesn't reduce the problems isn't offered.
- **Plans are versioned**; restoring appends a copy. Alternatives are separate plans.
- **Compass AI uses function calling** over engine tools, echoing model turns
  verbatim so Gemini thought signatures survive.

## Known limitations

- `coursed.pdf` was not available when this was built; the demo catalog is fictional.
  Run the pipeline in `data/catalogs/README.md` when the PDF is supplied.
- The engine assumes four years of two semesters. Mid-year transfers aren't modelled.
- A lane holds one course per semester; a second course in the same subject comes
  from the elective pass.
- The sign-in rate limiter is in-memory, per server instance.
- `drizzle-kit` (dev only) pulls an esbuild with a dev-server advisory; it is not in
  the production bundle.
