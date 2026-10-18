import { AlertCircle, Check, ChevronDown, Search, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';
import { cn } from '@/lib/utils';

const issues = [
  {
    category: 'Provider',
    title: 'No provider configured',
    symptom: 'Startup stops before a model request can be built.',
    causes: ['No saved provider/model', 'Non-interactive mode with an empty config'],
    fixes: ['wstack auth', 'wstack --provider <id> --model <id>', 'wstack diag'],
  },
  {
    category: 'Provider',
    title: 'API key missing or 401 unauthorized',
    symptom: 'The provider rejects authentication or no credential source resolves.',
    causes: [
      'Expired or rotated key',
      'Wrong active provider',
      'Environment variable not visible to the process',
    ],
    fixes: ['wstack auth <provider>', 'wstack diag', 'wstack auth status <provider>'],
  },
  {
    category: 'Provider',
    title: 'Rate limited or overloaded',
    symptom: 'The provider returns a capacity error and WrongStack begins retrying.',
    causes: ['Provider quota exhausted', 'Regional or model capacity pressure'],
    fixes: ['/fallback', '/setmodel', 'Wait for the Retry-After window'],
  },
  {
    category: 'Context',
    title: 'Context window exceeded',
    symptom: 'The request crosses the provider or configured effective context limit.',
    causes: ['Long conversation', 'Large old tool results', 'Incorrect custom endpoint limit'],
    fixes: ['/compact', '/context mode frugal', '/context limit <tokens>'],
  },
  {
    category: 'Tools',
    title: 'Tool execution timed out',
    symptom: 'A tool exceeds its per-call or iteration deadline.',
    causes: [
      'Long-running foreground process',
      'Blocked subprocess',
      'Timeout too low for the task',
    ],
    fixes: [
      'Run suitable processes in background',
      'Inspect cancellation and child output',
      'Tune tools.iterationTimeoutMs',
    ],
  },
  {
    category: 'MCP',
    title: 'MCP server failed to connect',
    symptom: 'A server remains disconnected or exhausts its five reconnect cycles.',
    causes: [
      'Command missing from PATH',
      'Port conflict',
      'TLS or startup timeout',
      'Remote endpoint unavailable',
    ],
    fixes: ['wstack mcp list', '/mcp restart <name>', 'Run the configured command directly'],
  },
  {
    category: 'Policy',
    title: 'Permission denied',
    symptom: 'A tool call is blocked before execution.',
    causes: [
      'Explicit deny rule',
      'PreToolUse hook denial',
      'Sensitive or destructive operation requires confirmation',
    ],
    fixes: ['/audit', '/yolo on for permitted calls', 'Review the project trust policy'],
  },
  {
    category: 'Session',
    title: 'Session has orphan tool results',
    symptom: 'An interrupted run left tool-use adjacency incomplete.',
    causes: ['Process stopped mid-tool', 'Abrupt terminal or host shutdown'],
    fixes: ['wstack resume <id>', '/context repair', 'Inspect in-flight markers before pruning'],
  },
  {
    category: 'Plugins',
    title: 'Plugin failed to load',
    symptom: 'Plugin setup throws or its capabilities never register.',
    causes: ['Missing dependency', 'apiVersion mismatch', 'Invalid extensions config'],
    fixes: ['wstack plugin status', 'wstack diag', 'Review extensions.<plugin-name>'],
  },
  {
    category: 'Interface',
    title: 'TUI rendering artifacts',
    symptom: 'Output is garbled after resize or scrollback appears incomplete.',
    causes: [
      'Incorrect TERM in tmux/screen',
      'Terminal resize behavior',
      'Completed chat entries are in native scrollback',
    ],
    fixes: [
      'Verify $TERM',
      'Use terminal-native scrollback',
      'Restart with --no-tui to isolate rendering',
    ],
  },
  {
    category: 'Catalog',
    title: 'models.dev refresh failed',
    symptom: 'Startup warns that it is using the cached model catalog.',
    causes: ['Offline network', 'Registry temporarily unavailable'],
    fixes: [
      'wstack models refresh',
      'Use --no-models-refresh for offline work',
      'Set features.modelsRegistry false',
    ],
  },
] as const;

function IssueCard({ issue }: { issue: (typeof issues)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid w-full gap-3 p-5 text-left sm:grid-cols-[110px_1fr_24px] sm:items-center"
      >
        <span className="w-fit rounded-full border border-line bg-bg px-2.5 py-1 font-mono text-xs font-black uppercase text-brand">
          {issue.category}
        </span>
        <div>
          <h2 className="font-black text-fg">{issue.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{issue.symptom}</p>
        </div>
        <ChevronDown
          className={cn('size-4 text-faint transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="grid gap-px border-t border-line bg-line lg:grid-cols-2">
          <div className="bg-bg p-5">
            <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-faint">
              Likely causes
            </h3>
            <ul className="mt-4 space-y-2">
              {issue.causes.map((cause) => (
                <li key={cause} className="flex gap-2 text-sm leading-6 text-muted">
                  <AlertCircle className="mt-1 size-3.5 shrink-0 text-amber-500" />
                  {cause}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-bg p-5">
            <h3 className="font-mono text-xs font-black uppercase tracking-[0.16em] text-faint">
              Next checks
            </h3>
            <ul className="mt-4 space-y-2">
              {issue.fixes.map((fix) => (
                <li key={fix} className="flex gap-2 text-sm leading-6 text-muted">
                  <Check className="mt-1 size-3.5 shrink-0 text-emerald-500" />
                  <code className="font-mono text-xs text-fg">{fix}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

export function TroubleshootingPage() {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return issues.filter(
      (issue) =>
        !needle ||
        `${issue.category} ${issue.title} ${issue.symptom} ${issue.causes.join(' ')} ${issue.fixes.join(' ')}`
          .toLowerCase()
          .includes(needle),
    );
  }, [query]);
  return (
    <>
      <PageHero
        index="16"
        eyebrow="Troubleshooting"
        title={
          <>
            Observe first.
            <br />
            <span className="text-brand-2">Change second.</span>
          </>
        }
        description="Most failures become straightforward once you identify the failing layer: provider, context, tool, MCP, policy, session, plugin or interface. Begin with the diagnostic snapshot."
        aside={
          <ExternalDoc path="docs/troubleshooting.md">
            Open canonical troubleshooting guide
          </ExternalDoc>
        }
      />
      <section className="site-section site-section--compact site-container">
        <SectionIntro
          index="01"
          eyebrow="First response"
          title="Run one command before changing state."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-[.72fr_1fr]">
          <div className="rounded-2xl border border-line bg-ink p-7 text-zinc-300">
            <div className="flex items-center gap-3">
              <Stethoscope className="size-5 text-brand" />
              <code className="font-mono text-sm font-black">wstack diag</code>
            </div>
            <p className="mt-5 text-sm leading-7 text-zinc-500">
              Prints version, provider, model, key status, features, MCP connections, tools,
              pipelines, context policy and session paths without mutating them.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {[
              'Provider + key',
              'Feature inventory',
              'MCP state',
              'Tool owners',
              'Pipeline overrides',
              'Session paths',
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 bg-card p-4 text-sm font-semibold text-muted"
              >
                <Check className="size-3.5 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-y border-line bg-surface">
        <div className="site-section site-section--short site-container">
          <SectionIntro
            index="02"
            eyebrow="Issue finder"
            title="Search by symptom, subsystem or command."
          />
          <label className="relative mt-10 block">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try: 401, timeout, MCP, context, permission…"
              className="h-12 w-full rounded-full border border-line bg-card pl-11 pr-4 text-sm text-fg outline-none focus:border-brand-2"
            />
          </label>
          <div className="mt-6 space-y-3">
            {filtered.map((issue) => (
              <IssueCard key={issue.title} issue={issue} />
            ))}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-line bg-card py-16 text-center text-sm text-muted">
                No matching issue. Run <code className="font-mono text-brand">wstack diag</code> and
                search the exact error text.
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="site-section site-container">
        <SectionIntro
          index="03"
          eyebrow="Escalation packet"
          title="Make a bug report reproducible without leaking secrets."
        />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {[
            [
              '01',
              'Diagnostic snapshot',
              'Include relevant wstack diag output after removing secrets and private paths.',
            ],
            [
              '02',
              'Exact steps',
              'Write the shortest sequence that reproduces the failure from a known state.',
            ],
            [
              '03',
              'Focused logs',
              'Attach a small --verbose excerpt around the error, not the entire session history.',
            ],
            [
              '04',
              'Environment',
              'Include OS, Node version, WrongStack version, surface and provider family.',
            ],
          ].map(([number, title, body]) => (
            <article key={number} className="bg-card p-6">
              <span className="font-mono text-xs font-black text-brand-2">{number}</span>
              <h2 className="mt-8 font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>
      <PageNext
        label="Getting started"
        title="Rebuild from a known-good baseline"
        body="Review installation, authentication, automatic project detection and first-run recipes."
        href="/getting-started"
      />
    </>
  );
}
