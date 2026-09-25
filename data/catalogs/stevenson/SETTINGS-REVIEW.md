# Stevenson settings — for review

`overrides.json` holds what the engine needs that isn't a course record: the
school's rules, and corrections to individual courses. Every requirement and
policy cites a page of `coursed.pdf` (the page numbers are PDF pages). Each
setting below is marked:

- **Stated**: the coursebook says it in those words.
- **Interpreted**: a judgment call Compass had to make. Please check these first.

After editing `overrides.json`, run `npm run catalog:build -- stevenson` and then
`npm run db:seed`.

## School

| Setting | Value | Source | |
|---|---|---|---|
| Total credits | 45 | p5 ("Total Credits 45") | Stated |
| Credit per semester course | 1 (full year = 2) | p5 ("semesters/credits") | Stated |
| Credit for work before high school | none | p9 | Stated |
| Course load | 6–7 a semester | p3, "Course Load" | **Interpreted.** Check the minimum and maximum. |
| Math placement options | Math 8, or Algebra 1 finished | p64–66 | **Interpreted.** There is no option yet for a student who finished Geometry before high school. |

## Graduation requirements

| Requirement | Credits | Page | |
|---|---|---|---|
| English | 8 | p5 | Stated |
| Mathematics, including Algebra 1 and a geometry course | 6 | p64 | Stated. Which courses have "geometry content" (Geometry, Geometry AB/BC) is **interpreted**. |
| Biological science | 2 | p6 | Stated |
| Physical science | 2 | p6 | Stated |
| U.S. History | 2 | p6 | Stated |
| World History and Geography | 2 | p6 | Stated |
| Government | 1 | p6 | Stated |
| Economics or Personal Finance | 1 | p6 | Stated |
| Health | 1 | p6 | Stated |
| Driver Education | 1 | p5 | Stated |
| Required electives (Applied Arts, Fine Arts, Multilingual Learning, CS/Engineering/Technology) | 2 | p6 | Stated |
| Additional credits and P.E. | 17 | p5 | Stated |

**Not modelled, because they aren't coursework:** the "46th Credit" exam (p7, taken
in Health), FAFSA or opt-out, and the school-day ACT (p119).

## Semester rules

| Rule | Enforcement | Page | |
|---|---|---|---|
| P.E. every semester. Health, Applied Health, Driver Education or Dance counts in its place. | target | p6, p86–88 | Stated. The waivers (athletics, marching band, senior academic) aren't modelled, so this is a **target** that warns, not a hard rule. |
| An English credit every semester | target | p27 ("should plan to") | Stated as advice, so it is a target. |
| Communication Arts electives count as English only in senior year | — | p27 | **Interpreted** from "Semester electives taken before senior year are considered elective credits". Applied to the journalism, creative writing, mythology, public speaking and composition electives, and to Publication Design. |

## Course corrections

- **Levels.** AP → AP. Honors/Accelerated → honors: the GPA table on p10 groups them. College-level math (Linear Algebra, Multivariable) → post-AP. Everything else → standard. **Interpreted:** Accelerated is treated as honors.
- **Repeatable courses** (25): only where the course text says "may be repeated for credit".
- **Equivalent courses** (taking both is a repeat): English 9 sections, English 11 sections, Geometry, Algebra 2, Precalculus, Calculus, U.S. History, Government, Personal Finance, Sociology, Earth Science, AP Psychology, AP Comparative Government, Political Thought, and Spanish 3 / Spanish 2-3, Spanish 4 / Spanish 3-4. **Interpreted** from matching course content.
- **Language sequences:** Spanish, French, German, Latin, Hebrew and Mandarin, in catalog order.
- **Prerequisites the extractor couldn't read** (56): written from the course wording. **Interpreted:**
  - "or approval of director/instructor" alternatives are shown as notes, not modelled.
  - "Any previous P.E. course" for Choice P.E. is limited to the foundational fitness courses, to avoid a loop.
  - "Engineering Design" is read as Introduction to Engineering Design.
- **Placed by the school** (the planner never adds them itself; a student can): ELD, the heritage language arts courses, auditioned ensembles, Alternative P.E. and its leadership course, and Dance Leadership.
- **Opt-in sections** (same rule): online and blended sections, American Studies (a double period), and all 26 Technology Campus programs. **Interpreted:** a Tech Campus program takes three periods but counts as one course in the load.
- **Expects background** (planned only for interested students): Concert Orchestra, Freshman Band, Stevenson Orchestra, AP Music Theory, Lifeguard Training.
- **Excluded** (support or scheduling entries, not courses a student plans): Academic Literacy 1/2, Guided Study, Guided Study Math, Mentor Math, Mentor Skills, Study Skills, the Early Bird entries.
- **Tags** (engineering, arts, medicine…) are Compass's own labels. They only rank suggestions.

## Not yet modelled

- The writing-intensive course rule. Only Sophomore English is marked.
- P.E. waivers, early graduation, and summer school.
- Workload: the coursebook doesn't give hours, so every workload is an estimate from the level and labelled as one.
