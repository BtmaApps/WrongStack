import { ArrowRight, Bot, Cable, Network, Wrench } from 'lucide-react';
import { PageHero, PageNext, SectionIntro, heroTitleFontSize } from '@/components/site/primitives';
import {
  agentFromSlug,
  rosterBudgetGuidance,
  rosterIndex,
  rosterPhases,
} from '@/data/product-catalog';
import { Link, useRouter } from '@/lib/router';

const kindEyebrow = {
  phase: 'Phase role',
  operational: 'Operational role',
  acp: 'External ACP agent',
} as const;

export function AgentDetailPage() {
  const { path } = useRouter();
  const pathParts = path.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1] ?? '';
  const agent = agentFromSlug(slug);
  if (!agent) return null;
  const position = rosterIndex.findIndex((item) => item.role === agent.role) + 1;
  const phase = rosterPhases.find((item) => item.id === agent.phaseId);
  const related = rosterIndex
    .filter((item) =>
      agent.kind === 'phase' ? item.phaseId === agent.phaseId : item.kind === agent.kind,
    )
    .filter((item) => item.role !== agent.role)
    .slice(0, 5);

  return (
    <>
      <PageHero
        index={`18.${String(position).padStart(2, '0')}`}
        eyebrow={agent.phaseLabel ? `${agent.phaseLabel} phase` : kindEyebrow[agent.kind]}
        title={<span className="text-brand">{agent.name}</span>}
        titleFontSize={heroTitleFontSize(agent.name)}
        description={agent.summary}
        aside={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
              {agent.role}
            </span>
            {agent.budget && (
              <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
                {agent.budget} budget
              </span>
            )}
            {typeof agent.tools === 'number' && (
              <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
                {agent.tools} tools
              </span>
            )}
          </div>
        }
      />

      <section className="site-section site-section--compact site-container">
        <SectionIntro
          index="01"
          eyebrow="Role in the fleet"
          title={`What the Director expects from ${agent.name}.`}
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.72fr]">
          <article className="rounded-2xl border border-line bg-card p-6 sm:p-8">
            {agent.kind === 'acp' ? (
              <Cable className="size-5 text-brand" />
            ) : (
              <Bot className="size-5 text-brand" />
            )}
            <h2 className="mt-8 text-2xl font-black tracking-[-0.04em] text-fg">Assignment</h2>
            <p className="mt-4 text-base leading-8 text-muted">{agent.summary}</p>
            {agent.kind === 'phase' && phase && (
              <p className="mt-4 text-sm leading-7 text-muted">
                <strong className="text-fg">{phase.label} phase:</strong> {phase.purpose} The
                Director dispatches {agent.name} when this phase needs its specialty, alongside{' '}
                {phase.agents.length - 1} sibling roles.
              </p>
            )}
            {agent.kind === 'operational' && (
              <p className="mt-4 text-sm leading-7 text-muted">
                Operational roles sit outside the nine lifecycle phases. They are summoned directly
                by the runtime rather than scheduled as phase work.
              </p>
            )}
            {agent.kind === 'acp' && (
              <p className="mt-4 text-sm leading-7 text-muted">
                External agents join the roster over the Agent Client Protocol. WrongStack drives
                the agent as a subagent through{' '}
                <code className="font-mono text-brand">{agent.runtime}</code> while keeping
                permissions and transcripts on the host side.
              </p>
            )}
            <Link
              href={agent.kind === 'acp' ? '/commands/delegate' : '/commands/spawn'}
              className="group mt-6 inline-flex items-center gap-2 text-sm font-black text-brand"
            >
              {agent.kind === 'acp' ? 'Learn the /delegate command' : 'Learn the /spawn command'}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </article>
          <aside className="space-y-6">
            {agent.budget && (
              <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Network className="size-4 text-brand" />
                  <h2 className="text-lg font-black text-fg">Budget class</h2>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">
                  <code className="font-mono text-xs text-brand">{agent.budget}</code> —{' '}
                  {rosterBudgetGuidance[agent.budget]}
                </p>
              </div>
            )}
            {typeof agent.tools === 'number' && (
              <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Wrench className="size-4 text-brand" />
                  <h2 className="text-lg font-black text-fg">Tool surface</h2>
                </div>
                <p className="mt-4 text-sm leading-6 text-muted">
                  Runs with a scoped allowlist of {agent.tools} tools — enough for its specialty,
                  nothing that widens its blast radius.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-brand/20 bg-brand/5 p-6 sm:p-8">
              <h2 className="text-lg font-black text-fg">Invocation</h2>
              <p className="mt-4 text-sm leading-6 text-muted">
                Explicitly via{' '}
                <code className="font-mono text-xs text-brand">/spawn {agent.role}</code> or
                automatically when the Director schedules the{' '}
                {agent.phaseLabel?.toLowerCase() ?? 'matching'} work.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="site-container py-20">
            <h2 className="text-2xl font-black tracking-[-0.04em] text-fg">
              {agent.kind === 'phase' && agent.phaseLabel
                ? `More ${agent.phaseLabel.toLowerCase()} roles`
                : 'Related roster entries'}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.role}
                  href={`/agent-roster/${item.role}`}
                  className="group rounded-2xl border border-line bg-card p-6 hover:border-brand"
                >
                  <h3 className="text-lg font-black text-fg">{item.name}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{item.summary}</p>
                  <ArrowRight className="mt-6 size-4 text-faint transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <PageNext
        label="Agent roster"
        title="Browse the complete roster"
        body="Fifty phase roles across nine lifecycle phases, the Shadow operational role and five optional ACP agents."
        href="/agent-roster"
      />
    </>
  );
}
