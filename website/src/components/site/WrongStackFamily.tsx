import { Activity, ArrowUpRight, Check, Hammer, Network, Workflow } from 'lucide-react';
import { familyProducts } from '@/data/wrongstack-family';
import { SectionIntro } from './primitives';

const productIcons = { wrongstack: Workflow, wrongforge: Hammer, wrongtrace: Activity };
const productTones = {
  wrongstack: 'text-brand-2',
  wrongforge: 'text-brand',
  wrongtrace: 'text-fg',
};

export function WrongStackFamily() {
  return (
    <section
      id="wrongstack-family"
      aria-label="WrongStack family"
      className="border-y border-line bg-surface scroll-mt-24"
    >
      <div className="site-section site-container">
        <SectionIntro
          index="WS"
          eyebrow="WrongStack family"
          title="Orchestrate. Execute. Observe."
          description="Three independent projects for the agent workflow. Start with WrongStack, bring in WrongForge for a dedicated execution runtime, and use WrongTrace to understand the activity and code changes."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {familyProducts.map((product, index) => {
            const Icon = productIcons[product.id];
            return (
              <article
                key={product.id}
                className={`flex min-w-0 flex-col rounded-2xl border border-line bg-card p-6 sm:p-8 ${index === 0 ? 'md:col-span-2 lg:col-span-1' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface ${productTones[product.id]}`}
                  >
                    <Icon className="size-6" />
                  </span>
                  <span className="rounded-full border border-line px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    {product.status}
                  </span>
                </div>
                <div className="mt-8 flex items-center gap-3 font-mono text-xs font-black uppercase tracking-[0.14em] text-faint">
                  <span className={productTones[product.id]}>0{index + 1}</span>
                  {product.role}
                </div>
                <h3 className="mt-3 text-3xl font-black tracking-[-0.04em] text-fg">
                  {product.name}
                </h3>
                <p
                  className={`mt-2 text-xs font-bold uppercase tracking-[0.08em] ${productTones[product.id]}`}
                >
                  {product.category}
                </p>
                <p className="mt-5 text-sm leading-7 text-muted">{product.description}</p>
                <ul className="my-6 space-y-3 border-t border-line pt-6">
                  {product.capabilities.map((capability) => (
                    <li key={capability} className="flex items-start gap-2 text-sm text-fg">
                      <Check className={`mt-0.5 size-4 shrink-0 ${productTones[product.id]}`} />
                      {capability}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto border-t border-line pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <a
                      href={product.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Explore ${product.name} on GitHub`}
                      className="group inline-flex items-center gap-2 text-sm font-black text-fg hover:text-brand"
                    >
                      Explore {product.name}
                      <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </a>
                    <a
                      href={product.licenseHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${product.name} license: ${product.license}`}
                      className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] font-bold text-muted hover:text-fg"
                    >
                      {product.license}
                    </a>
                  </div>
                  <a
                    href={product.docsHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Read the docs for ${product.name}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-brand"
                  >
                    Read the docs <ArrowUpRight className="size-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-6 grid gap-4 rounded-2xl border border-line bg-bg p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
          <Network className="size-6 text-brand-2" />
          <div>
            <h3 className="text-sm font-black text-fg">Connected by the workflow.</h3>
            <p className="mt-2 text-sm leading-7 text-muted">
              WrongStack can delegate tasks to WrongForge through its task API and tool gateway.
              WrongTrace connects through native telemetry and IPC to make agent work and code
              changes inspectable. Add the parts your workflow needs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
