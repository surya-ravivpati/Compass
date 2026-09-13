# Compass

Compass is a four-year academic and extracurricular planner for high school
students. It is not a checklist that records what you decided -- it is a
constraint solver that tells you what your decisions cost.

A student enters their graduation year, the courses they have finished, a goal
pathway, and what they want to take. Compass then works backward from the goal
and continuously answers: are you still on track, which courses does this
pathway actually require, how late can each one be left, and what have you
already made impossible?

The interaction it is built around: drag a course to a later year, and watch
the courses downstream of it grey out, with an explanation of exactly why.

> This project began as a Startups in Business and Tech (SBT) club project.

## Status

**Phases 1–3 of 5 are complete: the solver, data/auth layer, and planner.**

Built and tested:

- prerequisite expressions (`AND` / `OR` / concurrent / nested)
- the course dependency graph, with cycle detection
- backward reachability from a goal
- goal-relative latest-start-year deadlines
- unreachable-course detection with plain-English explanations
- graduation requirement checking
- activity hour budgeting and meeting-conflict detection
- the database schema, with row-level security on every student-owned table
- a 78-course catalog, 16 clubs, 5 pathways, and graduation requirements
- email/password authentication, protected routes, and session refresh
- a four-year planning grid with drag-and-drop and keyboard placement
- immediate prerequisite, reachability, requirement, and deadline feedback
- accessible hover/focus explanations for blocked and unreachable courses

Not built yet: every screen. `app/page.tsx` is a placeholder that exists only
so the project builds. `/plan` is the working planner; activities, settings,
and marketing arrive in Phases 4–5. See [ARCHITECTURE.md](ARCHITECTURE.md) for
what lands in which phase.

## Getting started

You need **Node 22 or newer** (this project is developed on Node 24).

```bash
git clone https://github.com/CIownPrinc/Morrow.git
cd Morrow
npm install
```

The solver tests need no configuration:

```bash
npm test
npm run typecheck
npm run lint
```

To run the app you need a Supabase project (the free tier is enough):

1. Create one at [supabase.com](https://supabase.com).
2. `cp .env.example .env.local` and fill in the values from
   **Project Settings -> API** and **Project Settings -> Database**.
3. `npm run db:migrate` to create the tables and policies.
4. `npm run dev`.

To run the live row-level-security proof, set `TEST_DATABASE_URL` to a scratch
or development database and run `npm run test:db`. Without it those assertions
are skipped and the run says so.

### If you do not have Node

macOS, without Homebrew or sudo:

```bash
curl -fsSL https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.xz -o node.tar.xz
mkdir -p ~/.local/node-lts && tar -xJf node.tar.xz -C ~/.local/node-lts --strip-components=1
ln -sf ~/.local/node-lts/bin/{node,npm,npx} ~/.local/bin/
```

Make sure `~/.local/bin` is on your `PATH`.

## Project structure

```
app/            Next.js App Router pages and server actions
components/ui/  reusable UI primitives and design tokens
components/plan/the planning grid, catalog rail, and status rail
lib/solver/     the solver -- pure TypeScript, no React, no database
lib/plan/       plan loading and pure planner view-model composition
validation/     Zod schemas guarding data that arrives as JSON
tests/          solver, data, auth, and planner-view tests
```

The one rule worth knowing before you touch anything: **`lib/solver` imports
nothing.** No React, no Next, no database, no Node APIs -- only relative
imports within itself. A lint rule enforces it. [ARCHITECTURE.md](ARCHITECTURE.md)
explains why.

## Contributing

New to pull requests? [CONTRIBUTING.md](CONTRIBUTING.md) walks through it from
the beginning.
