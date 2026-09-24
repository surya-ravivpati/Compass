'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Activity, GoalId, GradeLevel, Rigor, SchoolConfig } from '@/lib/engine'
import { academicYearLabel, graduationYear, startTermFor } from '@/lib/calendar'
import { GOALS, RIGOR_OPTIONS } from '@/lib/goals'
import { completeOnboarding, loadSchoolForOnboarding, type OnboardingResult } from '@/app/onboarding/actions'
import { suggestGoalsAction, type GoalSuggestion } from '@/app/actions/ai'
import { IconArrowLeft, IconArrowRight, IconCheck } from '@/components/ui/icons'
import { Logo } from '@/components/ui/logo'
import { ActivitiesEditor } from './activities-editor'
import { CoursePicker, type PickedCourse } from './course-picker'
import { Reveal } from './reveal'

interface SchoolOption {
  id: string
  name: string
  isDemo: boolean
}

interface Answers {
  firstName: string
  schoolId: string | null
  grade: GradeLevel | null
  yearStarted: boolean | null
  academicYear: number
  mathPlacement: string | null
  mathNote: string
  preHighSchool: string[]
  completed: PickedCourse[]
  inProgress: PickedCourse[]
  language: string | null
  goals: GoalId[]
  interests: string[]
  notes: string
  rigor: Rigor | null
  balanceFirst: boolean
  activities: Activity[]
}

type StepId = 'name' | 'school' | 'grade' | 'math' | 'early' | 'record' | 'language' | 'goals' | 'workload' | 'activities' | 'review'

