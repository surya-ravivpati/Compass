import type { Metadata } from 'next'
import { signOutAction } from '@/app/(auth)/actions'
import { currentAcademicYear } from '@/lib/calendar'
import type { GradeLevel } from '@/lib/engine'
import { loadWorkspace } from '@/lib/workspace'
import { DeleteAccount, PreferencesForm, RebuildPlan, RecordForm } from '@/components/settings/settings-forms'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const ws = await loadWorkspace()
  const s = ws.viewer.student
  const languages = ws.school.courses
    .filter((c) => c.sequence?.step === 1)
    .map((c) => ({ id: c.sequence!.id, name: c.name.replace(/\s+1$/, '') }))
  return (
    <main className="mx-auto max-w-[860px] px-5 py-8 md:px-8 md:py-10">
      <header>
        <p className="eyebrow">Profile, school, preferences</p>
        <h1 className="mt-2 text-[30px] font-semibold md:text-[36px]">Settings</h1>
      </header>

      <Section title="Your record" description={`What you’ve taken and where you are. School: ${ws.school.name}${ws.school.isDemo ? ' (demo catalog)' : ''}.`}>
        <RecordForm
          school={ws.school}
          history={ws.history}
          defaultAcademicYear={currentAcademicYear(new Date())}
          profile={{
            firstName: s.firstName ?? '',
            grade: (s.grade ?? 9) as GradeLevel,
            yearStarted: s.yearStarted,
            academicYear: s.academicYear ?? currentAcademicYear(new Date()),
            mathPlacement: s.mathPlacement ?? ws.school.mathPlacement[0]?.id ?? 'other',
            mathPlacementNote: s.mathPlacementNote ?? '',
          }}
        />
      </Section>

      <Section title="Preferences" description="Goals and workload shape what Compass suggests. They never override a requirement or a prerequisite.">
        <PreferencesForm preferences={s.preferences} languages={languages} />
      </Section>

      <Section title="Rebuild your plan" description="After changing your record or preferences.">
        <RebuildPlan />
      </Section>

      <Section title="Compass AI" description="How the assistant works and what it can see.">
        <p className="text-sm text-mist">
          Status: {ws.aiEnabled ? <span className="text-ok">On</span> : <span>Off — no Gemini API key is configured on this server</span>}.
        </p>
        <p className="mt-2 text-sm text-mist">
          Compass AI sees your plan, your record, your preferences, and your school’s catalog — nothing else. It runs on the
          server, and every academic fact it states comes from the Compass engine. It can preview changes; only you can apply
          them. Conversations aren’t saved.
        </p>
      </Section>

      <Section title="Account" description={ws.viewer.email}>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost">
            Sign out
          </button>
        </form>
        <div className="mt-6 border-t border-line pt-6">
          <DeleteAccount />
        </div>
      </Section>
    </main>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-line pt-8" aria-labelledby={`s-${title}`}>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <div>
          <h2 id={`s-${title}`} className="font-medium">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-fog">{description}</p> : null}
        </div>
        <div>{children}</div>
      </div>
    </section>
  )
}
