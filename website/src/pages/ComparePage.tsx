import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BrainCircuit,
  CircleHelp,
  Mail,
  Network,
  Route,
  ShieldCheck,
  SquareKanban,
} from 'lucide-react';
import { PageHero, PageNext, SectionIntro } from '@/components/site/primitives';
import {
  type ComparisonRow,
  comparisonVerifiedOn,
  type EvidenceLevel,
  evidenceLabels,
  overviewRows,
  type ProductComparison,
  productComparisons,
} from '@/data/comparisons';
import { repoUrl } from '@/data/content';
import { Link } from '@/lib/router';
import { cn } from '@/lib/utils';

const differentiators = [
  {
    icon: Route,
    title: 'Models are infrastructure',
    body: 'Route provider, model, reasoning and fallback by exact role, lifecycle phase or wildcard—not just from one global picker.',
    href: '/providers',
  },
  {
    icon: Network,
    title: 'A fleet is a runtime',
    body: 'Director owns queueing, lineage, concurrency, budgets, result contracts, first-finisher waits and pending-task rebalancing.',
    href: '/fleet',
  },
  {
    icon: Mail,
    title: 'Communication is durable',
    body: 'Global Mailbox connects named agents and independent CLI, TUI, WebUI and Desktop sessions with presence and acknowledgements.',
    href: '/mailbox',
  },
  {
    icon: BrainCircuit,
    title: 'Autonomy has governance',
    body: 'Brain and Fleet Supervisor evaluate operational choices above the tool permission layer and keep every intervention inspectable.',
    href: '/features/brain-council',
  },
  {
    icon: SquareKanban,
    title: 'Work outlives a chat',
    body: 'Kanban, goals, SDD, todos, plans, sessions and verified memory preserve the shape and evidence of long-running work.',
    href: '/features/kanban-work-queue',
  },
  {
    icon: ShieldCheck,
    title: 'Open all the way down',
    body: 'CLI, TUI, WebUI, VibeUI, Desktop, HQ, fleet and provider layers live in one MIT-licensed monorepo with no paid feature gate.',
    href: '/architecture',
  },
] as const;

const overviewColumns = [
  ['wrongstack', 'WrongStack'],
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
  ['opencode', 'OpenCode'],
  ['cursor', 'Cursor'],
  ['pi', 'Pi'],
] as const;

const levelStyles: Record<EvidenceLevel, string> = {
  native: 'border-emerald-500/25 bg-emerald-500/10 text-status-success',
  different: 'border-sky-500/25 bg-sky-500/10 text-status-info',
  extension: 'border-amber-500/25 bg-amber-500/10 text-status-warning',
  'not-verified': 'border-line bg-surface text-muted',
  absent: 'border-brand/25 bg-brand/10 text-brand',
};

const accentStyles = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-status-warning',
  blue: 'border-sky-500/30 bg-sky-500/10 text-status-info',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-status-success',
  purple: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  red: 'border-brand/30 bg-brand/10 text-brand',
} as const;

function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-xs font-black uppercase tracking-[0.14em]',
        levelStyles[level],
      )}
    >
      {evidenceLabels[level]}
    </span>
  );
}

