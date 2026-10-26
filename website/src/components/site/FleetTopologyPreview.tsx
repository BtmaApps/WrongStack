import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowUpRight,
  Bot,
  Boxes,
  BrainCircuit,
  Cpu,
  Mail,
  Monitor,
  PanelTop,
  Radio,
  Sparkles,
  Terminal,
  Users,
} from 'lucide-react';
import { Link } from '@/lib/router';
import { cn } from '@/lib/utils';

type NodeTone = 'cyan' | 'green' | 'amber' | 'neutral';

const toneStyles: Record<NodeTone, { frame: string; icon: string; dot: string }> = {
  cyan: {
    frame: 'border-cyan-400/45 shadow-[0_18px_55px_-35px_rgba(34,211,238,.8)]',
    icon: 'bg-cyan-400/10 text-cyan-300',
    dot: 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]',
  },
  green: {
    frame: 'border-emerald-400/35 shadow-[0_18px_55px_-35px_rgba(52,211,153,.75)]',
    icon: 'bg-emerald-400/10 text-emerald-300',
    dot: 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]',
  },
  amber: {
    frame: 'border-brand-2/40 shadow-[0_18px_55px_-35px_rgba(253,159,2,.8)]',
    icon: 'bg-brand-2/10 text-brand-2',
    dot: 'bg-brand-2 shadow-[0_0_12px_rgba(253,159,2,.9)]',
  },
  neutral: {
    frame: 'border-white/15',
    icon: 'bg-white/[.055] text-zinc-300',
    dot: 'bg-zinc-400',
  },
};

