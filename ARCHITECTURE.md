# Architecture

## The shape of the thing

Compass is a constraint solver with a web interface attached. Almost all of the
interesting behaviour lives in one directory of pure functions, and the rest of
the application feeds it data and draws its output.

```
   student's plan  ->  /lib/solver  ->  findings
   (plain data)        (pure fns)       (plain data)
```

## The solver boundary

`/lib/solver` is pure TypeScript. It imports nothing -- no React, no Next, no
Supabase, no Drizzle, no Node built-ins, no browser APIs. Only relative imports
within itself.

This is enforced by a lint rule (`solver-purity/no-external-imports` in
`eslint.config.mjs`), written as an allow-list rather than a list of banned
packages, because a deny-list silently permits whatever nobody thought to name.

Three things follow from the boundary, and they are the reason for it:

- **It is deterministic.** The solver never reads the clock. "What grade is the
  student in" is an input (`Plan.currentGrade`), not something derived from
  `Date.now()` -- otherwise the same plan would solve differently depending on
  when you ran it, and the tests would rot every September.
- **It is testable in isolation.** No database to stand up, no component to
  render. The 130-odd solver tests run in about 150ms.
- **It runs anywhere.** The same code can re-solve on the client after a drag
  and on the server when a plan is saved, with no divergence between the two.

## The time model

The solver works in **term indices**, not grades or calendar years:

```
termIndex(grade, term) = (grade - 9) * 2 + (term - 1)

Grade  9 T1 = 0     Grade 11 T1 = 4
Grade  9 T2 = 1     Grade 11 T2 = 5
Grade 10 T1 = 2     Grade 12 T1 = 6
Grade 10 T2 = 3     Grade 12 T2 = 7
```

Every question the solver asks is interval arithmetic -- does this finish
before that starts, does this chain still fit before graduation -- and integers
are far easier to reason about, and to test, than `(grade, term)` pairs threaded
through every function. Calendar years exist only at the boundary, for display.

A course occupies `[start, start + durationTerms - 1]`. `durationTerms` is what
makes term-granular prerequisites honest: without it, a student could take
Algebra 2 in the fall and Precalculus in the spring of the same year and the
solver would call it legal, compressing a four-year chain into two.

## Solver invariants

These hold everywhere, and breaking one is a bug regardless of what the tests say:

1. **The solver imports nothing.** Enforced by lint.
2. **No clock, no randomness, no I/O.** Same input, same output, forever.
3. **Catalogs are acyclic.** `buildGraph` refuses a cyclic catalog rather than
   working around it; every reachability pass assumes termination.
4. **A cycle error names the cycle.** "Cycle detected" is useless against a
   hundred-course catalog.
5. **Every `unreachable` reason is readable by a fifteen-year-old.** It names
   real courses and real grades. If a student cannot act on it, it is a bug --
   the reason strings are asserted in tests for exactly this reason.
6. **`met` means completed.** Never planned. A green checkmark resting on a
   course the student merely pencilled in would be a lie the moment they moved it.

## How the cascade works

The defining interaction -- drag a course later, watch everything downstream
grey out -- is not special-cased anywhere. It falls out of one rule in
`earliestStarts`:

> A course the student has placed is **pinned** to where they placed it.

Everything else is the consequence. Moving Precalculus to grade 12 re-pins it;
AP Calculus AB's earliest start is computed from Precalculus's finish, so it
lands past graduation; AP Physics C needs AP Calculus AB, so it goes too. One
memoised pass over the catalog, and the whole branch collapses.

The catalog is small enough (~100 courses) that re-solving everything after
each drag is cheaper than working out what changed.

## Two findings, kept separate

| | meaning | what the student does |
|---|---|---|
| **violation** | a placed course whose prerequisites are not met at that slot | move it |
| **unreachable** | the course no longer fits anywhere in the time left | change the plan, or the goal |

Conflating them would be convenient and wrong. One is a mistake being made
right now; the other is an option that has closed.

## Why deadlines are goal-relative

`latestStartYear` takes the goal. Measured against the whole catalog the
question is close to meaningless: nearly every course has some deep dependent
chain somewhere, which would stamp a grade 9 deadline on courses the student
has no intention of taking.

Two refinements matter:

- Only **strictly required** prerequisites propagate a deadline. If a goal can
  be reached through either Chemistry or AP Chemistry, neither gets to impose a
  date on the other's behalf. (`necessaryCourses` takes the union across `and`
  and the *intersection* across `or`.)
