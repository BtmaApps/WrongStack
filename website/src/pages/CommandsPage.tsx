import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Command, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';
import { type CommandCategory, commandCategories, commandSlug, commands } from '@/data/content';
import { Link } from '@/lib/router';
import { cn } from '@/lib/utils';

const categoryDescriptions: Record<Exclude<CommandCategory, 'All'>, string> = {
  Workflow: 'Goals, planning, SDD and focused task flows',
  Session: 'Context, memory, persistence and live state',
  Agents: 'Delegation, fleets, Brain and mailbox coordination',
  Configure: 'Models, runtime behavior, projects and interface controls',
  Developer: 'Codebase analysis, Git, audit and quality work',
  Ecosystem: 'Tools, MCP, skills, plugins, prompts and observability',
};

function CommandRow({ command }: { command: (typeof commands)[number] }) {
  const [open, setOpen] = useState(false);
  const hasDetail = command.usage || command.note;
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="grid w-full gap-3 px-4 py-5 text-left transition-colors hover:bg-surface sm:grid-cols-[190px_110px_1fr_70px] sm:items-center sm:px-6">
        <Link href={`/commands/${commandSlug(command.name)}`}>
          <code className="font-mono text-sm font-black text-brand">{command.name}</code>
        </Link>
        <span className="w-fit rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-xs font-black uppercase tracking-wider text-faint">
          {command.category}
        </span>
        <span className="text-sm leading-6 text-muted">{command.summary}</span>
        <div className="flex items-center justify-end gap-1">
          {hasDetail && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="grid size-8 place-items-center rounded-full hover:bg-bg"
              aria-label={`Toggle ${command.name} examples`}
            >
              <ChevronDown
                className={cn('size-4 text-faint transition-transform', open && 'rotate-180')}
              />
            </button>
          )}
          <Link
            href={`/commands/${commandSlug(command.name)}`}
            aria-label={`Open ${command.name} reference`}
            className="grid size-8 place-items-center rounded-full hover:bg-bg hover:text-brand"
          >
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-line bg-ink px-5 py-5 text-zinc-300 sm:ml-[190px] sm:px-6">
              <div className="font-mono text-xs font-black uppercase tracking-[0.18em] text-zinc-600">
                Examples
              </div>
              <div className="mt-3 space-y-1.5">
                {command.usage?.map((usage) => (
                  <code key={usage} className="block font-mono text-xs">
                    <span className="mr-2 text-brand">❯</span>
                    {usage}
                  </code>
                ))}
              </div>
              {command.note && <p className="mt-3 text-xs text-zinc-500">{command.note}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CommandsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CommandCategory>('All');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter(
      (command) =>
        (category === 'All' || command.category === category) &&
        (!needle ||
          `${command.name} ${command.summary} ${command.category}`.toLowerCase().includes(needle)),
    );
  }, [category, query]);

  return (
    <>
      <PageHero
        index="04"
        eyebrow="Command atlas"
        title={
          <>
            Type less.
            <br />
            <span className="text-brand-2">Control more.</span>
          </>
        }
        description={`Slash commands are the operator language around the agent loop. Search all ${commands.length} documented commands, filter by intent and expand practical examples.`}
        aside={<ExternalDoc path="docs/slash/README.md">Open canonical command docs</ExternalDoc>}
      />

      <section className="site-section site-section--compact site-container">
        <SectionIntro
          index="01"
          eyebrow="Search reference"
          title="Find a command by what you want to do."
          description="Commands can return output immediately, change live settings, open a TUI panel or inject structured steering into the next agent turn."
        />
        <div className="sticky top-[70px] z-20 mt-12 border-y border-line bg-bg/92 py-4 backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search commands, descriptions, categories…"
                className="h-12 w-full rounded-full border border-line bg-card pl-11 pr-11 text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-brand-2"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full hover:bg-bg"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {commandCategories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-colors',
                    category === item
                      ? 'bg-brand-2 text-ink'
                      : 'text-muted hover:bg-card hover:text-fg',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between">
          <span className="font-mono text-xs font-black uppercase tracking-[0.18em] text-faint">
            {filtered.length} of {commands.length} commands
          </span>
          <span className="hidden text-xs text-faint sm:block">
            Rows with examples can be expanded.
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card">
          {filtered.length > 0 ? (
            filtered.map((command) => <CommandRow key={command.name} command={command} />)
          ) : (
            <div className="px-6 py-20 text-center">
              <Command className="mx-auto size-8 text-faint" />
              <h2 className="mt-4 font-black text-fg">No matching command</h2>
              <p className="mt-2 text-sm text-muted">Try a broader word or reset the category.</p>
            </div>
          )}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="site-section site-section--short site-container">
          <SectionIntro
            index="02"
            eyebrow="Mental model"
            title="Six groups cover almost every operating question."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(categoryDescriptions).map(([name, body], index) => (
              <button
                type="button"
                key={name}
                onClick={() => {
                  setCategory(name as CommandCategory);
                  window.scrollTo({ top: 700, behavior: 'smooth' });
                }}
                className="bg-card p-6 text-left transition-colors hover:bg-bg"
              >
                <span className="font-mono text-xs font-black text-brand-2">0{index + 1}</span>
                <h3 className="mt-8 text-lg font-black text-fg">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
      <PageNext
        label="Settings"
        title="Tune the system behind the commands"
        body="Understand configuration layers, safe project settings, providers, context and fleet controls."
        href="/settings"
      />
    </>
  );
}
