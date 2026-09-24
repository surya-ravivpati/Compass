'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useState, useTransition } from 'react'
import type { Activity, GoalId, GradeLevel, Placement, Preferences, Rigor, SchoolConfig } from '@/lib/engine'
import { academicYearLabel, graduationYear } from '@/lib/calendar'
import { GOALS, RIGOR_OPTIONS } from '@/lib/goals'
import {
  deleteAccountAction,
  rebuildPlanAction,
  savePreferencesAction,
  saveRecordAction,
  type SettingsResult,
} from '@/app/(app)/settings/actions'
import { ActivitiesEditor } from '@/components/onboarding/activities-editor'
import { CoursePicker, type PickedCourse } from '@/components/onboarding/course-picker'

function Note({ result }: { result: SettingsResult | null }) {
  if (!result) return null
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${result.ok ? 'text-ok' : 'text-danger'}`}>
      {result.ok ? result.message : result.error}
    </p>
  )
}

export function RecordForm({
  school,
  profile,
  history,
  defaultAcademicYear,
}: {
  school: SchoolConfig
  profile: { firstName: string; grade: GradeLevel; yearStarted: boolean; academicYear: number; mathPlacement: string; mathPlacementNote: string }
  history: Placement[]
  defaultAcademicYear: number
}) {
  const placementIds = new Set(school.mathPlacement.find((m) => m.id === profile.mathPlacement)?.completes ?? [])
  const [firstName, setFirstName] = useState(profile.firstName)
  const [grade, setGrade] = useState<GradeLevel>(profile.grade)
  const [yearStarted, setYearStarted] = useState(profile.yearStarted)
  const [academicYear, setAcademicYear] = useState(profile.academicYear)
  const [math, setMath] = useState(profile.mathPlacement)
  const [mathNote, setMathNote] = useState(profile.mathPlacementNote)
  const [preHighSchool, setPreHighSchool] = useState(history.filter((p) => p.term < 0 && !placementIds.has(p.courseId)).map((p) => p.courseId))
  const [completed, setCompleted] = useState<PickedCourse[]>(history.filter((p) => p.term >= 0 && p.status === 'completed').map((p) => ({ courseId: p.courseId, term: p.term })))
  const [inProgress, setInProgress] = useState<PickedCourse[]>(history.filter((p) => p.status === 'in-progress').map((p) => ({ courseId: p.courseId, term: p.term })))
  const [result, setResult] = useState<SettingsResult | null>(null)
  const [pending, startTransition] = useTransition()
  const languages = school.courses.filter((c) => c.sequence?.step === 1)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () =>
          setResult(
            await saveRecordAction({ firstName, grade, yearStarted, academicYear, mathPlacement: math, mathPlacementNote: mathNote || undefined, preHighSchool, completed, inProgress }),
          ),
        )
      }}
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-mist">
          First name
          <input className="field mt-1.5" value={firstName} maxLength={40} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
        </label>
        <label className="block text-sm text-mist">
          School year
          <select className="field mt-1.5" value={academicYear} onChange={(e) => setAcademicYear(Number(e.target.value))}>
            {[defaultAcademicYear - 1, defaultAcademicYear, defaultAcademicYear + 1].map((y) => (
              <option key={y} value={y}>
                {academicYearLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-mist">
          Grade
          <select className="field mt-1.5" value={grade} onChange={(e) => setGrade(Number(e.target.value) as GradeLevel)}>
            {[9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                {g}th grade
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-mist">
          Has that year started?
          <select className="field mt-1.5" value={yearStarted ? 'yes' : 'no'} onChange={(e) => setYearStarted(e.target.value === 'yes')}>
            <option value="no">Not yet</option>
            <option value="yes">Yes, I’m in it now</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-fog">Class of {graduationYear(grade, academicYear)}</p>

      <label className="block text-sm text-mist">
        Math finished before high school
        <select className="field mt-1.5" value={math} onChange={(e) => setMath(e.target.value)}>
          {school.mathPlacement.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value="other">Something else</option>
        </select>
      </label>
      {math === 'other' ? <input className="field" placeholder="What did you take?" value={mathNote} onChange={(e) => setMathNote(e.target.value)} aria-label="Math course you finished" /> : null}

      <fieldset>
        <legend className="text-sm text-mist">Other courses finished before high school</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {languages.map((c) => (
            <button key={c.id} type="button" aria-pressed={preHighSchool.includes(c.id)} onClick={() => setPreHighSchool((list) => (list.includes(c.id) ? list.filter((x) => x !== c.id) : [...list, c.id]))} className="chip h-8 text-[13px]">
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>

      {Array.from({ length: grade - 9 + (yearStarted ? 0 : 0) }, (_, i) => (9 + i) as GradeLevel).map((g) => (
        <div key={g}>
          <p className="mb-2 text-sm text-mist">Completed in {g}th grade</p>
          <CoursePicker
            courses={school.courses}
            grade={g}
            label={`${g}th grade`}
            value={completed.filter((c) => Math.floor(c.term / 2) === g - 9)}
            onChange={(list) => setCompleted([...completed.filter((c) => Math.floor(c.term / 2) !== g - 9), ...list])}
          />
        </div>
      ))}
      {yearStarted ? (
        <div>
          <p className="mb-2 text-sm text-mist">Taking now ({grade}th grade)</p>
          <CoursePicker courses={school.courses} grade={grade} label="this year" value={inProgress} onChange={setInProgress} />
        </div>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save record'}
        </button>
        <Note result={result} />
      </div>
    </form>
  )
}

export function PreferencesForm({ preferences, languages }: { preferences: Preferences; languages: { id: string; name: string }[] }) {
  const [goals, setGoals] = useState<GoalId[]>(preferences.goals)
  const [rigor, setRigor] = useState<Rigor>(preferences.rigor)
  const [balanceFirst, setBalanceFirst] = useState(preferences.balanceFirst)
  const [activities, setActivities] = useState<Activity[]>(preferences.activities)
  const [language, setLanguage] = useState(preferences.language ?? '')
  const [notes, setNotes] = useState(preferences.notes ?? '')
  const [result, setResult] = useState<SettingsResult | null>(null)
  const [pending, startTransition] = useTransition()
  const whatIf = `/what-if?kind=priorities&rigor=${rigor}&goals=${goals.join(',')}` as Route

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => setResult(await savePreferencesAction({ goals, rigor, balanceFirst, activities, language: language || undefined, notes: notes || undefined })))
      }}
      className="space-y-6"
    >
      <fieldset>
        <legend className="text-sm text-mist">Goals</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button key={g.id} type="button" aria-pressed={goals.includes(g.id)} onClick={() => setGoals((list) => (list.includes(g.id) ? list.filter((x) => x !== g.id) : [...list, g.id]))} className="chip h-8 text-[13px]">
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm text-mist">How challenging should your schedule feel?</legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Workload">
          {RIGOR_OPTIONS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={rigor === r.id} onClick={() => setRigor(r.id)} className="chip">
              {r.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" className="h-4 w-4 accent-[#2F8CFF]" checked={balanceFirst} onChange={(e) => setBalanceFirst(e.target.checked)} />
          I care more about balance than taking the hardest possible schedule.
        </label>
      </fieldset>
      {languages.length ? (
        <label className="block text-sm text-mist">
          Preferred world language (when you haven’t started one)
          <select className="field mt-1.5" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">No preference</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div>
        <p className="mb-2 text-sm text-mist">Commitments outside class</p>
        <ActivitiesEditor value={activities} onChange={setActivities} />
      </div>
      <label className="block text-sm text-mist">
        In your own words (used by Compass AI only)
        <textarea className="field mt-1.5 h-20 resize-none py-2" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : 'Save preferences'}
        </button>
        <Link href={whatIf} className="btn btn-ghost">
          Preview a plan with these priorities
        </Link>
      </div>
      <Note result={result} />
    </form>
  )
}

export function RebuildPlan() {
  const [result, setResult] = useState<SettingsResult | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div>
      <p className="text-sm text-mist">
        Re-plan every remaining semester from your saved record and preferences. It becomes a new version of your primary plan — the
        current version stays in its history.
      </p>
      <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await rebuildPlanAction()))} className="btn btn-ghost mt-3">
        {pending ? 'Rebuilding…' : 'Rebuild my plan'}
      </button>
      <Note result={result} />
    </div>
  )
}

export function DeleteAccount() {
  const [confirm, setConfirm] = useState('')
  const [result, setResult] = useState<SettingsResult | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div>
      <p className="text-sm text-mist">Permanently deletes your account, your record, and every plan and version. This can’t be undone.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="confirm-delete">
          Type DELETE to confirm
        </label>
        <input id="confirm-delete" className="field w-40" placeholder="Type DELETE" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button
          type="button"
          disabled={pending || confirm !== 'DELETE'}
          onClick={() => startTransition(async () => setResult(await deleteAccountAction(confirm)))}
          className="btn border border-danger/40 text-danger hover:bg-danger-soft"
        >
          Delete my account
        </button>
      </div>
      <Note result={result} />
    </div>
  )
}