- Where the timing is genuinely flexible -- AP Calculus AB may be taken
  alongside AP Physics C rather than before it -- the **most permissive**
  reading wins. Otherwise students chase a deadline that is not real.

## Data boundaries

Two kinds of table, and the distinction governs everything about how they are
secured.

**Reference tables** — `courses`, `course_prerequisites`, `pathways`,
`pathway_goal_courses`, `graduation_requirements`, `clubs`, `club_meetings`.
The school's catalog. Every signed-in student reads the same rows; nobody
writes them through the application. They are loaded by the seed script, which
connects with the service role.

**Student-owned tables** — `student_profiles`, `completed_courses`,
`plan_courses`, `plan_activities`. Each carries a `user_id`, and row-level
security confines every student to their own rows.

`db/schema.ts` classifies every table into one list or the other, and a test
fails if a new table appears in neither. That check exists because the likely
failure is not a wrong policy but a forgotten one — and under Supabase's
default grants, a table with no policy is world-writable.

### Which client touches what

| | connects as | reaches |
|---|---|---|
| Drizzle (`db/index.ts`) | `DATABASE_URL`, privileged | reference tables, migrations, seeding |
| Supabase (`lib/supabase/server.ts`) | the student's own access token | student-owned rows |

Student-owned rows are **never** read or written through Drizzle. They go
through Supabase carrying the student's token, so row-level security is
enforced by Postgres against a verified identity rather than by application
code remembering to add a `WHERE user_id = ...`. An ORM query that forgets its
filter is a data breach; a missing RLS policy is caught by the tests in
`tests/db`.

There is no service-role client in `lib/`. The service role bypasses RLS
entirely, and the only thing that legitimately needs it is the seed script.

### Secrets

`lib/env.ts` splits configuration in two. `publicEnv()` returns only
`NEXT_PUBLIC_*` values, which Next inlines into the browser bundle and which
are therefore public permanently. `serverEnv()` throws if it is ever reached
from a browser bundle, so a bad import fails at the first request instead of
quietly leaking the service role key.

### Sessions

The middleware refreshes the Supabase session on every matched request and
redirects unauthenticated visitors away from `/plan`, `/activities`,
`/settings`, and `/welcome`. It uses `getUser()` rather than `getSession()`:
`getSession` reads the cookie and trusts it, while `getUser` revalidates the
token with the auth server. Where the answer decides what data someone sees,
the cookie is not something to take at its word.

The post-login `next` parameter is passed through `safeNextPath`, which accepts
only same-origin paths. Without it, a link to our own login page could land a
student on someone else's site.

## Proving RLS works

`tests/db` holds two layers, because they fail in different ways.

`rls-policies.test.ts` reads the migration SQL and checks it statically: every
table classified, RLS enabled, privileges revoked, four separate policies per
student-owned table, `WITH CHECK` present on every UPDATE. It needs no
database, so it runs everywhere and catches the regression that is actually
likely — someone adding a table months from now and not writing its policies.

`rls.test.ts` is the real proof. It runs against a live Postgres as the
`authenticated` role with the same `request.jwt.claims` PostgREST sets from a
Supabase JWT, and shows that one student cannot read, update, delete, insert,
or take ownership of another's rows. Every negative assertion is paired with a
control showing the same query works for the rightful owner — otherwise the
suite would pass just as happily with a broken connection.

Set `TEST_DATABASE_URL` to run it. It is deliberately a different variable
from `DATABASE_URL`, because a test that creates and deletes users should not
find production by default.

## Testing strategy

Solver tests assert behaviour, not implementation: what a student would
observe, given a plan. Several assert the exact text of explanations, because
the wording *is* the feature -- a reason a student cannot parse is a bug, and
the only way to keep that honest is to pin the sentence.

The fixture catalog (`tests/solver/fixtures/`) is a realistic miniature: ~30
courses whose chains are long enough to genuinely run out of room inside four
years. That is deliberate. A fixture where everything fits would exercise none
of the logic that matters.

## Phases

| | | status |
|---|---|---|
| 1 | Solver | **done** |
| 2 | Drizzle schema, catalog seed, Supabase auth, RLS | **done** |
| 3 | UI primitives, planning grid, drag and drop | **done** |
| 4 | Goal selector, activities, status summary | not started |
| 5 | Landing page, polish, accessibility, deploy | not started |
