'use client'

import { useState, useTransition } from 'react'
import { explainCourseAction, type ExplainerResult } from '@/app/actions/ai'

/** An AI-written guide to a course, drawn only from its catalog record. Cached server-side. */
export function CourseExplainer({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [result, setResult] = useState<ExplainerResult | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <section aria-labelledby="explainer-title" className="mt-8 rounded-2xl border border-signal-line/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="explainer-title" className="flex items-center gap-2 text-[15px] font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
          Compass AI on {courseName}
        </h2>
        {!result?.ok ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => startTransition(async () => setResult(await explainCourseAction(courseId)))}>
            {pending ? 'Reading the catalog…' : 'Explain this course'}
          </button>
        ) : null}
      </div>
      {result?.ok ? (
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
          <p>{result.explainer.summary}</p>
          {result.explainer.whatYouDo.length ? (
            <div>
              <p className="text-xs text-fog">What you’ll do</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-mist">
                {result.explainer.whatYouDo.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.explainer.goodFitIf.length ? (
            <div>
              <p className="text-xs text-fog">Students who tend to enjoy it</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-mist">
                {result.explainer.goodFitIf.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-fog">Written by Compass AI from the catalog record above. Prerequisites, credits, and availability come from the catalog, not the AI.</p>
        </div>
      ) : result && !result.ok ? (
        <p role="alert" className="mt-3 text-sm text-mist">
          {result.error}
        </p>
      ) : (
        <p className="mt-2 text-sm text-mist">A plain-language take on what this course is like, written only from its catalog record.</p>
      )}
    </section>
  )
}
