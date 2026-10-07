import {
  BrainCircuit,
  Check,
  FileSearch,
  GitGraph,
  Layers3,
  MemoryStick,
  ScanSearch,
  Tag,
  Telescope,
  Zap,
} from 'lucide-react';
import { ExternalDoc, PageHero, PageNext, SectionIntro } from '@/components/site/primitives';
import { Link } from '@/lib/router';

export function SagePage() {
  return (
    <>
      <PageHero
        index="14"
        eyebrow="SAGE"
        title={
          <>
            The agent remembers
            <br />
            <span className="text-brand">across sessions.</span>
          </>
        }
        description="SAGE is WrongStack's persistent, structured knowledge system. It remembers facts, conventions, decisions, and anti-patterns — then scores and injects the most relevant ones into every agent turn."
        aside={
          <ExternalDoc path="docs/sage/SYSTEM-REPORT.md">
            Open current SAGE architecture
          </ExternalDoc>
        }
      />

      {/* ── Three scopes ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="01"
          eyebrow="Three scopes"
          title="Store the right fact in the right place."
          description="Every memory lives in one of three isolation layers. The agent picks the right scope based on who needs the fact and how long it should live."
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-3">
          {[
            {
              icon: Layers3,
              label: 'Project agents',
              path: '.wrongstack/AGENTS.md',
              body: 'Shared agent instructions committed to the repository. Every agent working on this project sees these facts. Use for build commands, repo conventions, and team-wide rules.',
              tag: 'committed',
            },
            {
              icon: MemoryStick,
              label: 'Project memory',
              path: '~/.wrongstack/projects/<hash>/memory.md',
              body: 'Per-project agent notes that stay local to your machine. The agent discovers and remembers project-specific patterns, file paths, and workflow preferences automatically.',
              tag: 'local',
            },
            {
              icon: BrainCircuit,
              label: 'User memory',
              path: '~/.wrongstack/profiles/<name>/memory.md',
              body: 'Global personal memory shared across all your projects. Store your coding style, tool preferences, and personal conventions once — every project benefits.',
              tag: 'global',
            },
          ].map(({ icon: Icon, label, path, body, tag }) => (
            <article key={label} className="bg-card p-7">
              <Icon className="size-5 text-brand" />
              <div className="mt-8 flex items-center gap-2">
                <h2 className="text-lg font-black text-fg">{label}</h2>
                <span className="rounded-full border border-line bg-bg px-2 py-0.5 font-mono text-xs font-black uppercase text-faint">
                  {tag}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">{body}</p>
              <code className="mt-6 block font-mono text-xs text-faint break-all">{path}</code>
            </article>
          ))}
        </div>
      </section>

      {/* ── Entry anatomy ─────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="02"
            eyebrow="Entry anatomy"
            title="Every memory is typed, tagged, and prioritized."
            description="The agent doesn't dump raw text. Each entry carries structured metadata that the scoring engine uses to decide what gets injected."
          />
          <div className="mt-12 overflow-hidden rounded-2xl border border-line bg-ink">
            <div className="border-b border-white/10 px-6 py-4">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                Memory entry format
              </span>
            </div>
            <div className="p-6 font-mono text-sm">
              <div className="space-y-3 text-zinc-300">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand">type</span>
                  <span className="text-zinc-500">
                    fact · decision · convention · preference · reference · anti_pattern
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand">
                    priority
                  </span>
                  <span className="text-zinc-500">critical ⚡ · high ▲ · medium · low</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand">tags</span>
                  <span className="text-zinc-500">
                    #path · #build · #convention · #bug · #architecture
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand">source</span>
                  <span className="text-zinc-500">session ID or agent that created the entry</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-brand/20 px-2 py-0.5 text-xs text-brand">
                    confidence
                  </span>
                  <span className="text-zinc-500">
                    0.0–1.0 — low-confidence entries are injected less often
                  </span>
                </div>
              </div>
              <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
                  Serialized on disk
                </span>
                <code className="mt-3 block text-xs leading-6 text-zinc-400">
                  - [2026-07-13T10:30:00.000Z] [convention|high] mem_1720_a3f2b1c4 Use conventional
                  commits for all changes #git #commit
                </code>
              </div>
            </div>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Critical priority',
                body: 'High importance helps ranking, but never bypasses relevance, lifecycle or budget gates. Keep mandatory security rules in project instructions.',
              },
              {
                title: 'Anti-patterns',
                body: 'Anti-patterns share the durable-kind boost with facts, decisions, warnings and other durable kinds. They have no special +3 scoring bonus.',
              },
              {
                title: 'Confidence gate',
                body: 'Confidence contributes continuously to metadata quality alongside importance and freshness. Tool-result injection separately checks importance, relation strength and final score.',
              },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-xl border border-line bg-card p-5">
                <h3 className="font-black text-fg text-sm">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Relevance scoring ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="03"
          eyebrow="Relevance engine"
          title="Not every memory belongs in every turn."
          description="Tool-result retrieval uses concrete paths and queries to find related memories, then scores eligible candidates. Lifecycle, relevance, cooldown, diversity and character budgets can reduce the result below the configured eight-hint limit. Turn-context injection is a separate, opt-in path."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.72fr]">
          <div className="space-y-3">
            {[
              {
                icon: Telescope,
                title: 'Concrete relevance evidence',
                body: 'Exact anchors, informative query terms, tags and optional semantic recall establish relation strength. Generic coding words are ignored; metadata alone cannot manufacture relevance.',
              },
              {
                icon: Zap,
                title: 'Tool-result score composition',
                body: 'Metadata is (importance × 3 + confidence × 2 + freshness) / 6. The base score combines metadata × 0.48 with relation strength × 0.48, before boosts and penalties; the result is clamped to 0–1.',
              },
              {
                icon: Tag,
                title: 'Durability, anchors and proven use',
                body: 'Permanent entries add 0.08, long-lived entries 0.04 and short-lived entries subtract 0.08. Durable kinds and anchored entries each add 0.04. Recorded uses add a bounded boost; unanchored entries lose 0.05.',
              },
              {
                icon: FileSearch,
                title: 'Visibility and repetition gates',
                body: 'Freshness contributes to metadata rather than fixed +1/−1 age bonuses. Repeatedly injected but unused memories receive a penalty. Duplicate text, already-visible memories, cooldowns and output budgets further limit injection.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-line bg-card p-5">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div>
                    <h3 className="font-black text-fg text-sm">{title}</h3>
                    <p className="mt-1.5 text-xs leading-6 text-muted">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <aside className="rounded-2xl border border-line bg-ink p-7 text-zinc-300">
            <div className="font-mono text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
              Illustrative memory hints
            </div>
            <div className="mt-6 space-y-4 font-mono text-xs">
              <p className="text-zinc-500">
                You type: <span className="text-zinc-300">"fix the login timeout bug"</span>
              </p>
              <div className="rounded-lg border border-white/10 p-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
                  Fictional entries — not runtime ranking output
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-emerald-500">anchored</span>
                    <span className="text-zinc-300">
                      [<span className="text-brand">anti_pattern</span>] Auth token refresh races
                      with concurrent requests #auth #bug
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-emerald-500">related</span>
                    <span className="text-zinc-300">
                      [<span className="text-brand">fact</span>] Login timeout defaults to 30s in
                      production config #auth #timeout
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-zinc-500">context</span>
                    <span className="text-zinc-400">
                      [<span className="text-brand">reference</span>] auth module lives in
                      packages/auth/src #path #auth
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Storage backends ───────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="04"
            eyebrow="Storage backends"
            title="File system first, graph when you need it."
            description="Every WrongStack installation gets fast file-based memory with an inverted index. Enable the graph backend for relationship-aware traversal."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {[
              {
                icon: FileSearch,
                title: 'File backend',
                badge: 'default',
                items: [
                  'Markdown bullet files with atomic writes and file locking',
                  'Inverted word/tag index for O(1) exact-match search',
                  'Bounded substring fallback for partial-match recall',
                  'mtime-based cache invalidation — no stale reads',
                  'Automatic consolidation at 32 KB per scope',
                ],
              },
              {
                icon: GitGraph,
                title: 'Graph backend',
                badge: 'opt-in',
                items: [
                  'Co-occurrence edges: entries from the same remember() batch',
                  'Similarity edges: Jaccard overlap on word sets',
                  'Turn-based edges: entries created in the same LLM turn',
                  'findRelated() traversal for "what else should I know?" queries',
                  'Graph metadata persisted to memory-graph.json alongside entries',
                ],
              },
            ].map(({ icon: Icon, title, badge, items }) => (
              <article key={title} className="rounded-2xl border border-line bg-card p-7">
                <div className="flex items-center gap-3">
                  <Icon className="size-5 text-brand" />
                  <h2 className="text-xl font-black text-fg">{title}</h2>
                  <span className="rounded-full border border-line bg-bg px-2 py-0.5 font-mono text-xs font-black uppercase text-faint">
                    {badge}
                  </span>
                </div>
                <ul className="mt-6 space-y-3">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted">
                      <Check className="mt-1 size-3.5 shrink-0 text-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Consolidation ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="05"
          eyebrow="Consolidation"
          title="Clean up without losing knowledge."
          description="Deduplication runs automatically when a scope exceeds 32 KB. The optional post-session LLM pass is add-only; corrections and removals require explicit review."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-7">
            <ScanSearch className="size-5 text-brand" />
            <h2 className="mt-8 text-xl font-black text-fg">Automatic dedup</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              When a scope's total byte size crosses 32 KB (~8K tokens), the store runs a
              normalization pass: timestamps, IDs, type/priority badges, and tags are stripped, and
              duplicate normalized lines are removed. The original file is backed up before
              mutation.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-faint">
              <Check className="size-3.5 text-emerald-500" />
              Up to 5 consolidation backups are kept per scope
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-card p-7">
            <BrainCircuit className="size-5 text-brand" />
            <h2 className="mt-8 text-xl font-black text-fg">LLM consolidation</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              After sessions with enough iterations, an optional lightweight model pass reviews the
              conversation and proposes new facts to remember — add-only by design, with anchors
              grounded in files, symbols and commands. Corrections and removals go through explicit
              review flows, never the unattended consolidator.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-faint">
              <Check className="size-3.5 text-emerald-500" />
              Min 2 iterations before consolidation fires; skips trivial sessions
            </div>
          </div>
        </div>
      </section>

      {/* ── Auto-injection ─────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
          <SectionIntro
            index="06"
            eyebrow="Injection points"
            title="Memory reaches the agent at two critical moments."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {[
              {
                title: 'Turn context',
                body: 'When enabled, turn-context retrieval searches against the latest user message and applies a separate relevance/metadata gate. Up to 8 candidates are considered by default; duplicate, inactive or low-scoring entries and the character budget can reduce the rendered set.',
                detail: 'Configurable: Sage.inject.turnContext (default false; opt-in)',
              },
              {
                title: 'Tool results',
                body: 'After supported file, search and mutation tools return, related memory hints are surfaced alongside the result and retained as bounded provider-visible evidence. The default cap is 8 hints, subject to relevance and output budgets.',
                detail:
                  'Configurable: Sage.inject.toolResults (default true), maxHintsPerTool (default 8)',
              },
            ].map(({ title, body, detail }) => (
              <article key={title} className="bg-card p-7">
                <h2 className="text-xl font-black text-fg">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
                <code className="mt-5 block font-mono text-xs text-faint">{detail}</code>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Shared & verified ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="07"
          eyebrow="Shared and verified"
          title="Memory that travels with the project — and checks itself."
          description="Project knowledge follows the committed project identity across machines, other coding agents can read it, and every injected claim can be checked against the code it describes."
        />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {[
            {
              icon: GitGraph,
              title: 'HQ sync',
              body: 'With HQ enabled, project, file and symbol memories — updates and deletions included — replicate to every client that shares the committed project identity. Offline edits resolve by logical revision, never by clock time. User and session memories stay local.',
              detail: 'wstack sage sync  ·  headless bridge, no chat session',
            },
            {
              icon: Telescope,
              title: 'External agents',
              body: 'Claude Code, Codex, Cursor and Antigravity attach to the running project memory as an MCP server with a matching skill. They recall lexically and propose new memories, which enter WrongStack’s review queue instead of the store.',
              detail: 'wstack sage connect claude-code | codex | cursor | antigravity | all',
            },
            {
              icon: ScanSearch,
              title: 'Memory Companion',
              body: 'A read-only companion checks injected memories against at most four current project files and reports supported, outdated, contradicted, unverifiable or irrelevant — with exact source quotes. It cannot edit code or change memory.',
              detail: 'features.memoryCurator (default on)',
            },
            {
              icon: Check,
              title: 'Feedback and conditions',
              body: 'After real use, agents record useful, outdated, incorrect, irrelevant or uncertain with evidence. Outdated or incorrect opens a review candidate, never a silent deletion. A memory can state when it applies, with literal source checks.',
              detail: 'memory_update feedback  ·  remember validity',
            },
          ].map(({ icon: Icon, title, body, detail }) => (
            <article key={title} className="bg-card p-7">
              <Icon className="size-5 text-brand" />
              <h2 className="mt-6 text-xl font-black text-fg">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
              <code className="mt-5 block font-mono text-xs text-faint break-all">{detail}</code>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-5">
          <ExternalDoc path="docs/sage-feedback-lifecycle.md">SAGE feedback lifecycle</ExternalDoc>
          <ExternalDoc path="packages/sage-mcp/README.md">Connecting coding agents</ExternalDoc>
        </div>
      </section>

      {/* ── Tool integration ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <SectionIntro
          index="08"
          eyebrow="Operator surface"
          title="Commands and tools for memory work."
          description="You do not edit markdown files by hand. The agent and its tools manage memory automatically — but you can inspect and control it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: '/memory search',
              body: 'Find entries by keyword or phrase across any scope. The inverted index returns O(1) exact matches with substring fallback.',
            },
            {
              label: '/memory graph',
              body: 'Open the graph explorer when the graph backend is active. Traverse co-occurrence and similarity edges.',
            },
            {
              label: '/memory verify',
              body: 'Check memory file integrity. Detect and report parse errors, duplicate IDs, and corrupted lines.',
            },
            {
              label: '/memory hygiene',
              body: 'Clean stale or low-confidence entries. Runs consolidation and reports what was removed.',
            },
          ].map(({ label, body }) => (
            <div key={label} className="rounded-xl border border-line bg-card p-5">
              <code className="font-mono text-sm font-black text-brand">{label}</code>
              <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: '/memory import',
              body: 'Load memories from external markdown files or JSON exports into any scope.',
            },
            {
              label: 'remember tool',
              body: 'The agent calls this automatically after discovering a new fact, convention, or decision.',
            },
            {
              label: 'forget tool',
              body: 'Remove entries by content substring or exact memory ID. The agent uses it during hygiene.',
            },
            {
              label: 'find_related_memories',
              body: 'Graph traversal for "what else is relevant?" queries. Falls back to content search without the graph backend.',
            },
          ].map(({ label, body }) => (
            <div key={label} className="rounded-xl border border-line bg-card p-5">
              <code className="font-mono text-sm font-black text-brand">{label}</code>
              <p className="mt-2 text-xs leading-5 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-5">
          <Link href="/commands/memory" className="text-sm font-bold text-brand">
            /memory command reference →
          </Link>
          <ExternalDoc path="docs/slash/memory.md">Memory slash command docs</ExternalDoc>
        </div>
      </section>

      {/* ── Configuration ──────────────────────────────────────────────── */}
      <section className="border-t border-line bg-ink text-white">
        <div className="mx-auto max-w-[1380px] px-4 py-20 sm:px-6 lg:px-10">
          <SectionIntro index="09" eyebrow="Configuration" title="Tune memory to your workflow." />
          <div className="mt-12 overflow-hidden rounded-2xl border border-white/10">
            <div className="border-b border-white/10 px-6 py-4">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                Active profile config.json → Sage
              </span>
            </div>
            <div className="p-6 font-mono text-sm leading-7 text-zinc-300">
              <span className="text-zinc-600">{'{'}</span>
              <br />
              <span className="text-zinc-600"> "Sage": {'{'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"enabled"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-emerald-400">true</span>
              <span className="text-zinc-600">,</span>
              <span className="text-zinc-700">{' // toggle the entire subsystem'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"storage"</span>
              <span className="text-zinc-600">: {'{'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"projectLocal"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-emerald-400">true</span>
              <span className="text-zinc-600">,</span>
              <span className="text-zinc-700">{' // store inside .wrongstack/memories'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"directory"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-amber-300">".wrongstack/memories"</span>
              <br />
              <span className="text-zinc-600"> {'}'},</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"inject"</span>
              <span className="text-zinc-600">: {'{'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"turnContext"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-emerald-400">false</span>
              <span className="text-zinc-600">,</span>
              <span className="text-zinc-700">
                {' // opt in to bounded turn-context retrieval'}
              </span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"toolResults"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-emerald-400">true</span>
              <span className="text-zinc-600">,</span>
              <span className="text-zinc-700">{' // append hints to read/grep/tree output'}</span>
              <br />
              <span className="text-zinc-600"> </span>
              <span className="text-zinc-500">"maxHintsPerTool"</span>
              <span className="text-zinc-600">: </span>
              <span className="text-amber-300">8</span>
              <br />
              <span className="text-zinc-600"> {'}'}</span>
              <br />
              <span className="text-zinc-600"> {'}'}</span>
              <br />
              <span className="text-zinc-600">{'}'}</span>
            </div>
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <p className="text-sm leading-6 text-zinc-400">
              <strong className="text-white">Sandbox survival:</strong> when the global root is a
              temporary directory (opencode, CI sandboxes), memory files are mirrored to the project
              tree automatically. Memory never disappears between sessions.
            </p>
          </div>
        </div>
      </section>

      <PageNext
        label="Memory & sessions"
        title="Understand the other continuity stores"
        body="Session logs reconstruct what happened. Checkpoints capture reversible file state. Compaction keeps the model window healthy."
        href="/memory"
      />
    </>
  );
}
