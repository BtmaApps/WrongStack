import { Activity, AlertTriangle, Archive, Bell, Eye, Shield, Zap } from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';

export function ShadowAgentPage() {
  return (
    <>
      <PageHero
        index="19"
        eyebrow="Shadow Agent"
        title={
          <>
            Watch every agent <span className="text-brand">without getting in the way.</span>
          </>
        }
        description="The Shadow Agent is a one-shot fleet monitor. It runs on explicit request or when the host observes problematic work — it checks agent status, mailbox flow and spike tasks, can intervene on command, and stays silent unless something is wrong."
        aside={<ExternalDoc path="docs/slash/shadow.md">Open Shadow Agent docs</ExternalDoc>}
      />

      {/* ── Responsibilities ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="01"
          eyebrow="Responsibilities"
          title="Four lanes of silent observation."
          description="Each check run is deterministic first — LLM analysis only for complex cases. The Shadow never posts routine healthy reports."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {[
            {
              icon: Activity,
              title: 'Heartbeat monitoring',
              body: 'Calls `fleet status` and `fleet health` on every tick. Agents unresponsive for 5 minutes (configurable) are flagged as stuck. New agents are logged; missing agents marked unknown.',
            },
            {
              icon: Zap,
              title: 'Spike detection',
              body: 'Tracks subagent spawn→terminate durations. Tasks completing in under 5 seconds (configurable) are flagged as spikes — often indicating configuration errors or permission problems.',
            },
            {
              icon: Bell,
              title: 'Mailbox surveillance',
              body: 'Monitors all mailbox messages — direct, broadcast, and typed. Flags orphan tasks (assign without result within 5 min) and stale asks. Tracks cross-session communication patterns.',
            },
            {
              icon: AlertTriangle,
              title: 'Anomaly classification',
              body: 'Spike tasks, mailbox loops, stuck agents and budget exhaustion are the watch categories. Deterministic host rules decide first; the LLM is engaged only for complex cases.',
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

      {/* ── Intervention ────────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="02"
            eyebrow="Intervention"
            title="Hoop commands let you act on anomalies."
            description="The Shadow can intervene on command. /shadow hoop stops a target agent immediately and sends a notification; every intervention is logged."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-card p-7">
              <Shield className="size-5 text-brand" />
              <h2 className="mt-8 text-xl font-black text-fg">Intervention commands</h2>
              <div className="mt-5 space-y-3">
                {[
                  {
                    cmd: '/shadow hoop <agent-id> [--reason=<text>]',
                    desc: 'Stop the target agent immediately and send a notification. The Shadow logs the intervention with the reason.',
                  },
                  {
                    cmd: '/shadow model <provider/model>',
                    desc: 'Change the model used for Shadow Agent analysis. Defaults to the current leader provider/model.',
                  },
                  {
                    cmd: '/shadow start --model=<provider/model>',
                    desc: 'Run one quiet fleet check with a specific analysis model. Only one Shadow Agent is allowed per session.',
                  },
                ].map(({ cmd, desc }) => (
                  <div key={cmd} className="rounded-lg border border-line bg-bg p-4">
                    <code className="font-mono text-sm font-black text-brand">{cmd}</code>
                    <p className="mt-1.5 text-xs leading-5 text-muted">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-card p-7">
              <Archive className="size-5 text-brand" />
              <h2 className="mt-8 text-xl font-black text-fg">Intervention log</h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                Every intervention — whether triggered by command or auto-intervene policy — is
                logged with timestamp, target agent, command issued, and result. The log persists
                across Shadow restarts.
              </p>
              <div className="mt-5 rounded-lg border border-line bg-bg p-4 font-mono text-xs leading-6">
                <div className="text-zinc-400">
                  10:23:01 <span className="text-brand">hoop</span> → subagent-xyz{' '}
                  <span className="text-emerald-400">terminated</span>
                </div>
                <div className="text-zinc-400">
                  10:25:33 <span className="text-brand">hoop</span> → all{' '}
                  <span className="text-emerald-400">3 agents terminated</span>
                </div>
                <div className="text-zinc-400">
                  10:30:15 <span className="text-brand">auto-intervene</span> →
                  budget-exhausted-agent <span className="text-emerald-400">terminated</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Commands ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro index="03" eyebrow="Commands" title="Start, inspect, stop, configure." />
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              cmd: '/shadow start [--model=provider/model]',
              desc: 'Run one quiet Shadow Agent fleet check. Only one instance is allowed per session; a running Shadow is reported with its id.',
            },
            {
              cmd: '/shadow status',
              desc: 'Show all running agents and their current tasks across the fleet.',
            },
            {
              cmd: '/shadow stop',
              desc: 'Stop the Shadow Agent.',
            },
            {
              cmd: '/shadow hoop <agent-id>',
              desc: 'Stop the target agent immediately and send a notification. Add --reason=<text> to record why.',
            },
            {
              cmd: '/shadow model <provider/model>',
              desc: 'Change the Shadow Agent analysis model. Model refs are provider/model.',
            },
            {
              cmd: '/shadow interval <ms>',
              desc: 'Change the legacy interval default kept for compatibility. Minimum 5 000 ms.',
            },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="rounded-xl border border-line bg-card p-5">
              <code className="font-mono text-sm font-black text-brand">{cmd}</code>
              <p className="mt-2 text-xs leading-5 text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Configuration ────────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="04"
            eyebrow="Configuration"
            title="Tune the Shadow to your fleet size and risk tolerance."
            description="Six configuration keys control the Shadow's behavior. All can be changed at runtime — the next heartbeat picks up new values."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: Activity,
                label: 'Interval',
                cmd: '/shadow interval <ms>',
                body: 'Legacy interval default kept for compatibility. Default 30 000 ms (30s), minimum 5 000 ms.',
              },
              {
                icon: AlertTriangle,
                label: 'Stuck and spike detection',
                cmd: 'host rules',
                body: 'Deterministic host rules flag stuck agents and spike tasks (start/stop almost instantly) before any LLM analysis runs.',
              },
              {
                icon: Zap,
                label: 'Spike threshold',
                cmd: 'host rules',
                body: 'Tasks that start and stop instantly are treated as spikes — often configuration errors or permission problems worth attention.',
              },
              {
                icon: Shield,
                label: 'Auto-intervene',
                body: 'Intervention is explicit: /shadow hoop stops a chosen agent with a logged reason. The Shadow itself never silently terminates fleet agents.',
              },
              {
                icon: Eye,
                label: 'Model',
                cmd: '/shadow model <provider/model>',
                body: 'The analysis model. Defaults to the session leader provider/model; a lighter model can be selected for analysis.',
              },
              {
                icon: Archive,
                label: 'State persistence',
                cmd: 'ShadowState',
                body: 'Shadow observations and interventions are logged. One Shadow Agent instance per session is enforced.',
              },
            ].map(({ icon: Icon, label, cmd, body }) => (
              <div key={label} className="rounded-xl border border-line bg-card p-5">
                <Icon className="size-4 text-brand" />
                <h3 className="mt-3 font-black text-sm text-fg">{label}</h3>
                <code className="mt-1.5 block font-mono text-xs text-brand">{cmd}</code>
                <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PageNext
        label="ACP"
        title="Drive external coding agents from WrongStack"
        body="Discover and run Claude Code, Codex CLI, Gemini CLI and more using their existing logins."
        href="/acp"
      />
    </>
  );
}
