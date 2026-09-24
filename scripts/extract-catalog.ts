/**
 * Step 1 of the catalog pipeline: read a course-catalog PDF into a draft.
 *
 *   npm run catalog:extract -- catalog-sources/coursed.pdf --school my-school
 *   npm run catalog:extract -- --school my-school --remerge
 *
 * Writes data/catalogs/<school>/raw.json (what the model read, page by page),
 * extracted.json and REVIEW.md, plus an overrides.template.json to fill in.
 * Needs GEMINI_API_KEY. --remerge rebuilds the draft from raw.json without
 * calling the model, after a change to the merge rules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { draftFromReading, extractPdfPages, readCatalog, type CatalogReading } from '../lib/ingest/extract.ts'
import type { CatalogOverrides } from '../lib/ingest/types.ts'

const args = process.argv.slice(2)
const remerge = args.includes('--remerge')
const school = args.indexOf('--school') >= 0 ? args[args.indexOf('--school') + 1] : undefined
const pdf = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--school')
if (!school || (!pdf && !remerge)) {
  console.error('Usage: npm run catalog:extract -- <catalog.pdf> --school <school-id>   (or --school <school-id> --remerge)')
  process.exit(1)
}

const out = path.join('data', 'catalogs', school)
const rawPath = path.join(out, 'raw.json')
let reading: CatalogReading
if (remerge) {
  if (!existsSync(rawPath)) {
    console.error(`${rawPath} doesn't exist yet. Run the extraction with the PDF first.`)
    process.exit(1)
  }
  reading = JSON.parse(readFileSync(rawPath, 'utf8')) as CatalogReading
  console.log(`Re-merging ${reading.raw.length} records read from ${reading.document} (no model calls).`)
} else {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Extraction reads the PDF with Gemini; add the key to .env.local.')
    process.exit(1)
  }
  mkdirSync(out, { recursive: true })
  const pages = await extractPdfPages(new Uint8Array(readFileSync(pdf!)))
  console.log(`Read ${pages.length} pages from ${pdf}.`)
  reading = await readCatalog(pages, path.basename(pdf!), {
    onProgress: (done, total) => process.stdout.write(`\rExtracting… ${done}/${total}`),
  })
  process.stdout.write('\n')
  writeFileSync(rawPath, JSON.stringify(reading, null, 1) + '\n')
}
const draft = draftFromReading(reading)
writeFileSync(path.join(out, 'extracted.json'), JSON.stringify(draft, null, 2) + '\n')

const flagged = draft.courses.filter((c) => c.flags.length)
const review = [
  `# Catalog review: ${draft.document}`,
  '',
  `${draft.courses.length} courses extracted from ${draft.pages} pages with ${draft.model} on ${draft.extractedAt}.`,
  `${flagged.length} need a look. Nothing here is loaded until \`npm run catalog:build -- ${school}\` succeeds.`,
  '',
  '## Graduation requirements stated in the PDF',
  '',
  ...(draft.requirements.length ? draft.requirements.map((r) => `- ${r.name}: ${r.credits ?? '?'} credits (page ${r.page}) — "${r.text}"`) : ['- None found. Enter them in overrides.json from the school’s official source.']),
  '',
  '## Courses to review',
  '',
  ...flagged.flatMap((c) => [`### ${c.name} (page ${c.source.page})`, ...c.flags.map((f) => `- ${f}`), '']),
].join('\n')
writeFileSync(path.join(out, 'REVIEW.md'), review + '\n')

const overridesPath = path.join(out, 'overrides.json')
if (!existsSync(overridesPath)) {
  const departments = [...new Set(draft.courses.map((c) => c.department).filter((d): d is string => !!d))]
  const template: CatalogOverrides = {
    school: { id: school, name: 'School name', load: { min: 6, max: 7 }, totalCredits: 0, preHighSchoolCredit: false },
    departments: departments.map((name, order) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, order, lane: false, match: [name] })),
    requirements: [],
    courses: {},
    policies: [],
    mathPlacement: [],
  }
  writeFileSync(path.join(out, 'overrides.template.json'), JSON.stringify(template, null, 2) + '\n')
  console.log(`Wrote ${path.join(out, 'overrides.template.json')}. Fill it in and save it as overrides.json.`)
}
console.log(`Wrote ${path.join(out, 'extracted.json')} and ${path.join(out, 'REVIEW.md')}: ${draft.courses.length} courses, ${flagged.length} to review.`)
