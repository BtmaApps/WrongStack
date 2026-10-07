import { Check } from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';

export function SddPage() {
  return (
    <>
      <PageHero
        index="18"
        eyebrow="SDD workflow"
        title={
          <>
            Spec first, <span className="text-brand">code second.</span>
          </>
        }
        description="Spec-Driven Development interviews you, generates a spec, plans tasks, and executes them — all through /sdd and its approve-driven phase flow. Each phase produces reviewable output before the next begins."
        aside={<ExternalDoc path="docs/slash/sdd.md">Open SDD docs</ExternalDoc>}
      />

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="01"
          eyebrow="Phases"
          title="Five phases, one /sdd command."
          description="Each phase advances through /sdd approve: questioning, spec review, implementation, task review, then executing. You review each phase's output before the next begins."
        />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-5">
          {[
            {
              step: '01',
              title: 'Questioning',
              body: 'The AI interviews you about the feature with contextual questions.',
            },
            {
              step: '02',
              title: 'Spec review',
              body: 'Approve the generated spec with /sdd approve; read it with /sdd spec.',
            },
            {
              step: '03',
              title: 'Implementation',
              body: 'Approving the spec moves here; the AI generates the implementation plan and tasks.',
            },
            {
              step: '04',
              title: 'Task review',
              body: 'Review the task breakdown, then approve to start execution.',
            },
            {
              step: '05',
              title: 'Executing',
              body: 'Tasks execute one by one; track with /sdd tasks and mark done with /sdd done <N>.',
            },
          ].map(({ step, title, body }) => (
            <article key={step} className="bg-card p-7">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-black text-brand-2">{step}</span>
              </div>
              <h2 className="mt-6 text-xl font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro index="02" eyebrow="Usage" title="Commands and options." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                cmd: '/sdd new "add OAuth switching"',
                desc: 'Start a new session. The AI interviews you, then generates the spec.',
              },
              {
                cmd: '/sdd approve',
                desc: 'Advance to the next phase: spec, tasks, then execution.',
              },
              {
                cmd: '/sdd tasks · /sdd done <N>',
                desc: 'Watch live task progress and mark tasks complete by number or fuzzy title.',
              },
              {
                cmd: '/sdd status',
                desc: 'Full session status: phase, spec preview, and task breakdown.',
              },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className="rounded-xl border border-line bg-card p-5">
                <code className="font-mono text-sm font-black text-brand">{cmd}</code>
                <p className="mt-2 text-xs leading-5 text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="03"
          eyebrow="SDD vs Goal"
          title="Interactive vs. autonomous — choose your control level."
          description="SDD uses explicit phase approvals so you can review and steer. Goal automates phased execution. Permission policy and recovery controls remain active in both."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-7">
            <h2 className="text-xl font-black text-fg">SDD</h2>
            <ul className="mt-4 space-y-2">
              {[
                'You review each phase before it runs',
                'Supports direct execution and optional parallel worktrees',
                'Phase state persists in the session',
                'Ideal for focused, single-concern tasks',
                'Can cancel or resume the active session',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted">
                  <Check className="mt-1 size-3.5 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-card p-7">
            <h2 className="text-xl font-black text-fg">Goal</h2>
            <ul className="mt-4 space-y-2">
              {[
                'Runs all phases without pausing',
                'Uses git worktrees for isolation',
                'Checkpoints enable rollback',
                'Best for complex, multi-day efforts',
                'Goal tracking across sessions',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted">
                  <Check className="mt-1 size-3.5 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <PageNext
        label="Goal"
        title="Let the agent drive across worktrees"
        body="Fully autonomous phased work with worktree isolation, checkpoints, and rollback."
        href="/goal"
      />
    </>
  );
}
