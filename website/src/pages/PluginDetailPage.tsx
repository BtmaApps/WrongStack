import {
  Activity,
  ArrowRight,
  Blocks,
  Bot,
  CheckCircle2,
  Gauge,
  GitBranch,
  LockKeyhole,
  PlayCircle,
  Settings2,
  Webhook,
  Wrench,
} from 'lucide-react';
import {
  ExternalDoc,
  heroTitleFontSize,
  PageHero,
  PageNext,
  SectionIntro,
} from '@/components/site/primitives';
import { pluginDetails } from '@/data/plugin-details';
import { buildPluginOperationalProfile } from '@/data/plugin-operational';
import { pluginCatalog, pluginFromSlug, pluginSlug } from '@/data/runtime-catalog';
import { Link, useRouter } from '@/lib/router';

const riskStyles = {
  low: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
  medium: 'border-brand/25 bg-brand/10 text-brand',
  high: 'border-brand-2/25 bg-brand-2/10 text-brand-2',
} as const;

export function PluginDetailPage() {
  const { path } = useRouter();
  const pathParts = path.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1] ?? '';
  const plugin = pluginFromSlug(slug);
  if (!plugin) return null;
  const detail = pluginDetails[plugin.name];
  if (!detail) return null;
  const operational = buildPluginOperationalProfile(plugin, detail);
  const position = pluginCatalog.findIndex((item) => item.name === plugin.name) + 1;
  const related = pluginCatalog
    .filter((item) => item.source === plugin.source && item.name !== plugin.name)
    .slice(0, 5);
  const hasTools = detail.tools.length > 0;
  const hasConfig = detail.configOptions.length > 0;
  const hasHooks = detail.hooks.length > 0;
  const sourcePath =
    plugin.source === 'Suite'
      ? `packages/plugins/src/${plugin.name}/index.ts`
      : plugin.name === '@wrongstack/plug-lsp'
        ? 'packages/plug-lsp/src/index.ts'
        : plugin.name === 'telegram'
          ? 'packages/telegram/src/index.ts'
          : null;

  return (
    <>
      <PageHero
        index={`21.${String(position).padStart(2, '0')}`}
        eyebrow={`${plugin.source} plugin`}
        title={<span className="font-mono text-brand">{plugin.name}</span>}
        titleFontSize={heroTitleFontSize(plugin.name, { mono: true })}
        description={plugin.summary}
        aside={
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1.5 font-mono text-xs font-black uppercase ${riskStyles[plugin.risk]}`}
            >
              {plugin.risk} risk
            </span>
            <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
              {plugin.defaultState} by default
            </span>
            {detail.version && (
              <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
                v{detail.version}
              </span>
            )}
            <span className="rounded-full border border-line bg-card px-3 py-1.5 font-mono text-xs font-black uppercase text-faint">
              {operational.llm.label}
            </span>
          </div>
        }
      />

      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-[1380px] grid-cols-2 gap-px bg-line px-4 sm:px-6 lg:grid-cols-5 lg:px-10">
          {[
            ['Execution', operational.executionLabel],
            ['Tools', String(operational.toolCount)],
            ['Hooks', String(operational.hookCount)],
            ['Config', String(operational.configCount)],
            ['Model', operational.llm.label],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-6 text-center">
              <strong className="block break-words font-mono text-sm font-black text-fg">
                {value}
              </strong>
              <span className="mt-1 block text-xs font-black uppercase tracking-[0.16em] text-faint">
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-32">
        <SectionIntro index="01" eyebrow="What it does" title={`Inside ${plugin.name}.`} />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.72fr]">
          <article className="rounded-2xl border border-line bg-card p-6 sm:p-8">
            <Blocks className="size-5 text-brand" />
            <h2 className="mt-8 text-2xl font-black tracking-[-0.04em] text-fg">Behavior</h2>
            <p className="mt-4 text-base leading-8 text-muted">{detail.longDescription}</p>
            <p className="mt-4 text-sm leading-7 text-muted">
              Enable, disable and configure it with the{' '}
              <Link href="/commands/plugin" className="font-bold text-brand">
                /plugin
              </Link>{' '}
              command; options live under{' '}
              <code className="font-mono text-xs text-brand">plugins.{plugin.name}</code> in the
              project or user config.
            </p>
            {(detail.apiVersion || (detail.dependsOn?.length ?? 0) > 0) && (
              <div className="mt-6 flex flex-wrap gap-2">
                {detail.apiVersion && (
                  <span className="rounded-full border border-line bg-bg px-3 py-1.5 font-mono text-xs font-bold text-faint">
                    kernel {detail.apiVersion}
                  </span>
                )}
                {detail.dependsOn?.map((dep) => (
                  <span
                    key={dep}
                    className="rounded-full border border-line bg-bg px-3 py-1.5 font-mono text-xs font-bold text-faint"
                  >
                    needs {dep}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-8 border-t border-line pt-6">
              <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-faint">
                Best used for
              </h3>
              <ul className="mt-4 space-y-3">
                {operational.useCases.map((useCase) => (
                  <li key={useCase} className="flex gap-3 text-sm leading-6 text-muted">
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-500" />
                    {useCase}
                  </li>
                ))}
              </ul>
            </div>
          </article>
          <aside className="space-y-6">
            {hasHooks && (
              <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Webhook className="size-4 text-brand-2" />
                  <h2 className="text-lg font-black text-fg">Hooks &amp; events</h2>
                </div>
                <ul className="mt-5 space-y-2">
                  {detail.hooks.map((hook) => (
                    <li key={hook} className="font-mono text-xs leading-6 text-muted">
                      {hook}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.example && (
              <div className="overflow-hidden rounded-2xl border border-line bg-ink">
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                  <GitBranch className="size-4 text-brand" />
                  <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                    Config example
                  </span>
                </div>
                <pre className="overflow-x-auto p-5 font-mono text-xs leading-6 text-zinc-300">
                  {detail.example}
                </pre>
              </div>
            )}
            {sourcePath && (
              <div className="rounded-2xl border border-line bg-card p-6">
                <Activity className="size-4 text-brand" />
                <h2 className="mt-5 text-lg font-black text-fg">Inspect the implementation</h2>
                <p className="mt-2 text-xs leading-6 text-muted">
                  Read the exact schema, tool permissions, fallback path and teardown behavior.
                </p>
                <div className="mt-5">
                  <ExternalDoc path={sourcePath}>Open plugin source</ExternalDoc>
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <article className="rounded-2xl border border-line bg-card p-6 sm:p-8">
            <PlayCircle className="size-5 text-brand" />
            <h2 className="mt-7 text-xl font-black text-fg">Operational playbook</h2>
            <ol className="mt-6 space-y-5">
              {operational.workflow.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[28px_1fr] gap-3">
                  <span className="font-mono text-xs font-black text-brand-2">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-fg">{step.title}</h3>
                    <p className="mt-1 text-xs leading-6 text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <article className="rounded-2xl border border-line bg-card p-6 sm:p-8">
            <LockKeyhole className="size-5 text-brand-2" />
            <h2 className="mt-7 text-xl font-black text-fg">Safety &amp; bounds</h2>
            <ul className="mt-6 space-y-4">
              {operational.safetyNotes.map((note) => (
                <li key={note} className="flex gap-3 text-xs leading-6 text-muted">
                  <Gauge className="mt-1 size-4 shrink-0 text-brand" />
                  {note}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-line bg-ink p-6 text-white sm:p-8">
            <Bot className="size-5 text-brand" />
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black">Model behavior</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.12em] text-brand-2">
                {operational.llm.label}
              </span>
            </div>
            <p className="mt-5 text-sm leading-7 text-zinc-300">{operational.llm.summary}</p>
            <dl className="mt-6 space-y-4 border-t border-white/10 pt-5 text-xs leading-6">
              <div>
                <dt className="font-mono font-black uppercase tracking-[0.12em] text-zinc-500">
                  Routing
                </dt>
                <dd className="mt-1 text-zinc-300">{operational.llm.routing}</dd>
              </div>
              <div>
                <dt className="font-mono font-black uppercase tracking-[0.12em] text-zinc-500">
                  Fallback
                </dt>
                <dd className="mt-1 text-zinc-300">{operational.llm.fallback}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      {hasTools && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
            <SectionIntro
              index="02"
              eyebrow="Registered tools"
              title="What the agent gains when this plugin is active."
            />
            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              {detail.tools.map((tool) => (
                <article
                  key={tool.name}
                  className="rounded-2xl border border-line bg-card p-6 sm:p-7"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-mono text-base font-black text-fg">{tool.name}</h3>
                    <div className="flex gap-2">
                      {tool.category && (
                        <span className="rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-xs font-bold text-faint">
                          {tool.category}
                        </span>
                      )}
                      {tool.mutating !== undefined && (
                        <span className="rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-xs font-bold text-faint">
                          {tool.mutating ? 'mutating' : 'read-only'}
                        </span>
                      )}
                    </div>
                  </div>
                  {tool.summary && (
                    <p className="mt-3 text-sm leading-6 text-muted">{tool.summary}</p>
                  )}
                  {tool.params && tool.params.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                      {tool.params.map((param) => (
                        <div
                          key={param.name}
                          className="flex flex-wrap items-baseline gap-2 text-xs"
                        >
                          <code className="font-mono font-bold text-brand">{param.name}</code>
                          <code className="font-mono text-faint">{param.type}</code>
                          {param.description && (
                            <span className="text-muted">{param.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasConfig && (
        <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-32">
          <SectionIntro
            index={hasTools ? '03' : '02'}
            eyebrow="Configuration"
            title="Options validated by the plugin's schema."
            description="Every option is JSON-Schema validated at load time; invalid config is rejected before the plugin activates."
          />
          <div className="mt-12 overflow-hidden rounded-2xl border border-line">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-card font-mono text-xs font-black uppercase tracking-[0.14em] text-faint">
                    <th className="px-5 py-4">Option</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Default</th>
                    <th className="px-5 py-4">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.configOptions.map((option) => (
                    <tr key={option.name} className="border-b border-line bg-card last:border-b-0">
                      <td className="px-5 py-4 font-mono text-xs font-bold text-fg">
                        {option.name}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-brand">{option.type}</td>
                      <td className="px-5 py-4 font-mono text-xs text-muted">
                        {option.defaultValue ?? '—'}
                      </td>
                      <td className="px-5 py-4 leading-6 text-muted">
                        {option.description ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <h2 className="text-2xl font-black tracking-[-0.04em] text-fg">
              More {plugin.source} plugins
            </h2>
            <div className="flex flex-wrap items-center gap-5">
              <Link
                href="/commands/plugin"
                className="group inline-flex items-center gap-2 text-sm font-black text-brand"
              >
                <Settings2 className="size-4" /> Manage with /plugin
              </Link>
              {plugin.source === 'Suite' && (
                <ExternalDoc path="packages/plugins/README.md">Plugin reference</ExternalDoc>
              )}
            </div>
          </div>
          {related.length > 0 && (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.name}
                  href={`/plugins/${pluginSlug(item.name)}`}
                  className="group rounded-2xl border border-line bg-card p-6 hover:border-brand"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 truncate font-mono text-base font-black text-fg">
                      {item.name}
                    </h3>
                    <Wrench className="size-4 shrink-0 text-faint" />
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{item.summary}</p>
                  <ArrowRight className="mt-6 size-4 text-faint transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <PageNext
        label="Plugin catalog"
        title="Browse all managed plugins"
        body="Search the complete catalog by source, default state and operational risk."
        href="/plugins"
      />
    </>
  );
}
