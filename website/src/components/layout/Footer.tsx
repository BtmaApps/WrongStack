import { ArrowUpRight } from 'lucide-react';
import { BrandMark } from '@/components/site/BrandMark';
import { docsUrl, license, repoUrl, runtimeBadge, version } from '@/data/content';
import { Link } from '@/lib/router';

const columns = [
  {
    title: 'Understand',
    links: [
      ['Features', '/features'],
      ['How it works', '/how-it-works'],
      ['Compare products', '/compare'],
      ['Interfaces', '/interfaces'],
      ['Architecture', '/architecture'],
      ['Brand guidelines', '/brand'],
    ],
  },
  {
    title: 'Operate',
    links: [
      ['Commands', '/commands'],
      ['Settings', '/settings'],
      ['Built-in tools', '/tools'],
      ['Plugin catalog', '/plugins'],
      ['Ecosystem', '/ecosystem'],
      ['Security', '/security'],
    ],
  },
  {
    title: 'Deep dives',
    links: [
      ['Getting started', '/getting-started'],
      ['Workflows', '/workflows'],
      ['Fleet & Brain', '/fleet'],
      ['Agent roster', '/agent-roster'],
      ['Session modes', '/modes'],
      ['Global Mailbox', '/mailbox'],
      ['Kanban work queue', '/features/kanban-work-queue'],
      ['Brain Council', '/features/brain-council'],
      ['Customization', '/features/customization'],
      ['Memory & sessions', '/memory'],
      ['Connect with a coding plan', '/coding-plans'],
      ['Providers & models', '/providers'],
      ['MCP guide', '/mcp'],
      ['Troubleshooting', '/troubleshooting'],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line bg-ink text-white">
      <div className="mx-auto max-w-[1380px] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <BrandMark className="w-16" />
              <span className="font-mono text-lg font-black tracking-[-0.06em]">
                WRONG<span className="text-brand">STACK</span>
              </span>
            </Link>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-400">
              An AI coding agent for people who want powerful automation and a clear answer to “what
              just happened?”
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-2/30 bg-brand-2/10 px-3 py-1.5 font-mono text-xs font-black uppercase tracking-[0.14em] text-brand-2">
              <span className="size-1.5 rounded-sm bg-brand" /> Open source · Free · MIT licensed
            </div>
            <Link
              href="/created-by"
              className="mt-5 inline-flex items-center gap-2 text-sm font-black text-white transition-colors hover:text-brand"
            >
              Created by Ersin KOÇ <ArrowUpRight className="size-3.5" />
            </Link>
            <div className="mt-7 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-[0.14em] text-zinc-500">
              <span className="rounded-full border border-white/10 px-3 py-1.5">v{version}</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">
                {runtimeBadge}
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">{license}</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">
                $0 license fee
              </span>
            </div>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                {column.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {column.links.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm font-semibold text-zinc-300 transition-colors hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-5 border-t border-white/10 pt-7 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono font-bold uppercase tracking-[0.08em]">
            <span className="text-brand-2">Built on the wrong stack.</span>{' '}
            <span className="text-brand">Shipped anyway.</span>
          </p>
          <div className="flex gap-5">
            <a
              href="https://x.com/ersinkoc"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              @ersinkoc <ArrowUpRight className="size-3.5" />
            </a>
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              Source docs <ArrowUpRight className="size-3.5" />
            </a>
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white"
            >
              GitHub <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