export function OnboardingFlow({
  schools,
  defaultAcademicYear,
  aiEnabled,
}: {
  schools: SchoolOption[]
  defaultAcademicYear: number
  aiEnabled: boolean
}) {
  const [answers, setAnswers] = useState<Answers>({
    firstName: '',
    schoolId: schools.length === 1 ? schools[0]!.id : null,
    grade: null,
    yearStarted: null,
    academicYear: defaultAcademicYear,
    mathPlacement: null,
    mathNote: '',
    preHighSchool: [],
    completed: [],
    inProgress: [],
    language: null,
    goals: [],
    interests: [],
    notes: '',
    rigor: null,
    balanceFirst: false,
    activities: [],
  })
  const [school, setSchool] = useState<SchoolConfig | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<OnboardingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => setAnswers((a) => ({ ...a, [key]: value }))

  const startTerm = answers.grade && answers.yearStarted !== null ? startTermFor(answers.grade, answers.yearStarted) : 0
  const languages = useMemo(() => {
    if (!school) return []
    const seen = new Map<string, string>()
    for (const c of school.courses) {
      if (c.sequence?.step === 1 && !seen.has(c.sequence.id)) seen.set(c.sequence.id, c.name.replace(/\s+1$/, ''))
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name, firstCourse: `${id}-1` }))
  }, [school])
  const startedLanguage = useMemo(() => {
    if (!school) return false
    const ids = [...answers.preHighSchool, ...answers.completed.map((c) => c.courseId), ...answers.inProgress.map((c) => c.courseId)]
    return ids.some((id) => school.courses.find((c) => c.id === id)?.sequence)
  }, [school, answers.preHighSchool, answers.completed, answers.inProgress])

  const steps: StepId[] = [
    'name',
    'school',
    'grade',
    'math',
    'early',
    ...(startTerm > 0 ? (['record'] as const) : []),
    ...(!startedLanguage && languages.length > 0 ? (['language'] as const) : []),
    'goals',
    'workload',
    'activities',
    'review',
  ]
  const step = steps[Math.min(stepIndex, steps.length - 1)]!
  const canContinue = (() => {
    switch (step) {
      case 'school':
        return !!answers.schoolId && school?.id === answers.schoolId
      case 'grade':
        return !!answers.grade && answers.yearStarted !== null
      case 'math':
        return !!answers.mathPlacement && (answers.mathPlacement !== 'other' || answers.mathNote.trim().length > 1)
      case 'workload':
        return !!answers.rigor
      default:
        return true
    }
  })()

  const next = () => {
    if (step === 'school' && answers.schoolId && school?.id !== answers.schoolId) return
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }
  const back = () => setStepIndex((i) => Math.max(0, i - 1))

  const chooseSchool = (id: string) => set('schoolId', id)
  useEffect(() => {
    const id = answers.schoolId
    if (!id) return
    let cancelled = false
    loadSchoolForOnboarding(id).then((loaded) => {
      if (!cancelled) setSchool(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [answers.schoolId])

  const build = () => {
    if (!school || !answers.grade || answers.yearStarted === null || !answers.mathPlacement || !answers.rigor) return
    setError(null)
    startTransition(async () => {
      const res = await completeOnboarding({
        schoolId: school.id,
        firstName: answers.firstName.trim() || undefined,
        grade: answers.grade!,
        yearStarted: answers.yearStarted!,
        academicYear: answers.academicYear,
        mathPlacement: answers.mathPlacement!,
        mathPlacementNote: answers.mathNote.trim() || undefined,
        preHighSchool: answers.preHighSchool,
        completed: answers.completed,
        inProgress: answers.inProgress,
        goals: answers.goals,
        interests: answers.interests,
        notes: answers.notes.trim() || undefined,
        rigor: answers.rigor!,
        balanceFirst: answers.balanceFirst,
        activities: answers.activities,
        language: answers.language ?? undefined,
      })
      if (!res.ok) setError(res.error)
      else setResult(res)
    })
  }

  if (result?.ok && school) {
    return <Reveal school={school} result={result} firstName={answers.firstName.trim()} />
  }

  const progress = (stepIndex + 1) / steps.length
  const name = answers.firstName.trim()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[880px] items-center justify-between gap-6 px-5 pt-5 md:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="text-xs text-fog tabular">
            {stepIndex + 1} / {steps.length}
          </span>
          <div className="h-1 w-28 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1} aria-label="Onboarding progress">
            <div className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 flex-col px-5 pb-10 pt-12 md:px-8 md:pt-20">
        <div key={step} className="animate-rise">
          {step === 'name' && (
            <Step title="Hi — I’m Compass." lead="I’ll help you map all four years of high school around where you want to go. What should I call you?">
              <input
                className="field h-12 max-w-sm text-base"
                placeholder="First name (optional)"
                value={answers.firstName}
                maxLength={40}
                autoComplete="given-name"
                onChange={(e) => set('firstName', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && next()}
                aria-label="First name"
                autoFocus
              />
            </Step>
          )}

          {step === 'school' && (
            <Step title={`${name ? `Nice to meet you, ${name}. ` : ''}Which school do you attend?`} lead="Your school’s course catalog and graduation requirements are the source of truth for everything Compass plans.">
              <div className="grid gap-2" role="radiogroup" aria-label="School">
                {schools.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={answers.schoolId === s.id}
                    onClick={() => chooseSchool(s.id)}
                    className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                      answers.schoolId === s.id ? 'border-signal bg-signal-soft' : 'border-line-strong hover:border-white/25'
                    }`}
                  >
                    <span>
                      <span className="block font-medium">{s.name}</span>
                      {s.isDemo ? <span className="mt-0.5 block text-sm text-mist">Demo catalog — fictional development data, not a real school’s requirements.</span> : null}
                    </span>
                    {answers.schoolId === s.id ? <IconCheck className="text-signal" /> : null}
                  </button>
                ))}
              </div>
              {answers.schoolId && school?.id !== answers.schoolId ? <p className="mt-3 text-sm text-fog">Loading the catalog…</p> : null}
            </Step>
          )}

          {step === 'grade' && (
            <Step title="What grade are you in, or about to start?">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Grade">
                {([9, 10, 11, 12] as const).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={answers.grade === g} onClick={() => set('grade', g)} className="chip h-11 px-5 text-base">
                    {g}th grade
                  </button>
                ))}
              </div>
              {answers.grade ? (
                <div className="mt-8 animate-rise">
                  <p className="text-[17px]">Has {answers.grade}th grade already started?</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Has the school year started">
                    <button type="button" role="radio" aria-checked={answers.yearStarted === false} onClick={() => set('yearStarted', false)} className="chip">
                      Not yet — it’s ahead of me
                    </button>
                    <button type="button" role="radio" aria-checked={answers.yearStarted === true} onClick={() => set('yearStarted', true)} className="chip">
                      Yes, I’m in it now
                    </button>
                  </div>
                </div>
              ) : null}
              {answers.grade && answers.yearStarted !== null ? (
                <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-mist animate-rise">
                  <span>
                    Class of <span className="text-ink tabular">{graduationYear(answers.grade, answers.academicYear)}</span>
                  </span>
                  <span className="text-fog">·</span>
                  <label className="flex items-center gap-2">
                    School year
                    <select className="field h-8 w-auto py-0 text-sm" value={answers.academicYear} onChange={(e) => set('academicYear', Number(e.target.value))}>
                      {[defaultAcademicYear - 1, defaultAcademicYear, defaultAcademicYear + 1].map((y) => (
                        <option key={y} value={y}>
                          {academicYearLabel(y)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </Step>
          )}

          {step === 'math' && school && (
            <Step
              title="What math did you finish before high school?"
              lead="This one matters. Math placement sets your whole math pathway, and it’s different for everyone — Compass won’t make you repeat anything you’ve done."
            >
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Math completed before high school">
                {school.mathPlacement.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={answers.mathPlacement === m.id}
                    onClick={() => set('mathPlacement', m.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${answers.mathPlacement === m.id ? 'border-signal bg-signal-soft' : 'border-line-strong hover:border-white/25'}`}
                  >
                    <span className="block font-medium">{m.label}</span>
                    {m.description ? <span className="mt-0.5 block text-sm text-mist">{m.description}</span> : null}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={answers.mathPlacement === 'other'}
                  onClick={() => set('mathPlacement', 'other')}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${answers.mathPlacement === 'other' ? 'border-signal bg-signal-soft' : 'border-line-strong hover:border-white/25'}`}
                >
                  <span className="block font-medium">Something else</span>
                  <span className="mt-0.5 block text-sm text-mist">Tell us what you took</span>
                </button>
              </div>
              {answers.mathPlacement === 'other' ? (
                <div className="mt-4 animate-rise">
                  <input className="field" placeholder="For example: Integrated Math 1" value={answers.mathNote} onChange={(e) => set('mathNote', e.target.value)} aria-label="Math course you finished" autoFocus />
                  <p className="mt-2 text-sm text-fog">
                    Compass can’t match this to your school’s catalog yet, so it will start your pathway at the first course with no prerequisite. You can change it in Settings.
                  </p>
                </div>
              ) : null}
            </Step>
          )}

          {step === 'early' && school && (
            <Step title="Any other high-school courses before 9th grade?" lead="Some students start a world language in middle school. Pick anything you finished — or skip this.">
              <div className="flex flex-wrap gap-2">
                {languages.map((l) => (
                  <button
                    key={l.firstCourse}
                    type="button"
                    aria-pressed={answers.preHighSchool.includes(l.firstCourse)}
                    onClick={() =>
                      setAnswers((a) => ({
                        ...a,
                        preHighSchool: a.preHighSchool.includes(l.firstCourse)
                          ? a.preHighSchool.filter((x) => x !== l.firstCourse)
                          : [...a.preHighSchool, l.firstCourse],
                      }))
                    }
                    className="chip"
                  >
                    {school.courses.find((c) => c.id === l.firstCourse)?.name ?? l.name}
                  </button>
                ))}
              </div>
            </Step>
          )}

          {step === 'record' && school && answers.grade && (
            <Step title="What have you already taken?" lead="Add the courses behind you so Compass never schedules them again. You can refine this later in Settings.">
              <div className="space-y-8">
                {Array.from({ length: answers.grade - 9 }, (_, i) => (9 + i) as GradeLevel).map((g) => (
                  <div key={g}>
                    <p className="mb-2 text-sm font-medium">{g}th grade</p>
                    <CoursePicker
                      courses={school.courses}
                      grade={g}
                      label={`${g}th grade`}
                      value={answers.completed.filter((c) => Math.floor(c.term / 2) === g - 9)}
                      onChange={(list) => set('completed', [...answers.completed.filter((c) => Math.floor(c.term / 2) !== g - 9), ...list])}
                    />
                  </div>
                ))}
                {answers.yearStarted ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">This year ({answers.grade}th grade)</p>
                    <CoursePicker courses={school.courses} grade={answers.grade} label="this year" value={answers.inProgress} onChange={(list) => set('inProgress', list)} />
                  </div>
                ) : null}
              </div>
            </Step>
          )}

          {step === 'language' && school && (
            <Step title="Which world language would you like to study?" lead="Languages build year over year, so Compass keeps one going in consecutive years.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="World language">
                {languages.map((l) => (
                  <button key={l.id} type="button" role="radio" aria-checked={answers.language === l.id} onClick={() => set('language', l.id)} className="chip">
                    {l.name}
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={answers.language === null} onClick={() => set('language', null)} className="chip">
                  Not sure yet
                </button>
              </div>
              {answers.language === null ? (
                <p className="mt-3 text-sm text-fog">Compass will start with {languages[0]?.name}, the first language your school lists. You can switch any time.</p>
              ) : null}
            </Step>
          )}

          {step === 'goals' && (
            <Step title="What do you want from high school?" lead="Pick as many as fit. These shape which courses Compass suggests — they never override a requirement.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {GOALS.map((g) => {
                  const on = answers.goals.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, goals: a.goals.includes(g.id) ? a.goals.filter((x) => x !== g.id) : [...a.goals, g.id] }))
                      }
                      className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${on ? 'border-signal bg-signal-soft' : 'border-line-strong hover:border-white/25'}`}
                    >
                      <span className="block text-[14px] font-medium">{g.label}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-mist">{g.hint}</span>
                    </button>
                  )
                })}
              </div>
              <label className="mt-6 block">
                <span className="text-sm text-mist">Anything specific? A career, a skill, a subject you love. (Optional)</span>
                <textarea
                  className="field mt-2 h-24 resize-none py-2.5"
                  maxLength={500}
                  value={answers.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="I want to be an architect, and I really like drawing."
                />
              </label>
              {answers.notes.trim() ? (
                <p className="mt-2 text-sm text-fog">
                  {aiEnabled
                    ? 'Compass AI will use this to explain your plan and answer questions. Course choices come from the goals you pick.'
                    : 'Saved with your profile. Course choices come from the goals you picked above.'}
                </p>
              ) : null}
              {aiEnabled && answers.notes.trim().length > 2 && answers.schoolId ? (
                <GoalSuggestions
                  schoolId={answers.schoolId}
                  text={answers.notes}
                  onAccept={(goals, interests) =>
                    setAnswers((a) => ({
                      ...a,
                      goals: [...new Set([...a.goals, ...goals])],
                      interests: [...new Set([...a.interests, ...interests])],
                    }))
                  }
                />
              ) : null}
            </Step>
          )}

          {step === 'workload' && (
            <Step title="How challenging do you want your schedule to feel?">
              <div className="grid gap-2" role="radiogroup" aria-label="Workload">
                {RIGOR_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={answers.rigor === r.id}
                    onClick={() => set('rigor', r.id)}
                    className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${answers.rigor === r.id ? 'border-signal bg-signal-soft' : 'border-line-strong hover:border-white/25'}`}
                  >
                    <span>
                      <span className="block font-medium">{r.label}</span>
                      <span className="mt-0.5 block text-sm text-mist">{r.hint}</span>
                    </span>
                    {answers.rigor === r.id ? <IconCheck className="text-signal" /> : null}
                  </button>
                ))}
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#2F8CFF]" checked={answers.balanceFirst} onChange={(e) => set('balanceFirst', e.target.checked)} />
                <span>
                  <span className="block text-[15px]">I care more about balance than taking the hardest possible schedule.</span>
                  <span className="mt-0.5 block text-sm text-mist">Compass will spread heavier courses out where it can.</span>
                </span>
              </label>
            </Step>
          )}

          {step === 'activities' && (
            <Step title="Any big commitments outside class?" lead="Sports, clubs, a job. Compass uses these to point out heavy semesters — it won’t block anything your school allows.">
              <ActivitiesEditor value={answers.activities} onChange={(v) => set('activities', v)} />
            </Step>
          )}

          {step === 'review' && school && (
            <Step title="Here’s what Compass knows." lead="Compass will plan every semester from here to graduation, then check the whole plan before showing it to you.">
              <dl className="divide-y divide-line rounded-xl border border-line">
                <Row label="School" value={school.name} />
                <Row label="Grade" value={answers.grade ? `${answers.grade}th grade${answers.yearStarted ? ' (in progress)' : ' (starting)'} · Class of ${graduationYear(answers.grade, answers.academicYear)}` : '—'} />
                <Row
                  label="Math before high school"
                  value={answers.mathPlacement === 'other' ? `Something else: ${answers.mathNote}` : (school.mathPlacement.find((m) => m.id === answers.mathPlacement)?.label ?? '—')}
                />
                {answers.preHighSchool.length ? (
                  <Row label="Also finished" value={answers.preHighSchool.map((id) => school.courses.find((c) => c.id === id)?.name ?? id).join(', ')} />
                ) : null}
                {startTerm > 0 ? <Row label="Courses on record" value={`${answers.completed.length + answers.inProgress.length}`} /> : null}
                <Row label="Goals" value={answers.goals.length ? answers.goals.map((g) => GOALS.find((x) => x.id === g)?.label).join(', ') : 'None picked'} />
                <Row label="Workload" value={`${RIGOR_OPTIONS.find((r) => r.id === answers.rigor)?.label ?? '—'}${answers.balanceFirst ? ' · balance first' : ''}`} />
                <Row label="Commitments" value={answers.activities.length ? answers.activities.map((a) => a.name).join(', ') : 'None'} />
              </dl>
              {error ? (
                <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </Step>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-12">
          <button type="button" onClick={back} disabled={stepIndex === 0 || pending} className="btn btn-quiet">
            <IconArrowLeft /> Back
          </button>
          {step === 'review' ? (
            <button type="button" onClick={build} disabled={pending || !school} className="btn btn-signal h-11 px-6 text-[15px]">
              {pending ? 'Mapping your path…' : 'Build my plan'}
              {!pending ? <IconArrowRight /> : null}
            </button>
          ) : (
            <button type="button" onClick={next} disabled={!canContinue} className="btn btn-primary h-11 px-6 text-[15px]">
              {step === 'name' && !answers.firstName.trim() ? 'Skip' : 'Continue'}
              <IconArrowRight />
            </button>
          )}
        </div>
      </main>
    </div>
  )
}

function Step({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="step-title">
      <h1 id="step-title" className="text-[26px] font-semibold leading-tight md:text-[32px]">
        {title}
      </h1>
      {lead ? <p className="mt-3 max-w-[560px] text-[16px] leading-relaxed text-mist">{lead}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-4 px-4 py-3 text-sm">
      <dt className="text-mist">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}


/** Compass AI reads the student's own words and suggests goals; the student decides. */
function GoalSuggestions({
  schoolId,
  text,
  onAccept,
}: {
  schoolId: string
  text: string
  onAccept: (goals: GoalId[], interests: string[]) => void
}) {
  const [result, setResult] = useState<GoalSuggestion | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [pending, startTransition] = useTransition()
  if (accepted) return <p className="mt-3 text-sm text-ok">Added. You can adjust the goals above.</p>
  return (
    <div className="mt-3 rounded-xl border border-signal-line/60 p-3.5">
      {result?.ok ? (
        result.goals.length || result.interests.length ? (
          <div>
            <p className="text-sm">
              Compass AI suggests:{' '}
              <span className="text-mist">
                {[...result.goals.map((g) => GOALS.find((x) => x.id === g)?.label ?? g), ...result.interests.map((i) => i.replace(/-/g, ' '))].join(', ')}
              </span>
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn btn-signal btn-sm" onClick={() => { onAccept(result.goals, result.interests); setAccepted(true) }}>
                Add these
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setResult(null)}>
                No thanks
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mist">Compass AI didn’t find goals it could map from that. Pick from the list above.</p>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-mist">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" /> Let Compass AI suggest goals from what you wrote?
          </p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => startTransition(async () => setResult(await suggestGoalsAction({ schoolId, text })))}>
            {pending ? 'Reading…' : 'Suggest goals'}
          </button>
          {result && !result.ok ? <p className="w-full text-sm text-mist">{result.error}</p> : null}
        </div>
      )}
    </div>
  )
}
