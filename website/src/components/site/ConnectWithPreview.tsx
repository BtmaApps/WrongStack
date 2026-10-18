import { ArrowRight, KeyRound, LogIn } from 'lucide-react';
import { ConnectionLogo } from '@/components/site/ConnectionLogo';
import { codingConnections } from '@/data/coding-plans';
import { Link } from '@/lib/router';

export function ConnectWithPreview() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="site-container py-14 sm:py-16 lg:py-20">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-xs font-black uppercase tracking-[0.18em] text-brand">
              Connect with
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-fg sm:text-4xl">
              Bring the plan you already use.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Sign in with ChatGPT or connect a dedicated coding-plan key. Every route stays
              explicit and selectable.
            </p>
          </div>
          <Link
            href="/coding-plans"
            className="inline-flex items-center gap-2 text-sm font-black text-brand"
          >
            See every setup <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {codingConnections.map((connection) => (
            <Link
              key={connection.id}
              href={`/coding-plans#${connection.id}`}
              className={`group flex min-h-28 items-center gap-4 rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg ${
                connection.kind === 'oauth' ? 'border-emerald-500/35' : 'border-line'
              }`}
              aria-label={`Connect WrongStack with ${connection.name}`}
            >
              <ConnectionLogo connection={connection} className="size-14 rounded-xl p-3" />
              <div>
                <strong className="block text-lg font-black tracking-[-0.025em] text-fg">
                  {connection.name}
                </strong>
                <span className="mt-1.5 flex items-center gap-1.5 font-mono text-xs font-black uppercase tracking-[0.12em] text-faint">
                  {connection.kind === 'oauth' ? (
                    <LogIn className="size-3 text-emerald-500" />
                  ) : (
                    <KeyRound className="size-3 text-brand-2" />
                  )}
                  {connection.kind === 'oauth' ? 'ChatGPT login' : 'Plan key'}
                </span>
                <span className="mt-2 block text-xs text-muted">{connection.billing}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