function TopologyNode({
  className,
  tone,
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  metrics,
}: {
  className?: string;
  tone: NodeTone;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: Array<[string, string]>;
}) {
  const toneStyle = toneStyles[tone];

  return (
    <div
      className={cn(
        'topology-node absolute z-20 w-[210px] rounded-2xl border site-terminal bg-[#181b24]/95 p-4 text-zinc-100 backdrop-blur-xl',
        toneStyle.frame,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', toneStyle.icon)}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-terminal-muted">
            {eyebrow}
          </div>
          <div className="mt-1 truncate text-sm font-black tracking-[-0.02em]">{title}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-terminal-muted">{subtitle}</div>
        </div>
        <span className={cn('topology-pulse mt-1 size-2 rounded-full', toneStyle.dot)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[.07] bg-white/[.07]">
        {metrics.map(([label, value]) => (
          <div key={label} className="site-terminal bg-[#141720] px-2.5 py-2">
            <div className="font-mono text-xs font-bold text-zinc-300">{value}</div>
            <div className="mt-0.5 text-[8px] uppercase tracking-wider text-terminal-muted">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileFlow() {
  const nodes = [
    [Cpu, 'Fleet HQ', 'coordinates 3 live surfaces', 'cyan'],
    [Mail, 'Mailbox hub', 'routes status, tasks and results', 'amber'],
    [Terminal, 'CLI · TUI · WebUI', 'share the same project state', 'green'],
    [Bot, 'Specialist agents', 'return structured evidence', 'cyan'],
  ] as const;

  return (
    <div className="relative space-y-3 px-4 py-5 md:hidden">
      {nodes.map(([Icon, title, body, tone], index) => (
        <div key={title}>
          <div
            className={cn(
              'relative z-10 flex items-center gap-3 rounded-xl border site-terminal bg-[#181b24]/95 p-3.5',
              toneStyles[tone].frame,
            )}
          >
            <span
              className={cn('grid size-9 place-items-center rounded-lg', toneStyles[tone].icon)}
            >
              <Icon className="size-4" />
            </span>
            <div>
              <div className="text-sm font-black text-zinc-100">{title}</div>
              <div className="mt-0.5 text-xs text-terminal-muted">{body}</div>
            </div>
            <span className={cn('ml-auto size-2 rounded-full', toneStyles[tone].dot)} />
          </div>
          {index < nodes.length - 1 && (
            <div className="mx-auto h-3 w-px border-l border-dashed border-emerald-400/60" />
          )}
        </div>
      ))}
    </div>
  );
}

export function FleetTopologyPreview() {
  return (
    <section className="site-section site-section--demo border-b border-line bg-surface">
      <div className="site-container">
        <div className="mb-9 grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <div className="font-mono text-xs font-black uppercase tracking-[0.2em] text-brand">
              Live fleet topology
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl font-black leading-[1.06] tracking-[-0.025em] text-fg sm:text-5xl">
              See the whole system think.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted lg:justify-self-end">
            Fleet HQ turns sessions, surfaces, mailbox traffic and specialist agents into one
            operational map. Every connection reflects a real coordination primitive—not a
            decorative flowchart.
          </p>
        </div>

        <div className="topology-preview overflow-hidden rounded-[26px] border border-white/10 site-terminal bg-[#141720] shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid size-7 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                <Boxes className="size-3.5" />
              </span>
              <div>
                <div className="font-mono text-xs font-black uppercase tracking-[0.18em] text-zinc-300">
                  WrongStack / Fleet map
                </div>
                <div className="text-xs text-terminal-muted">read-only product preview</div>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-wider text-terminal-muted">
              <span className="flex items-center gap-1.5 rounded-full border border-white/[.08] px-2.5 py-1.5">
                <Activity className="size-3 text-emerald-300" /> 6 active
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-white/[.08] px-2.5 py-1.5">
                <Radio className="size-3 text-cyan-300" /> live
              </span>
            </div>
          </div>

          <MobileFlow />

          <div className="topology-canvas relative hidden h-[650px] overflow-hidden md:block">
            <svg
              className="absolute inset-0 z-10 size-full"
              viewBox="0 0 1200 650"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="topology-wire" d="M530 185 C650 115 700 115 800 180" />
              <path
                className="topology-wire-live topology-wire-mail"
                d="M530 185 C650 115 700 115 800 180"
              />
              <path className="topology-wire" d="M475 230 C390 300 210 310 175 390" />
              <path className="topology-wire" d="M500 230 C475 305 445 325 425 390" />
              <path className="topology-wire" d="M535 230 C610 300 690 310 680 390" />
              <path className="topology-wire" d="M840 240 C760 315 520 310 425 390" />
              <path
                className="topology-wire-live topology-wire-mail"
                d="M840 240 C760 315 520 310 425 390"
              />
              <path className="topology-wire" d="M890 240 C905 310 940 330 945 390" />
              <path
                className="topology-wire-live topology-wire-mail"
                d="M890 240 C905 310 940 330 945 390"
              />
              <path className="topology-wire" d="M425 495 C460 530 490 535 500 555" />
              <path
                className="topology-wire-live topology-wire-task"
                d="M425 495 C460 530 490 535 500 555"
              />
              <path className="topology-wire" d="M680 495 C710 525 750 535 770 555" />
              <path
                className="topology-wire-live topology-wire-task"
                d="M680 495 C710 525 750 535 770 555"
              />
            </svg>

            <div className="absolute left-5 top-5 z-20 w-[150px] rounded-xl border border-white/[.08] site-terminal bg-[#181b24]/85 p-3 backdrop-blur">
              <div className="flex items-center gap-2 font-mono text-[8px] font-black uppercase tracking-wider text-terminal-muted">
                <Activity className="size-3 text-emerald-300" /> Session stats
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <span className="text-terminal-muted">Clients</span>
                <strong className="text-right font-mono text-zinc-300">3 / 3</strong>
                <span className="text-terminal-muted">Agents</span>
                <strong className="text-right font-mono text-zinc-300">3 / 4</strong>
                <span className="text-terminal-muted">Tool calls</span>
                <strong className="text-right font-mono text-brand-2">278</strong>
              </div>
            </div>

            <TopologyNode
              className="left-[35%] top-[13%] w-[235px]"
              tone="cyan"
              icon={Cpu}
              eyebrow="Coordinator"
              title="Fleet HQ"
              subtitle="shared project control plane"
              metrics={[
                ['agents', '3 / 4'],
                ['tool calls', '278'],
                ['tokens', '119M'],
                ['cost', '$0.00'],
              ]}
            />
            <TopologyNode
              className="left-[67%] top-[14%] w-[225px]"
              tone="amber"
              icon={Mail}
              eyebrow="Global coordination"
              title="Mailbox hub"
              subtitle="status · task · result · steer"
              metrics={[
                ['total', '15'],
                ['unread', '6'],
              ]}
            />
            <TopologyNode
              className="left-[7%] top-[55%]"
              tone="cyan"
              icon={Monitor}
              eyebrow="Client surface"
              title="WrongStack WebUI"
              subtitle="connected · project/main"
              metrics={[
                ['agents', '0'],
                ['uptime', '8h'],
              ]}
            />
            <TopologyNode
              className="left-[33%] top-[55%]"
              tone="amber"
              icon={Terminal}
              eyebrow="Client surface"
              title="WrongStack REPL"
              subtitle="main · interactive session"
              metrics={[
                ['agents', '1'],
                ['uptime', '44m'],
              ]}
            />
            <TopologyNode
              className="left-[55%] top-[55%]"
              tone="green"
              icon={Terminal}
              eyebrow="Client surface"
              title="WrongStack TUI"
              subtitle="fleet monitor active"
              metrics={[
                ['agents', '2'],
                ['uptime', '44m'],
              ]}
            />
            <TopologyNode
              className="left-[78%] top-[55%]"
              tone="green"
              icon={Monitor}
              eyebrow="Client surface"
              title="WrongStack VibeUI"
              subtitle="focused workspace · connected"
              metrics={[
                ['agents', '0'],
                ['uptime', '19m'],
              ]}
            />

            <div className="topology-agent absolute left-[40%] top-[84%] z-20 w-[175px] rounded-xl border border-cyan-400/40 site-terminal bg-[#181b24]/95 p-3 text-zinc-100">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-cyan-300" />
                <strong className="text-xs">bug-hunter</strong>
                <span className="topology-pulse ml-auto size-2 rounded-full bg-emerald-300" />
              </div>
              <div className="mt-2 truncate font-mono text-[8px] text-terminal-muted">
                tracing provider boundary
              </div>
            </div>
            <div className="topology-agent absolute left-[63%] top-[84%] z-20 w-[185px] rounded-xl border border-cyan-400/40 site-terminal bg-[#181b24]/95 p-3 text-zinc-100">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-cyan-300" />
                <strong className="text-xs">refactor-planner</strong>
                <span className="topology-pulse ml-auto size-2 rounded-full bg-emerald-300" />
              </div>
              <div className="mt-2 truncate font-mono text-[8px] text-terminal-muted">
                waiting for bug.found
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[.08] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs leading-5 text-terminal-muted">
              Adapted from the real WebUI and HQ topology language. Sample values shown.
            </p>
            <div className="flex items-center gap-5">
              <Link
                href="/fleet"
                className="group inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300"
              >
                Explore Fleet
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/interfaces"
                className="group inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300"
              >
                Compare surfaces
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Mail, 'Global Mailbox', 'Typed cross-session agent communication.', '/mailbox'],
            [
              PanelTop,
              'Kanban queue',
              'Dependency-ready work with per-task routing.',
              '/features/kanban-work-queue',
            ],
            [
              BrainCircuit,
              'Brain Council',
              'Quorum, veto, weighted votes and judge.',
              '/features/brain-council',
            ],
            [
              Sparkles,
              'Multi-provider',
              'Different models for leaders, roles and fallbacks.',
              '/providers',
            ],
          ].map(([Icon, title, body, href]) => {
            const ItemIcon = Icon as typeof Mail;
            return (
              <Link
                key={String(title)}
                href={String(href)}
                className="group bg-card p-5 transition-colors hover:bg-surface sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <ItemIcon className="size-4.5 text-brand" />
                  <ArrowUpRight className="size-3.5 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
                <h3 className="mt-6 text-sm font-black text-fg">{String(title)}</h3>
                <p className="mt-2 text-xs leading-5 text-muted">{String(body)}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
