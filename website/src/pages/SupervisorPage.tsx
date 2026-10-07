import { Ban, BrainCircuit, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';

export function SupervisorPage() {
  return (
    <>
      <PageHero
        index="21"
        eyebrow="Fleet Supervisor"
        title={
          <>
            The Brain's <span className="text-brand">safety gate.</span>
          </>
        }
        description="The Fleet Supervisor is the brain-gated watcher of a running Director fleet. It monitors queue shape and worker activity and — through the tiered Brain (policy → LLM → human, /brain risk ceiling) — rebalances pending tasks off overloaded workers, spawns helpers on deep backlogs, steers stuck or repeatedly-failing workers, and keeps the leader informed."
        aside={<ExternalDoc path="docs/slash/supervisor.md">Open Supervisor docs</ExternalDoc>}
      />

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="01"
          eyebrow="How it works"
          title="Every fleet action passes through the gate."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: 'Approve',
              body: 'Safe actions pass through automatically. Routine spawns, reads, and single-file writes skip Brain evaluation entirely.',
              color: 'text-emerald-400',
            },
            {
              icon: ShieldAlert,
              title: 'Block',
              body: 'Risky actions are blocked with a reason. Multi-file mutations, external network calls, and permission changes require Brain approval.',
              color: 'text-amber-400',
            },
            {
              icon: Ban,
              title: 'Escalate',
              body: 'Critical actions escalate to interactive human approval. File deletion, policy changes, and production deploys always ask — regardless of YOLO mode.',
              color: 'text-red-400',
            },
          ].map(({ icon: Icon, title, body, color }) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-7">
              <Icon className={`size-5 ${color}`} />
              <h2 className="mt-8 text-xl font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="02"
            eyebrow="What it watches"
            title="Four engagement signals."
            description="Deterministic signals decide when to engage; every intervention is then gated by the Brain (/brain risk ceiling applies)."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-4">
            {[
              {
                label: 'Starvation',
                body: 'A pinned task waits longer than the configured starvation window before the Supervisor considers retargeting it.',
              },
              {
                label: 'Overload',
                body: 'A worker holding at least the overload threshold of pinned tasks has pending work rebalanced onto free workers.',
              },
              {
                label: 'Deep backlog',
                body: 'When pending work exceeds a multiple of the worker count, the Supervisor can spawn helpers (config fleet.supervisor.allowSpawn).',
              },
              {
                label: 'Stuck and failing workers',
                body: 'Workers silent past the stuck window or on a failure streak get steered — or terminated when config allows (fleet.supervisor.allowTerminate).',
              },
            ].map(({ label, body }) => (
              <div key={label} className="rounded-xl border border-line bg-card p-5">
                <BrainCircuit className="size-4 text-brand" />
                <h3 className="mt-3 font-black text-sm text-fg">{label}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="03"
          eyebrow="Risk levels"
          title="Four tiers — from automatic to mandatory human approval."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              level: 'Low',
              color: 'text-emerald-400',
              body: 'Routine spawns and reads. Automatically approved. No Brain involvement.',
            },
            {
              level: 'Medium',
              color: 'text-amber-400',
              body: 'Multi-file writes, worktree creation. Fast deterministic check, approved if under ceiling.',
            },
            {
              level: 'High',
              color: 'text-orange-400',
              body: 'Batch mutations, external network calls. Requires Brain model evaluation. May escalate to human.',
            },
            {
              level: 'Critical',
              color: 'text-red-400',
              body: 'Deletion of tracked files, permission policy changes. Always escalates to interactive human approval.',
            },
          ].map(({ level, color, body }) => (
            <div key={level} className="rounded-xl border border-line bg-card p-5">
              <span className={`font-mono text-xs font-black ${color}`}>{level}</span>
              <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro index="04" eyebrow="Commands" title="Status, enable, disable." />
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                cmd: '/supervisor status',
                desc: 'Show running state, config (interval, cooldown, signal thresholds, allowed actions) and the last engagement.',
              },
              {
                cmd: '/supervisor on',
                desc: 'Arm the supervision evaluation loop for this session.',
              },
              {
                cmd: '/supervisor off',
                desc: 'Disarm it — no further automatic interventions this session.',
              },
              {
                cmd: '/supervisor log [n]',
                desc: 'Show the last n supervision entries (default 10): signal → proposed action → outcome.',
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
        label="Goal"
        title="Autonomous phased workflows"
        body="Let the agent plan, execute, and verify across worktrees — fully autonomous."
        href="/goal"
      />
    </>
  );
}
