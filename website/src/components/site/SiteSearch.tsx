import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Blocks,
  Bot,
  CircleGauge,
  Command,
  CornerDownLeft,
  FileText,
  Layers3,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  commandSlug,
  commands,
  featureStories,
  moreNav,
  pageMeta,
  primaryNav,
  type SiteRoute,
} from '@/data/content';
import { modeCatalog, rosterIndex } from '@/data/product-catalog';
import { pluginCatalog, pluginSlug, toolCatalog, toolSlug } from '@/data/runtime-catalog';
import { useRouter } from '@/lib/router';
import { cn } from '@/lib/utils';

type SearchKind = 'Page' | 'Feature' | 'Command' | 'Plugin' | 'Tool' | 'Mode' | 'Agent';

type SearchEntry = {
  id: string;
  kind: SearchKind;
  label: string;
  description: string;
  href: string;
  terms: string;
};

const navLabels = new Map<string, string>(
  [...primaryNav, ...moreNav].map((item) => [item.href, item.label] as const),
);

const allEntries: SearchEntry[] = [
  ...(Object.entries(pageMeta) as Array<[SiteRoute, (typeof pageMeta)[SiteRoute]]>).map(
    ([href, meta]) => ({
      id: `page:${href}`,
      kind: 'Page' as const,
      label: href === '/' ? 'Home' : (navLabels.get(href) ?? meta.title.split(' — ')[0]),
      description: meta.description,
      href,
      terms: `${href} ${meta.title} ${meta.description}`.toLowerCase(),
    }),
  ),
  ...featureStories.map((feature) => ({
    id: `feature:${feature.slug}`,
    kind: 'Feature' as const,
    label: feature.title,
    description: feature.summary,
    href: `/features/${feature.slug}`,
    terms:
      `${feature.slug} ${feature.eyebrow} ${feature.title} ${feature.summary} ${feature.details.join(' ')}`.toLowerCase(),
  })),
  ...commands.map((command) => ({
    id: `command:${command.name}`,
    kind: 'Command' as const,
    label: command.name,
    description: command.summary,
    href: `/commands/${commandSlug(command.name)}`,
    terms:
      `${command.name} ${command.category} ${command.summary} ${command.usage?.join(' ') ?? ''}`.toLowerCase(),
  })),
  ...pluginCatalog.map((plugin) => ({
    id: `plugin:${plugin.name}`,
    kind: 'Plugin' as const,
    label: plugin.name,
    description: plugin.summary,
    href: `/plugins/${pluginSlug(plugin.name)}`,
    terms: `${plugin.name} ${plugin.source} ${plugin.risk} ${plugin.summary}`.toLowerCase(),
  })),
  ...toolCatalog.map((tool) => ({
    id: `tool:${tool.name}`,
    kind: 'Tool' as const,
    label: tool.name,
    description: tool.summary,
    href: `/tools/${toolSlug(tool.name)}`,
    terms: `${tool.name} ${tool.category} ${tool.permission} ${tool.summary}`.toLowerCase(),
  })),
  ...modeCatalog.map((mode) => ({
    id: `mode:${mode.id}`,
    kind: 'Mode' as const,
    label: mode.name,
    description: mode.description,
    href: `/modes/${mode.id}`,
    terms: `${mode.id} ${mode.name} ${mode.family} ${mode.description}`.toLowerCase(),
  })),
  ...rosterIndex.map((agent) => ({
    id: `agent:${agent.role}`,
    kind: 'Agent' as const,
    label: agent.name,
    description: agent.summary,
    href: `/agent-roster/${agent.role}`,
    terms:
      `${agent.role} ${agent.name} ${agent.phaseLabel ?? ''} ${agent.kind} ${agent.summary}`.toLowerCase(),
  })),
];

const featuredHrefs = [
  '/created-by',
  '/agent-roster',
  '/modes',
  '/mailbox',
  '/features/kanban-work-queue',
  '/features/brain-council',
  '/providers',
  '/commands/fleet',
  '/commands/brain',
];

const iconForKind = {
  Page: FileText,
  Feature: Layers3,
  Command,
  Plugin: Blocks,
  Tool: Wrench,
  Mode: CircleGauge,
  Agent: Bot,
} as const;

function scoreEntry(entry: SearchEntry, query: string) {
  const q = query.toLowerCase().trim();
  const label = entry.label.toLowerCase();
  const href = entry.href.toLowerCase();
  if (label === q || href === q) return 100;
  if (label.startsWith(q)) return 70;
  if (href.startsWith(q)) return 60;
  if (label.includes(q)) return 45;
  if (entry.terms.includes(q)) return 20;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => entry.terms.includes(word))) return 12;
  return 0;
}

