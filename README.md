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

**Phase 1 of 5 is complete: the solver.**

Built and tested:

- prerequisite expressions (`AND` / `OR` / concurrent / nested)
- the course dependency graph, with cycle detection
- backward reachability from a goal
- goal-relative latest-start-year deadlines
- unreachable-course detection with plain-English explanations
- graduation requirement checking
- activity hour budgeting and meeting-conflict detection

Not built yet: the database, authentication, and every screen. `app/page.tsx`
is a placeholder that exists only so the project builds. See
[ARCHITECTURE.md](ARCHITECTURE.md) for what lands in which phase.

## Getting started

You need **Node 22 or newer** (this project is developed on Node 24).

```bash
git clone https://github.com/CIownPrinc/Morrow.git
cd Morrow
npm install
```

There is nothing to configure yet. `.env.example` lists the variables Phase 2
will introduce; until then no `.env` file is needed.

```bash
npm test        # run the solver test suite
npm run typecheck
npm run lint
npm run dev     # placeholder page only, until Phase 3
```

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
app/            Next.js App Router pages (placeholder until Phase 3)
lib/solver/     the solver -- pure TypeScript, no React, no database
validation/     Zod schemas guarding data that arrives as JSON
tests/solver/   solver tests and the fixture catalog
```

The one rule worth knowing before you touch anything: **`lib/solver` imports
nothing.** No React, no Next, no database, no Node APIs -- only relative
imports within itself. A lint rule enforces it. [ARCHITECTURE.md](ARCHITECTURE.md)
explains why.

## Contributing

New to pull requests? [CONTRIBUTING.md](CONTRIBUTING.md) walks through it from
the beginning.