function OverviewMatrix() {
  return (
    <div className="mt-10 overflow-hidden rounded-[1.6rem] border border-line bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <caption className="sr-only">
            High-level capability comparison between WrongStack, Claude Code, Codex, OpenCode,
            Cursor and Pi
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface">
              <th
                scope="col"
                className="sticky left-0 z-10 w-52 border-r border-line bg-surface px-5 py-4 font-mono text-xs font-black uppercase tracking-[0.16em] text-faint"
              >
                Capability
              </th>
              {overviewColumns.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  className={cn(
                    'min-w-40 border-r border-line px-5 py-4 text-sm font-black text-fg last:border-r-0',
                    key === 'wrongstack' && 'bg-brand-2/10',
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overviewRows.map((row) => (
              <tr key={row.capability} className="border-b border-line last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-line bg-card px-5 py-5 text-sm font-black text-fg"
                >
                  {row.capability}
                </th>
                {overviewColumns.map(([key]) => (
                  <td
                    key={key}
                    className={cn(
                      'border-r border-line px-5 py-5 align-top text-sm leading-6 text-muted last:border-r-0',
                      key === 'wrongstack' && 'bg-brand-2/[0.06] font-bold text-fg',
                    )}
                  >
                    {row[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.13em] text-faint">
        <ArrowRight className="size-3 text-brand-2" /> Scroll horizontally on narrow screens
      </div>
    </div>
  );
}

function MobileComparisonRows({ rows, name }: { rows: ComparisonRow[]; name: string }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <article key={row.capability} className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-black text-fg">{row.capability}</h3>
            <EvidenceBadge level={row.competitorLevel} />
          </div>
          <dl className="mt-5 space-y-5">
            <div>
              <dt className="font-mono text-xs font-black uppercase tracking-[0.16em] text-brand-2">
                WrongStack
              </dt>
              <dd className="mt-2 text-sm leading-6 text-fg">{row.wrongstack}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs font-black uppercase tracking-[0.16em] text-brand">
                {name}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-muted">{row.competitor}</dd>
            </div>
            <div className="border-t border-line pt-4">
              <dt className="font-mono text-xs font-black uppercase tracking-[0.16em] text-faint">
                What changes
              </dt>
              <dd className="mt-2 text-sm leading-6 text-muted">{row.difference}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function DesktopComparisonTable({ product }: { product: ProductComparison }) {
  return (
    <div className="hidden overflow-hidden rounded-[1.6rem] border border-line bg-card shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] border-collapse text-left">
          <caption className="sr-only">WrongStack and {product.name} detailed comparison</caption>
          <thead>
            <tr className="border-b border-line bg-surface">
              <th
                scope="col"
                className="w-[16%] px-5 py-4 font-mono text-xs font-black uppercase tracking-[0.16em] text-faint"
              >
                Capability
              </th>
              <th
                scope="col"
                className="w-[25%] bg-brand-2/[0.07] px-5 py-4 text-sm font-black text-fg"
              >
                WrongStack
              </th>
              <th scope="col" className="w-[25%] px-5 py-4 text-sm font-black text-fg">
                {product.name}
              </th>
              <th scope="col" className="w-[34%] px-5 py-4 text-sm font-black text-fg">
                Why it matters
              </th>
            </tr>
          </thead>
          <tbody>
            {product.rows.map((row) => (
              <tr key={row.capability} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-5 py-6 align-top text-sm font-black text-fg">
                  <span className="block">{row.capability}</span>
                  <span className="mt-3 block">
                    <EvidenceBadge level={row.competitorLevel} />
                  </span>
                </th>
                <td className="bg-brand-2/[0.045] px-5 py-6 align-top text-sm font-semibold leading-6 text-fg">
                  {row.wrongstack}
                </td>
                <td className="px-5 py-6 align-top text-sm leading-6 text-muted">
                  {row.competitor}
                </td>
                <td className="px-5 py-6 align-top text-sm leading-6 text-muted">
                  {row.difference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductSection({ product, index }: { product: ProductComparison; index: number }) {
  const sectionNumber = String(index + 3).padStart(2, '0');
  return (
    <section id={product.id} className="scroll-mt-24 border-t border-line py-16 sm:py-20 lg:py-28">
      <div className="site-container ">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  'grid size-14 place-items-center rounded-2xl border font-mono text-sm font-black',
                  accentStyles[product.accent],
                )}
              >
                {product.mark}
              </span>
              <div>
                <p className="font-mono text-xs font-black uppercase tracking-[0.16em] text-faint">
                  {sectionNumber} / {product.maker}
                </p>
                <h2 className="mt-1 text-3xl font-black tracking-[-0.035em] text-fg sm:text-4xl">
                  vs {product.name}
                </h2>
              </div>
            </div>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted">{product.positioning}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              {product.sources.map((source) => (
                <a
                  key={source.href}
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  title={source.note}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.12em] text-muted transition-colors hover:border-brand-2 hover:text-fg"
                >
                  {source.label} <ArrowUpRight className="size-3" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-brand">
                Where {product.name} is the better fit
              </span>
              <p className="mt-3 text-sm leading-6 text-muted">{product.strongestCase}</p>
            </div>
            <div className="rounded-2xl border border-brand-2/25 bg-brand-2/[0.07] p-5 sm:p-6">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-brand-2">
                Where WrongStack is different
              </span>
              <p className="mt-3 text-sm font-semibold leading-6 text-fg">
                {product.wrongStackCase}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-9 lg:mt-12">
          <MobileComparisonRows rows={product.rows} name={product.name} />
          <DesktopComparisonTable product={product} />
        </div>
      </div>
    </section>
  );
}

export function ComparePage() {
  return (
    <>
      <PageHero
        index="20"
        eyebrow="Evidence-based comparison"
        title={
          <>
            Different.
            <br />
            <span className="text-brand">By design.</span>
          </>
        }
        description="Claude Code, Codex, OpenCode, Cursor and Pi are all serious tools. This page uses their current official documentation—and WrongStack’s runtime code—to show where the operating models genuinely diverge."
        aside={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase tracking-[0.13em] text-fg">
              Verified {comparisonVerifiedOn}
            </span>
            <span className="rounded-full border border-brand-2/25 bg-brand-2/10 px-3 py-1.5 font-mono text-xs font-black uppercase tracking-[0.13em] text-brand-2">
              Official sources only
            </span>
          </div>
        }
      />

      <section className="border-b border-line bg-surface">
        <div className="site-container flex gap-2 overflow-x-auto py-4">
          <a
            href="#overview"
            className="shrink-0 rounded-full bg-fg px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.13em] text-bg"
          >
            Overview
          </a>
          {productComparisons.map((product) => (
            <a
              key={product.id}
              href={`#${product.id}`}
              className="shrink-0 rounded-full border border-line bg-card px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.13em] text-muted transition-colors hover:border-brand-2 hover:text-fg"
            >
              vs {product.name}
            </a>
          ))}
        </div>
      </section>

      <section id="overview" className="scroll-mt-24 py-16 sm:py-20 lg:py-28">
        <div className="site-container ">
          <SectionIntro
            index="01"
            eyebrow="The short answer"
            title="There is no universal winner. There are different control planes."
            description="Claude Code and Codex are deeply integrated first-party model products. Cursor owns the editor and managed cloud worker experience. OpenCode leads on documented provider breadth. Pi protects a radically minimal core. WrongStack is built around operating a provider-neutral, communicating fleet as one inspectable project system."
          />
          <OverviewMatrix />
        </div>
      </section>

      <section className="border-y border-line bg-surface py-16 sm:py-20 lg:py-28">
        <div className="site-container ">
          <SectionIntro
            index="02"
            eyebrow="The WrongStack thesis"
            title="The model is replaceable. The operating system is the product."
            description="Most comparisons stop at model choice, tools and edit quality. WrongStack’s strongest differences appear after the first agent starts: how work is queued, how peers communicate, who may intervene, what survives a crash and how the operator sees the whole system."
          />
          <div className="mt-10 grid gap-px overflow-hidden rounded-[1.6rem] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {differentiators.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group bg-card p-6 transition-colors hover:bg-bg sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-2/10 text-brand-2">
                    <item.icon className="size-5" />
                  </span>
                  <ArrowUpRight className="size-4 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
                <h3 className="mt-7 text-xl font-black tracking-[-0.02em] text-fg">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {productComparisons.map((product, index) => (
        <ProductSection key={product.id} product={product} index={index} />
      ))}

      <section className="border-t border-line bg-ink py-16 text-white sm:py-20 lg:py-24">
        <div className="site-container grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <div className="flex items-center gap-3 font-mono text-xs font-black uppercase tracking-[0.16em] text-brand-2">
              <BadgeCheck className="size-4" /> Claim standard
            </div>
            <h2 className="mt-5 max-w-xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Facts first. Marketing second.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                'Official competitor sources',
                'Every competitor claim links to its own current documentation, product page or official repository.',
              ],
              [
                'Code-owned WrongStack facts',
                'Role, mode, tool and plugin catalogs are checked against runtime sources during the website build.',
              ],
              [
                'No invented benchmark scores',
                'This is a capability and architecture comparison—not a synthetic “10/10” performance league table.',
              ],
              [
                'Absence is stated carefully',
                '“Not verified” means the reviewed official sources do not document it; only explicit product philosophy is labeled absent.',
              ],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
                <h3 className="text-sm font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="site-container mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-start gap-2 text-sm leading-6 text-zinc-400">
            <CircleHelp className="mt-1 size-4 shrink-0 text-brand" /> Products change quickly. Open
            the linked sources before making a purchasing or platform decision.
          </p>
          <a
            href={`${repoUrl}/blob/main/AGENTS.md`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-white hover:text-brand-2"
          >
            Audit WrongStack’s architecture <ArrowUpRight className="size-4" />
          </a>
        </div>
      </section>

      <PageNext
        label="Providers"
        title="Turn provider independence into a real routing policy."
        body="See authentication paths, role-level model routing, fallback chains and the exact failure kinds that may cross a provider boundary."
        href="/providers"
      />
    </>
  );
}
