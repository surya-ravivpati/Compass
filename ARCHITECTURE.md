# Architecture

Compass is two systems with a hard line between them.

```
Student ─▶ Compass UI ─┬─▶ Academic engine (deterministic) ─▶ validated plan, findings, explanations
                       │         ▲
                       └─▶ Compass AI (Gemini, server-side)
                                 │ calls engine tools, explains their results,
                                 └ proposes changes the student can open
```

The engine decides what is true. The AI decides how to say it.

## 1. The academic engine (`lib/engine`)

Pure TypeScript: plain data in, plain data out, no imports beyond its own files, no
clock, no randomness, no I/O (lint-enforced). It runs identically on the server (to
generate and re-validate), in the browser (to validate every drag instantly), and in
tests.

### Data model

- **Time** is a term index: 0 = freshman fall … 7 = senior spring; −1 = before high
  school. A placement is `{ courseId, term, status }` with status `completed`,
  `in-progress`, or `planned`. `StudentState.startTerm` is the first term Compass
  may plan.
- **Courses** carry credits, `durationTerms` (1 or 2), eligible grades, starting
  seasons, a level, a workload estimate, tags, the requirements they can count
  toward, optional sequence (`spanish` step 2), equivalence group (Algebra 2 ≈
  Honors Algebra 2), repeat limit, and a `source` (document, page, quote).
- **Prerequisites** are conjunctive normal form — every group must be met, any
  option meets a group — with per-option timing: `before`, `before-or-concurrent`,
  `concurrent`. The same shape is stored relationally as edges (`prerequisites`
  table: course, group, option order, prerequisite, timing).
- **Requirements** are `category` (credits from courses that list them, optional
  must-include groups, optional same-sequence rule) or the single `elective`
  requirement that absorbs leftover credit. A school also sets a total.
- **Policies** are school configuration with `required` or `target` enforcement:
  a department every semester (math), a course in a grade (World History in 9th,
  Health in 10th), and language continuity.

### Validation (`validate.ts`)

`validatePlan` returns findings grouped into checks — requirements, prerequisites,
availability (season, grade, fits before graduation, not in the past), future
reachability, course load, repeats, school policies. Each finding is plain English,
carries its source, and may offer fixes (move, add, remove) that the UI presents as
options. Severity drives status: any error → invalid; warnings (targets) →
attention. An every-semester gap is an error only if some course could actually
fill it; otherwise it's explained as expected.

### Requirement allocation (`requirements.ts`)

Each placement's credits count toward one requirement:

1. Must-include courses go to the requirement that names them.
2. Same-sequence requirements count only their best sequence (most credits, finished
   work first).
3. A max-flow (Edmonds–Karp, deterministic adjacency) fills category requirements,
   adding completed, then in-progress, then planned credits, so finished work counts
   first while total coverage is maximal.
4. Leftovers fill electives; the rest is reported as extra.

Status is `complete` only from completed work — planned credit is never "met".

### Reachability (`graph.ts`)

`earliestStarts` computes, for every course, the earliest term it could start given
what's already taken — a memoised pass over the prerequisite DAG that respects
timing, seasons, and grade limits and deliberately ignores course load (it answers
"is this mathematically reachable?"). It records which prerequisite set the bound,
so `limitingChain` can explain *why*: "AP Calculus BC needs AP Precalculus first,
which comes after Algebra 2…". Elective and total-credit reachability use the seats
left (semesters × maximum load × ½ credit).

### Generation (`generate/`)

1. **Lanes.** One per category requirement, holding the courses that satisfy it,
   ordered so a lane comes after lanes its courses depend on (science after math).
2. **Tracks.** For each lane, a beam search runs year by year over what the lane
   holds each year: nothing, one full-year course, or up to two semester courses
   (a full-year course may also run alongside a pinned semester one). A language
   lane tries the student's language first, then the school's others in order, so
   a sequence that can't be started hands over instead of failing the lane.
   Hard constraints prune (availability, grade, prerequisites against everything
   already placed, repeats, capacity, same-language continuity with no gap years,
   every-semester coverage). Preferences only score: requirement progress (credits
   reserved for still-missing named courses), rigor distance, interests, workload
   in busy seasons, placement targets, requested courses and their prerequisites.
3. **Backtracking** tries lanes' tracks in score order, depth-first, within fixed
   budgets — deterministic, never time-based.
4. **Electives** fill each semester to the student's load, comparing the best
   full-year and semester options, favouring interest, breadth, and courses that
   build on earlier electives. If graduation still needs credits, the load rises
   toward the school maximum and a note says so.
