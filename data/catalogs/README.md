# School catalogs

Each folder here is one school: `data/catalogs/<school-id>/`. The demo catalog
lives in code (`lib/catalog/demo-school.ts`) and is fictional.

A real catalog goes through three steps. Nothing reaches a student until the last
one succeeds.

## 1. Extract a draft from the PDF

Put the PDF in `catalog-sources/` (PDFs there are git-ignored), then:

```bash
npm run catalog:extract -- catalog-sources/coursed.pdf --school my-school
```

This reads the text page by page and asks Gemini to record **only what the text
states** for each course — name, code, department, description, credits,
semester or full year, grades, prerequisites as named, notes — plus the exact
quote and page number. Anything not stated is `null`. It writes:

- `extracted.json` — the draft, every course with `source: { document, page, quote }`
- `REVIEW.md` — every course with missing fields, conflicts between pages, or
  prerequisite wording that isn't a list of courses
- `overrides.template.json` — a starting point for step 2

## 2. Review and fill in overrides.json

Copy the template to `overrides.json` and fill in what the catalog doesn't say:
the school's load (courses per semester), total credits, departments (and which
department names in the PDF map to each), graduation requirements, and per-course
facts such as `durationTerms`, `grades`, `seasons`, `sequence`, or
`equivalenceGroup`. Everything here is labelled `school-config` in the app, so a
student can tell it apart from catalog text. Check `REVIEW.md` item by item.

## 3. Build and load

```bash
npm run catalog:build -- my-school   # writes catalog.json, or lists what's missing
npm run catalog:validate             # checks every catalog (cycles, references…)
npm run db:seed                      # loads the demo + every built catalog
```

The build refuses a catalog with any missing required field, an unresolved
prerequisite, or a prerequisite cycle, and names each problem.
