import { CheckCircle, GitBranch, Play, RotateCcw, Target, Timer } from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';

export function GoalPage() {
  return (
    <>
      <PageHero
        index="22"
        eyebrow="Goal"
        title={
          <>
            Full autonomy <span className="text-brand">across worktrees.</span>
          </>
        }
        description="Goal combines a durable mission with autonomous phased runs. My Goals tracks project runs by goal id and session, with task/phase progress, blockers and verification. Git-backed goals run in their own checkouts and retain branches for review before integration."
        aside={
          <ExternalDoc path="docs/architecture/project-goals.md">
            Open project goal guide
          </ExternalDoc>
        }
      />

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="01"
          eyebrow="Architecture"
          title="Worktree isolation and durable run state."
          description="New git-backed goals own a managed checkout and branch. Phase worktrees integrate into that goal branch, which remains available for review before project integration."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {[
            {
              icon: GitBranch,
              title: 'Checkout per goal',
              body: 'Each new git-backed goal gets its own branch and checkout. Phase worktrees integrate there; another terminal can run a different goal without switching the project branch.',
            },
            {
              icon: RotateCcw,
              title: 'Durable progress',
              body: 'Task and phase transitions are persisted so interrupted runs can resume without treating completed work as new.',
            },
            {
              icon: Play,
              title: 'Autonomous execution',
              body: 'Set a goal, define phases, and let Goal run. Plans, implements, tests, and reports without interactive steering.',
            },
            {
              icon: Target,
              title: 'Goal tracking',
              body: 'My Goals and /goals separate task progress, phase status, blockers and final verification. A goal with no tasks shows unknown progress; observing another owner does not grant control.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-line bg-card p-6">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-4 text-lg font-black text-fg">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="02"
            eyebrow="Phase lifecycle"
            title="A planned lifecycle with explicit gates."
            description="The planner creates goal-specific phases and tasks. Execution, verification, and worktree integration then advance from persisted state."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
            {[
              [
                '01',
                'Plan',
                'The agent reads the goal and produces a structured task breakdown with file targets, dependency order, and estimated risk per step.',
              ],
              [
                '02',
                'Implement',
                'Each planned step executes in its own worktree. Code is written, files created, refactors run — fully autonomous.',
              ],
              [
                '03',
                'Test',
                'When verification is enabled, configured checks run against the phase worktree. Failures trigger a bounded repair-and-reverify loop.',
              ],
              [
                '04',
                'Review',
                'A final review pass checks the diff for anti-patterns, security issues, and style violations. Results written to the phase journal.',
              ],
            ].map(([step, title, body]) => (
              <article key={step} className="bg-card p-7">
                <span className="font-mono text-xs font-black text-brand-2">{step}</span>
                <h2 className="mt-8 text-xl font-black text-fg">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="03"
          eyebrow="Recovery"
          title="Three layers of safety for autonomous runs."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: RotateCcw,
              title: 'Durable task state',
              body: 'Task and phase transitions are saved throughout execution, including stopped and failed runs.',
            },
            {
              icon: Timer,
              title: 'Automatic retry',
              body: 'Task failures receive bounded retries; verification failures receive bounded repair attempts before the phase fails closed.',
            },
            {
              icon: CheckCircle,
              title: 'Manual intervention',
              body: 'Pause stops admitting new tasks while active work settles. Stop fences late verification results; a stopped final gate can resume without replaying completed tasks.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-7">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-8 text-xl font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="04"
            eyebrow="Commands"
            title="Start, pause, resume, status."
            description="Executable phase runs use the project catalog. The persistent goal.json mission used by eternal/parallel autonomy remains a separate workflow."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                cmd: '/goals',
                desc: 'List project runs, owners, blockers, progress and verification.',
              },
              {
                cmd: '/goal start "refactor auth"',
                desc: 'Plan executable phases and begin an autonomous run.',
              },
              {
                cmd: '/goal status <id>',
                desc: 'Inspect one project goal without taking over its owning terminal.',
              },
              {
                cmd: '/goal pause',
                desc: 'Pause new task admission in the owning terminal. Resume with /goal resume.',
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

      <PageNext
        label="Ensemble"
        title="Parallel multi-agent reviews"
        body="Fan one task to multiple ACP agents for independent perspectives."
        href="/ensemble"
      />
    </>
  );
}