5. **Validation.** The finished plan must pass `validatePlan` with no errors to be
   returned as valid; otherwise the best attempt and structured reasons come back as
   "no valid schedule".

Every placement records why it was chosen (requirement, pathway step, policy, goal,
rigor, request, fill). The stages returned — requirements, prerequisites,
availability, preferences, validation — are the steps that actually ran, with their
real numbers; the onboarding reveal replays them.

### Edits, cascades, and what-if

- `previewEdit` applies an edit to a copy, re-validates, and diffs findings. If the
  edit breaks something, `replanAround` runs the generator with every untouched
  course pinned, the edited course locked, and only the broken courses, what builds
  on them, and electives in terms still overfilled released (never a course a kept
  one needs). If that finds no valid plan, it releases the affected subjects' whole
  pathways, then electives too — that last tier only counts if it changes at most
  four courses, since a bigger re-plan belongs in What if?. Re-plans are anchored:
  courses already in the plan score a bonus for staying where they were, so the
  proposal is the smallest change that works, and a complete valid plan that keeps
  the student's change. Failing all three, it falls back to shifting dependents later, and
  offers that only if it leaves fewer problems than the edit alone; the pending bar
  names what an adjustment still leaves unfixed.
  The student chooses: apply with adjustments, keep the change as-is, or revert.
- `runScenario` answers what-ifs (swap, move, drop, add, change priorities) the same
  way and `comparePlans` reports changed courses, prerequisite effects, requirement
  effects, downstream moves, and workload — never a ranking.

## 2. Compass AI (`lib/ai`)

- **Server-side only.** `app/api/assistant` authenticates the student, rate-limits,
  and builds context from their own plan and school; the Gemini key never leaves
  the server.
- **Tools, not memory.** The model is given engine-backed tools — plan overview,
  course record, explain placement, why not, requirements, search, preview move,
  compare scenario, workload — and a system prompt that forbids stating academic
  facts not returned by a tool, ranking options, or predicting admissions.
- **Grounded output.** Each tool result carries facts with sources; the UI shows
  them under the answer. Changes come back as proposals the student opens in My Plan
  (staged for review) or What If.
- **Protocol care.** Model turns are echoed back verbatim so Gemini thought
  signatures survive multi-step function calling.
- **Failure.** No key → offline state; errors → a plain message and an unchanged plan.
- **Cost.** Deterministic features never call the model. Course explainers are
  generated from the catalog record only and cached per catalog version in `ai_cache`.
  Goal interpretation returns only known goal ids and tags, as suggestions.

## 3. Data, auth, privacy (`lib/db`, `lib/auth`, `lib/data`)

- Postgres via Drizzle; PGlite in development and tests (the database and
  authorization tests always run).
- Reference tables: schools, courses, prerequisites, requirements, ai_cache.
  Student-owned: users, sessions, students, student_courses, plans, plan_versions,
  plan_courses. A test fails if a table is unclassified.
- Passwords: scrypt with per-user salt; sessions: 32-byte random tokens in HttpOnly,
  SameSite=Lax cookies, only the SHA-256 stored. `proxy.ts` makes an optimistic
  cookie check; `lib/auth/viewer` verifies against the database on every request.
- Every student-owned query takes the student id from the session. Tests prove a
  second student can't read, version, rename, promote, or delete someone else's plan.
- Plans are versioned: every change appends an immutable version with a
  server-computed validation status; restore appends a copy; optimistic concurrency
  rejects stale writes. Deleting an account cascades to everything the student owns.

## 4. Interface

- **Path map** (`components/map`): lanes (English, Math, Science, Social Studies,
  World Language, electives) × semesters, full-year courses spanning both. Each lane
  is packed into as few rows as it needs. Prerequisite edges are measured from the
  rendered cards; selecting a course lights its chain before and after.
- **Workspace** (`components/plan`): drag-and-drop with per-term drop hints from
  `moveOptions`, a keyboard path (Alt + arrows, Move/Replace menus), an inspector
  that explains the selected course, staged changes, undo, version history, and
  alternatives. Small screens get a list view.
- The design is dark-first; blue marks movement, progress, active state, and AI.
  Status always pairs colour with an icon and words; motion respects
  `prefers-reduced-motion`.

## 5. Catalog pipeline (`lib/ingest`)

`coursed.pdf` → text per page (`unpdf`) → Gemini extraction of only-stated fields
with page and quote → deterministic merge that flags gaps and conflicts →
`extracted.json` + `REVIEW.md` → human-reviewed `overrides.json` → `buildSchool`,
which refuses any missing required field or unresolved prerequisite and runs the
catalog validator → `catalog.json` → seed. See `data/catalogs/README.md`.