export function SiteSearch() {
  const { navigate, path } = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const results = useMemo(() => {
    if (!query.trim()) {
      return featuredHrefs
        .map((href) => allEntries.find((entry) => entry.href === href))
        .filter((entry): entry is SearchEntry => Boolean(entry));
    }
    return allEntries
      .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
      .slice(0, 14)
      .map((result) => result.entry);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, id, open, query]);

  const choose = (entry: SearchEntry) => {
    navigate(entry.href);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-10 items-center gap-2 rounded-full px-2.5 text-muted transition-colors hover:bg-card hover:text-fg sm:border sm:border-line sm:bg-card/60 sm:px-3"
        aria-label="Search ⌘ K: pages, features and commands"
      >
        <Search className="size-4" />
        <span className="hidden text-xs font-semibold xl:inline">Search</span>
        <span
          aria-hidden="true"
          className="hidden rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-xs text-faint sm:inline"
        >
          ⌘ K
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <Modal
            label="Search WrongStack documentation"
            onClose={() => setOpen(false)}
            initialFocus={inputRef}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.18 }}
              className="site-search-panel mx-auto flex max-w-2xl flex-col overflow-hidden rounded-[22px] border border-line bg-bg shadow-2xl shadow-black/40"
            >
              <div className="flex items-center gap-3 border-b border-line px-4 sm:px-5">
                <Search className="size-5 shrink-0 text-brand" />
                <input
                  id={`${id}-input`}
                  ref={inputRef}
                  role="combobox"
                  aria-label="Search documentation"
                  aria-expanded="true"
                  aria-controls={`${id}-results`}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    results[activeIndex] ? `${id}-result-${activeIndex}` : undefined
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveIndex((value) =>
                        Math.min(value + 1, Math.max(0, results.length - 1)),
                      );
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveIndex((value) => Math.max(value - 1, 0));
                    }
                    if (event.key === 'Enter' && results[activeIndex]) {
                      event.preventDefault();
                      choose(results[activeIndex]);
                    }
                  }}
                  placeholder="Search roster roles, modes, Mailbox, /brain…"
                  className="h-16 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-faint sm:text-lg"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className="grid size-8 place-items-center rounded-full text-faint hover:bg-card hover:text-fg"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close search"
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-card hover:text-fg"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                <div
                  role="status"
                  className="px-2 pb-2 pt-1 font-mono text-xs font-black uppercase tracking-[0.16em] text-faint"
                >
                  {query ? `${results.length} best matches` : 'Start here'}
                </div>
                <div id={`${id}-results`} role="listbox" aria-label="Search results">
                  {results.length > 0 ? (
                    results.map((entry, index) => {
                      const Icon = iconForKind[entry.kind];
                      return (
                        <button
                          key={entry.id}
                          id={`${id}-result-${index}`}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={activeIndex === index}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => choose(entry)}
                          className={cn(
                            'group grid w-full grid-cols-[38px_1fr_auto] gap-3 rounded-xl p-3 text-left transition-colors sm:p-4',
                            activeIndex === index ? 'bg-card' : 'hover:bg-card/70',
                          )}
                        >
                          <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-brand">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <strong
                                className={cn(
                                  'truncate text-sm text-fg',
                                  entry.kind === 'Command' && 'font-mono text-brand',
                                )}
                              >
                                {entry.label}
                              </strong>
                              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-faint">
                                {entry.kind}
                              </span>
                            </span>
                            <span className="mt-1 line-clamp-1 block text-xs text-muted">
                              {entry.description}
                            </span>
                          </span>
                          <ArrowRight
                            className={cn(
                              'mt-2 size-4 text-faint transition-transform',
                              activeIndex === index && 'translate-x-1 text-brand',
                            )}
                          />
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-4 py-14 text-center">
                      <Search className="mx-auto size-6 text-faint" />
                      <h2 className="mt-5 font-black text-fg">No exact trail found.</h2>
                      <p className="mt-2 text-sm text-muted">
                        Try a system name, command, role or operational intent.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 font-mono text-xs text-faint sm:px-5">
                <span>{allEntries.length} indexed destinations</span>
                <div className="flex items-center gap-4">
                  <span>↑↓ navigate</span>
                  <span className="flex items-center gap-1">
                    <CornerDownLeft className="size-3" /> open
                  </span>
                </div>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
