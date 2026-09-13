# Contributing

If you have never opened a pull request, this page is for you. Nothing here
assumes prior experience.

## Once, at the start

You need Node 22 or newer. `node --version` will tell you; if it says "command
not found", the README has install instructions.

```bash
git clone https://github.com/CIownPrinc/Morrow.git
cd Morrow
npm install
npm test
```

If the tests pass, you are set up correctly. If they do not, that is a bug in
the project, not in you -- open an issue.

## Making a change

**1. Start from a fresh branch.**

```bash
git checkout main
git pull
git checkout -b add-course-search
```

Name it after what you are doing. Never commit directly to `main`.

**2. Make the change.** Small is good. A pull request that does one thing gets
reviewed in minutes; one that does nine things sits for a week.

**3. Check your work.**

```bash
npm test
npm run typecheck
npm run lint
```

All three must pass. They are the same checks that run on every pull request,
so running them now saves a round trip.

**4. Commit.**

```bash
git add .
git commit -m "feat: add course search to the catalog rail"
```

Write the message as *what changed and why*, in the present tense. The prefix
says what kind of change it is:

| prefix | for |
|---|---|
| `feat:` | new behaviour |
| `fix:` | a bug |
| `test:` | tests only |
| `docs:` | documentation only |
| `refactor:` | restructuring with no behaviour change |
| `chore:` | tooling, dependencies, config |

If the *why* is not obvious from the diff, add a paragraph below the first line
explaining it. Future-you will be grateful.

**5. Push and open the pull request.**

```bash
git push -u origin add-course-search
```

GitHub prints a link. Follow it, describe what you did and why, and submit.

## What reviewers look for

- **Does it do what it says?** Scope creep is the most common reason a PR
  stalls.
- **Is there a test?** For anything in `lib/solver`, yes -- always.
- **Does it hold the architecture?** Mostly this means: solver logic goes in
  `lib/solver`, not in a component.

## Things that will get a change sent back

**Importing anything into `lib/solver`.** The solver is pure TypeScript and
imports nothing -- not React, not Next, not the database, not `node:fs`. A lint
rule enforces this and will fail your build. See
[ARCHITECTURE.md](ARCHITECTURE.md) for why it matters.

**Solver logic inside a React component.** If it decides whether something is
possible, it belongs in `lib/solver` where it can be tested without a browser.

**A warning with no explanation.** If Compass tells a student something is
blocked, it must say why, in words a fifteen-year-old can act on. "Dependency
constraint violated" is a bug. "AP Biology needs Chemistry first, and there is
no year left for both" is the product.

**Buttons that do not work.** No placeholder features that look finished. If
something is unfinished, leave it visibly disabled and mark it `TODO:`.

**A new dependency, added quietly.** The stack is fixed (see
[ARCHITECTURE.md](ARCHITECTURE.md)). If you genuinely need something new,
open an issue explaining the problem and why the current tools cannot solve it,
before writing the code.

## Where things live

```
app/            pages
lib/solver/     the solver -- pure functions, heavily tested
validation/     Zod schemas for data arriving as JSON
tests/solver/   solver tests and the fixture catalog
```

## Writing a solver test

Tests describe what a student would observe. Read a few in
`tests/solver/reachability.test.ts` before writing your own -- particularly the
"defining interaction" block, which is the clearest example of the style:

```ts
it("cascades downstream, not just to the immediate dependent", () => {
  const after = unreachable(planFor([at("precalculus", 12)]), graph);
  expect(after.map((f) => f.courseId)).toContain("ap-physics-c");
});
```

Name the test after the behaviour, not the function. `it("cascades
downstream")` tells a reader what breaks if it fails; `it("works correctly")`
does not.

## Stuck?

Open an issue, or push what you have as a draft pull request and ask. A
half-finished branch with a question attached is a completely normal thing to
share.
