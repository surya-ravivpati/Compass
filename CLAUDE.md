# CLAUDE.md

Working notes for anyone (human or agent) making changes to Compass.

## What this is

A four-year academic planner for high school students, built around a
constraint solver. The product's value is making invisible constraints visible:
a student moves one course and immediately sees what that costs them three
years later.

It is **not** a chatbot, an AI tutor, a recommendation engine, a college
admissions tool, or a course checklist. Do not add features in those
directions.

## Commands

```bash
npm test          # vitest run
npm run test:watch
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run dev       # placeholder page only until Phase 3
npm run build
```

All three of test / typecheck / lint must pass before anything is considered
done.

## Current state

Phase 1 (the solver) is complete: 132 tests. Phases 2-5 -- database, auth, UI,
marketing -- are not started. `app/page.tsx` is a placeholder that exists only
so `next build` succeeds; it is not the landing page.

## Architecture in one paragraph

`lib/solver` is pure TypeScript that imports nothing and does no I/O. It takes
a plan and a catalog as plain data and returns findings as plain data. Everything
else -- pages, database, auth -- feeds it and draws its output. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning.

## Invariants

Breaking one of these is a bug even if tests pass:

1. **`lib/solver` imports nothing but relative paths.** Enforced by the
   `solver-purity/no-external-imports` lint rule in `eslint.config.mjs`.
2. **No clock, no randomness, no I/O in the solver.** `currentGrade` is an
   input, not derived from `Date.now()`.
3. **Catalogs are acyclic**, and a cycle error names the actual cycle.
4. **Every explanation is readable by a fifteen-year-old.** Reason strings are
   asserted verbatim in tests because the wording is the feature.
5. **`met` means completed, never planned.**
6. **Nothing fake.** No buttons that do nothing, no placeholder UI that looks
   finished, no invented data. Unfinished work stays visibly disabled and
   marked `TODO:`.

## Conventions

- Time inside the solver is a **term index** (0-7), not a grade or a calendar
  year. Convert at the boundary.
- Courses carry `durationTerms` (1 = semester, 2 = full year). It is required,
  never defaulted -- a wrong default corrupts every downstream deadline
  silently.
- A co-requisite that prior completion also satisfies is authored as
  `or(course X, concurrent X)`. `concurrent` alone means same-time only.
- Colour carries meaning and nothing else: green satisfied, amber at risk, red
  blocked, grey unreachable. Never decorative.
- Commit messages: `feat:` / `fix:` / `test:` / `docs:` / `refactor:` /
  `chore:`, present tense, with the *why* in the body when it is not obvious.

## Decisions already made

Do not relitigate these without a reason:

- **Term granularity** for prerequisites, which is why `durationTerms` exists.
- **`latestStartYear` takes the goal.** Its two-argument form in the original
  spec is not well defined; against the whole catalog the answer is close to
  meaningless.
- **Activity hours are per season**, and the year's figure is its peak, not its
  sum. A fall club and a spring club never cost the same week.
- **Next.js is pinned to 15.x**, not `latest` (16.x), per the mandated stack.
- **Violations and unreachable courses are separate outputs.** Different
  states, different fixes.

## Known limitations

- `npm audit` reports two advisories in the `postcss` copy bundled inside Next
  15. They are build-time CSS-tooling issues (`sourceMappingURL` path traversal
  and a stringify XSS) that apply to processing untrusted CSS, which this
  project does not do. npm's only offered fix is Next 16, which the stack
  forbids. Revisit if Next backports.
- The solver assumes exactly four years and two terms per year. A student
  transferring mid-year has no representation.
- Credit counting treats all completed courses as earning credit, including
  middle-school coursework. Real schools often do not.
- `unreachable` explains via the single prerequisite that pushed a course
  latest. When two independent chains both fail, only one is named.

## Out of scope

Do not build, and do not add placeholder versions of: AI or chat features,
catalog PDF ingestion, counselor dashboards, multiple schools, admissions
predictions, period-by-period scheduling, multiple saved plans, sharing,
exporting, printing, or notifications.

The MVP plans in **year + term**, never class periods.
