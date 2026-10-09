# Skill Writing Guide

For reusable executable project capabilities with parameter schemas, verification
and execution history, use [Project Kit](./project-kit.md). Skills can explain
when to use a kit; its manifest owns the executable contract.

Skills are Markdown files that inject domain-specific knowledge into the agent's system prompt. The model selects relevant skills from their descriptions and loads instructions with the skill tool. Use `/skill use <name> <task>` for explicit selection.

---

## Quick start

```
<project>/.wrongstack/skills/
  my-skill/
    SKILL.md        ← this is the only required file
```

A skill is a directory containing a `SKILL.md` file with YAML frontmatter. That's it.

```markdown
---
name: my-skill
description: |
  One-sentence summary of what this skill covers and when to activate it.
  The agent reads this description to decide whether the skill is relevant.
version: 1.0.0
---

# My Skill

Body content injected into the system prompt when the skill activates.
Keep it concise, actionable, and focused on one domain.
```

---

## File format

### Frontmatter (required)

| Field | Required | Description |
|---|---|---|
| `name` | ✅ | Unique identifier. Lowercase letters, digits, hyphens; must match the parent directory (agentskills.io). First-seen wins on collisions across layers. |
| `description` | ✅ | A 1–1024 character description of what the skill does and when to use it. The progressive catalog includes the complete description. |
| `trigger` | ❌ | Explicit "Use when…" trigger shown in the available-skills list. Optional — defaults to the first sentence of `description`. |
| `audience` | ❌ | `roster` — attached to roster roles by name and kept out of the main agent's prompt; `external` — shipped for other coding agents and kept out of WrongStack prompts. Both stay loadable with the `skill` tool. Omit for skills every agent should see. |
| `version` | ❌ | SemVer string. Informational only — not used for comparison. |
| `license` | ❌ | License name or bundled license file (agentskills.io). |
| `compatibility` | ❌ | Environment requirements — intended product, system packages, network (agentskills.io). |
| `metadata` | ❌ | Arbitrary key-value map. |
| `allowed-tools` | ❌ | Space-separated tools (experimental, agentskills.io). Informational only — parsed and displayed, never enforced. |

### Body (required)

Everything after the frontmatter delimiter (`---`) is the skill content. Progressive mode delivers it as a skill-tool result; eager mode injects it into the system prompt within its budget. Keep it under 2000 tokens — the system prompt has a budget.

---

## Discovery

Skills are discovered at boot across the layers below. The first layer with a given `name` wins — `.wrongstack` skills shadow foreign and bundled ones.

| Priority | Location | Scope | Use case |
|---|---|---|---|
| 1 (highest) | `<project>/.wrongstack/skills/` | Per-project, committed to git | Repo-specific conventions, build system quirks, team standards |
| 2 | `<project>/.claude/skills/` | Per-project, foreign (read-only) | Skills authored for Claude Code |
| 3 | `<project>/.{codex,cursor,agents,gemini,qwen,trae,windsurf}/skills/` | Per-project, foreign (read-only) | Skills authored for other coding agents (Cursor uses `skills-cursor`) |
| 4 | `~/.wrongstack/profiles/<name>/skills/` | Per-profile, not committed | Profile-specific preferences and habits |
| 5 | `~/.claude/skills/` | Per-user, foreign (read-only) | Your Claude Code user-level skills |
| 6 | `~/.{codex,cursor,agents,gemini,qwen,trae,windsurf}/skills/` | Per-user, foreign (read-only) | Your skills in other coding agents |
| 7 | `config.skills.extraDirs` | User-config only | Any extra directory (stripped from in-project config) |
| 8 (lowest) | Bundled with `@wrongstack/core` | Ships with the package | General-purpose skills (git-flow, bug-hunter, etc.) |

Use `/skill diagnostics` to inspect the winning source and path for each name,
the paths of shadowed copies, rejected metadata, and progressive prompt exclusion
reasons. With a session context, it checks required capabilities and tools against
the host catalog, including on-demand tools. Without that context, runtime
availability is explicitly unchecked. Hidden audiences remain separately listed;
prompt eligibility does not guarantee that a skill body can activate successfully.

### Directory structure

```
<skill-name>/
  SKILL.md            ← required: metadata + instructions
  scripts/            ← optional: executable code (the agent runs via bash)
  references/         ← optional: docs loaded on demand (REFERENCE.md, …)
  assets/             ← optional: templates, data, snippets
  …                   ← any other files/subdirectories
```

The loader discovers a skill by its `SKILL.md`; the other files are **bundled resources** the agent loads on demand via the `skill` tool (see [Progressive disclosure](#progressive-disclosure--the-skill-tool)). Keep `SKILL.md` under ~500 lines and move deep material into `references/`.

---

## Cross-agent compatibility (`.claude/skills` + other agents)

WrongStack reads skills authored for other coding agents **natively** — no copying required. Every agent below uses the same [agentskills.io](https://agentskills.io/specification) `SKILL.md` format, so WrongStack discovers and injects them just like a native skill:

| Tool | User dir | Project dir |
|---|---|---|
| Claude Code | `~/.claude/skills` | `<project>/.claude/skills` |
| OpenAI Codex | `~/.codex/skills` | `<project>/.codex/skills` |
| Cursor | `~/.cursor/skills-cursor` | `<project>/.cursor/skills-cursor` |
| Gemini CLI | `~/.gemini/skills` | `<project>/.gemini/skills` |
| Qwen Code | `~/.qwen/skills` | `<project>/.qwen/skills` |
| Trae | `~/.trae/skills` | `<project>/.trae/skills` |
| Windsurf | `~/.windsurf/skills` | `<project>/.windsurf/skills` |
| Shared (`asm` / agentskills.io) | `~/.agents/skills` | `<project>/.agents/skills` |

All foreign layers are **read-only** — the installer never writes there. To edit or commit a foreign skill, import it with `/skill-import` (below). A skill discovered earlier in the priority order shadows a same-named one discovered later, so `.wrongstack` always wins over foreign; and deduplication is by name, so the same skill symlinked into several agent dirs appears once.

Control which foreign tools are scanned with `skills.foreignSources` (default: all known tools) and `skills.readClaudeSkills` (default: `true`).

## Configuration (`config.skills`)

| Field | Default | Description |
|---|---|---|
| `readClaudeSkills` | `true` | Read the `.claude/skills/` layers (project + user). |
| `foreignSources` | `true` (all) | Scan other agents' skill dirs (`~/.codex/skills`, `~/.cursor/skills-cursor`, `~/.agents/skills`, …). Pass a tool-id list to restrict, or `false` to disable. |
| `mode` | `'progressive'` | `'progressive'` injects only a name+trigger manifest (the agent loads bodies via the `skill` tool); `'eager'` injects skill bodies into the prompt up to `eagerMaxChars`. |
| `eagerMaxChars` | `24000` | In eager mode, the total chars of skill bodies injected (highest-priority first); the rest become a load-on-demand manifest. Bounds prompt cost when many skills are discovered. Ignored in progressive mode. |
| `extraDirs` | `[]` | Extra directories to scan (lowest priority). **User config only** — stripped from a repo-committed `<project>/.wrongstack/config.json`. |
| `localSuggest` | `true` | Local, API-free bundled recommendations before each model call, with bounded primary-body preload. Explicit selections take precedence. |
| `suggest` | off | Per-turn skill suggestion via TypeSafe. **User config only** — the whole subtree is stripped from a repo-committed config. See [skills-suggestion.md](./skills-suggestion.md). |

## Progressive disclosure & the `skill` tool

By default (`mode: 'progressive'`) WrongStack follows the agentskills.io three-tier model: the prompt carries each skill's name, full description, and optional trigger, and the agent calls the **`skill`** tool to load a skill's full body on demand. Set `skills.mode: 'eager'` to inject discovered skill bodies into the system prompt up to the configured budget instead. The default local recommendation engine can additionally preload one task-matched primary body (at most 12,000 characters) into a volatile block without a model search/load request. It still requires actual tool loading for supporting resources or explicit loading gates.

Discovery and context ordering are deterministic: layers are traversed by priority and entries inside each layer are sorted by skill name. The progressive manifest preserves each skill's full description and additional explicit trigger, removing duplicate text within that row. It excludes `roster`/`external` audiences and skills whose required capabilities or tools are unavailable. Optional capabilities do not exclude a skill. In eager mode, bodies are added in the same stable order until `eagerMaxChars`; overflow remains in the manifest. In progressive mode, the manifest is the context contract and the `skill` tool is the deterministic body/resource loading path.

The `skill` tool also handles **bundled resources** (tier 3) — scripts, references, assets, any subdirectory:

- `skill({ name: "docker-deploy" })` → the SKILL.md body + a recursive listing of every bundled file.
- `skill({ name: "docker-deploy", resource: "references/COMPOSE.md" })` → that file's content.
- Scripts come back with an absolute path; the agent runs them via `bash`.

Use the `skill` tool (not `read`) for skill resources: it works for foreign skills that live outside the project root (`~/.claude/skills/…`, `~/.cursor/skills-cursor/…`), which a project-root-restricted `read` tool may refuse.

```jsonc
// ~/.wrongstack/profiles/<name>/config.json
{ "skills": { "mode": "eager" } }
```

## Suggesting which skill to load

The default local engine (`skills.localSuggest: true`) recommends bundled skills
before each model call, independently of skill-search and Jev. It matches curated
TR/EN task terms, checks the effective catalog and runtime tools, and preloads a
bounded complete primary body when possible. Simple conversation stays silent;
explicit selections and completed opt-in remote judgments take precedence.

At a few dozen skills, a name + trigger line is not always enough for the agent
to tell close neighbours apart (`design-craft` vs `design-critique`), and the
manifest's "load a skill when one is relevant" instruction invites a guess on
turns where nothing is. `skills.suggest` puts two cheap typed judgments in front
of that decision and appends at most one skill name to the prompt as a
suggestion the model is told it may ignore.

It is **off by default** because it sends the latest user message to a
third-party API. See [skills-suggestion.md](./skills-suggestion.md) for the
design, the settings, what leaves the machine, and how to evaluate the
thresholds against your own roster.

The same typed-judgment approach is available for **role dispatch** — picking
which of the ~79 catalog agents takes an ambiguous task — in
[fleet-dispatch-classifier.md](./fleet-dispatch-classifier.md). Both share one
`typesafe` account block; neither is enabled by configuring it.

## Importing skills (`/skill-import`)

Foreign skills are usable as-is, but to **own, edit, or commit** one, import it into `.wrongstack/skills/`:

```
/skill-import --from cursor             # copy project .cursor/skills-cursor → .wrongstack/skills
/skill-import --from codex --global     # copy ~/.codex/skills
/skill-import --from claude             # copy project .claude/skills (--from-claude alias)
/skill-import /abs/path/to/skills       # copy from any directory
/skill-import --from trae --link        # symlink instead of copy (falls back to copy on Windows w/o Dev Mode)
```

`--from <tool>` resolves each agent's skill dir automatically (cursor's `skills-cursor` included). Known tools: `claude`, `agents`, `codex`, `gemini`, `cursor`, `qwen`, `trae`, `windsurf`.

---

## Bundled routing

Every bundled entrypoint includes an English/Turkish selection card, an initial
action and acceptance guidance. For exact single-technology work, load the
specialist directly. For ambiguous or multi-domain work, load `skill-router` and
consult its complete selection map and overlap decisions. Progressive, eager and compact prompts
surface this routing rule when the maintained bundled router is runtime-eligible,
including eager/compact body-budget overflow.

The router covers actual bundled ids, including their audience restrictions.
A skill does not grant tools or permissions. Version snapshots must be refreshed
through `tech-stack` before new setups/upgrades; failed checks remain unverified.

## Bundled skills

WrongStack ships with 99 bundled skills:

| Skill | Description |
|---|---|
| `accessibility` | Semantic controls, keyboard/focus behavior and evidenced WCAG checks |
| `angular-modern` | Build and upgrade Angular applications with typed components, reactive state, dependency injection and verified routing |
| `api-design` | REST API design, error codes, pagination, auth patterns |
| `astro-modern` | Build and upgrade Astro content sites and applications with deliberate islands, content contracts and rendering modes |
| `audio-studio` | Current music/TTS models, soundtrack prompts and validated audio delivery |
| `audit-log` | Session log parsing, anomaly detection, cost and tool usage analysis |
| `authentication-sessions` | Implement application sign-in, sessions and identity integration with explicit account/tenant authorization |
| `auto-review` | Configure and operate the built-in continuous code-review plugin |
| `backup-recovery` | Design and verify backups and restoration for owned databases, files and application state |
| `bug-hunter` | Systematic bug and code smell detection, severity ranking |
| `chimera` | Post-session code quality review of changed files |
| `ci-cd` | Reproducible CI, exact-source artifacts and deployment evidence |
| `cloud-architecture` | Choose and design cloud services from concrete application, data, availability and operational requirements |
| `cloudflare-workers` | Worker runtime, typed bindings, isolation and deployment verification |
| `code-quality` | Source-confirmed unused code, dependencies and bundle waste |
| `code-review` | On-demand review of a PR, branch, or diff: blast radius and severity-ranked findings |
| `codebase-navigation` | Orient, locate, and trace code with the codebase index before reading files |
| `codex-adversarial-review` | Read-only adversarial review with an explicit fix-confirmation boundary |
| `compose-operations` | Operate and evolve multi-service Docker Compose environments with explicit networks, volumes and environment boundaries |
| `container-debugging` | Diagnose reported container build, startup, network, permission and resource failures |
| `container-hardening` | Review and improve container image/runtime protection for an owned application with tested compatibility |
| `data-governance` | Schema ownership, PII handling, retention, lineage, access policy, migration safety |
| `database-development` | Implement database access, models and queries with explicit consistency, transactions and bounded results |
| `database-migrations` | Schema evolution, bounded backfills and tested recovery |
| `debugging` | Root-cause an observed failure: reproduce, localize, fix at the cause, prove it |
| `design-assets` | Prepare icons, SVGs, images, fonts and illustrations for product use with correct rights, formats and rendering |
| `design-craft` | Product-specific composition, typography, content and rendered critique |
| `design-critique` | Scored, evidenced audit of an existing UI across structure, type, color, surface, states, and copy |
| `design-system` | Build consistent interfaces from shared visual tokens and component rules |
| `design-to-code` | Implement supplied Figma designs, screenshots or design specifications as working interfaces |
| `docker-deploy` | Docker containerization, multi-stage builds, image scanning |
| `dotnet-backend` | Build and upgrade ASP.NET Core services with typed contracts, dependency lifetimes and verified persistence |
| `evidence-audit` | Proof-driven audit rounds: reproduce, apply a scope-only fix, verify, and promote high-risk regressions |
| `flutter-mobile` | Build and upgrade Flutter applications with typed state, navigation, platform plugins and device verification |
| `git-flow` | Commit message style, branch hygiene, safe history operations |
| `go-services` | Build and upgrade Go services, workers and CLI applications with context propagation and explicit ownership |
| `graphql-development` | Build and evolve GraphQL schemas/resolvers with typed contracts, authorization and bounded query work |
| `i18n-localization` | Implement localization with translated messages, locale-aware formatting and adaptable layouts |
| `incident-response` | Diagnose and recover an owned service incident with bounded changes, timeline evidence and verified health. Use during outages, bad deployments or data/service degradation; preserve evidence and separate mitigation from root-cause repair |
| `infrastructure-as-code` | Build and maintain Terraform, OpenTofu, Pulumi or cloud-native IaC with reviewable plans and protected state |
| `interaction-design` | Design and implement task-oriented interaction flows, forms, navigation and recovery states |
| `java-spring` | Build and upgrade Java/Spring services with explicit transaction, concurrency and deployment contracts |
| `kotlin-android` | Build and upgrade native Android applications with Kotlin, Compose/View UI and lifecycle-aware work |
| `kubernetes-operations` | Operate and deploy owned Kubernetes workloads with explicit cluster, namespace and rollout identity |
| `linux-service-ops` | Configure and troubleshoot application services on an authorized Linux host with explicit service ownership |
| `mailbox-bridge` | Loopback HTTP bridge that exposes the project's shared WrongStack mailbox so external agents (Claude Code, Aider, scripts) can read, send, and acknowledge messages |
| `manim-video` | Manim Community mathematical/scientific animation and rendered video |
| `mcp-development` | Versioned MCP contracts, schemas, transport and lifecycle |
| `media-production` | Renderer selection across Remotion, Motion Canvas, Manim, AI and FFmpeg |
| `mnemosyne` | Deterministic and LLM-supported curation of SAGE memory entries |
| `mobile-design` | Design and implement mobile interfaces for touch, keyboards, safe areas and native navigation |
| `mobile-performance` | Measure and improve mobile startup, scrolling, animation and resource usage on representative devices |
| `mobile-release` | Prepare and verify signed mobile releases, test-channel distribution and store submission artifacts |
| `motion-canvas-video` | TypeScript generator scenes, narration cues and Motion Canvas export |
| `motion-design` | Current Motion/GSAP/CSS animation with reduced motion and cleanup |
| `multi-agent` | Leader/worker roles, task delegation, result aggregation, fleet management |
| `nextjs-modern` | Latest stable Next.js 16 App Router, Server Actions and explicit cache policy |
| `node-backend` | Build and upgrade Node.js HTTP services with typed validation, lifecycle ownership and production behavior |
| `node-modern` | Latest stable Node/Bun, module compatibility and resource ownership |
| `observability` | Structured logging, traces, metrics, redaction, instrumentation |
| `office-documents` | Word/Excel/PowerPoint/PDF generation, recalculation and visual verification |
| `offline-sync` | Implement offline-capable applications with local persistence, queued changes and explicit synchronization conflicts |
| `output-standards` | Output formatting standards, `<nextsteps>` conventions |
| `payments-webhooks` | Implement payment-provider integration and reliable authenticated webhook processing for an owned application |
| `php-laravel` | Build and upgrade PHP/Laravel applications with validated requests, policy authorization and reliable jobs/data access |
| `plugin-author` | Creating, reviewing, or refactoring a WrongStack plugin |
| `prompt-engineering` | System prompt design, tool descriptions, trigger sentences |
| `python-backend` | Build and upgrade Python services with explicit environments, validation, async boundaries and resource cleanup |
| `queues-jobs` | Implement reliable asynchronous jobs and message consumers with explicit delivery, retry and shutdown semantics |
| `react-modern` | Current React component/action/effect semantics and framework boundaries |
| `react-native-expo` | Build and upgrade React Native or Expo applications with navigation, native modules and verified platform integration |
| `realtime-systems` | Implement WebSocket, SSE or established realtime transports with explicit authentication, ordering and reconnect behavior |
| `refactor-planner` | Dependency mapping, risk assessment, phased planning, migration strategy |
| `release-rollback` | Plan and execute authorized release promotion or rollback with exact artifact and data compatibility |
| `remote-debugging` | Diagnose a reported application failure on explicitly authorized remote hosts using bounded logs and runtime evidence |
| `research-web` | Web research methodology — disciplined search + fetch workflow, source validation, cross-referencing, structured context-manager injection |
| `reverse-proxy-tls` | Configure and troubleshoot reverse proxies, HTTPS, domains and upstream routing for an authorized application |
| `rust-systems` | Build and upgrade Rust services, CLI and systems components with explicit error, async and resource contracts |
| `sdd` | Spec parsing, task graph generation, dependency tracking, done-condition execution |
| `security-scanner` | Code and configuration security vulnerability scanning |
| `skill-creator` | Guide to creating new WrongStack skills with YAML frontmatter |
| `skill-router` | Choose specialists and order ambiguous or multi-domain workflows using the bundled selection map |
| `ssh-operations` | Connect to and administer explicitly authorized hosts through OpenSSH with verified identity and bounded operations |
| `storage-uploads` | Implement owned file/object storage and upload/download flows with validated metadata, access and lifecycle |
| `sveltekit-modern` | Build and upgrade Svelte and SvelteKit applications with reactive state, server loads, actions and deployment adapters |
| `swift-ios` | Build and upgrade native iOS applications with Swift, SwiftUI/UIKit and correct lifecycle/concurrency ownership |
| `tech-stack` | Latest stable registry verification, migration and compatibility evidence |
| `testing` | vitest patterns, mocking, coverage, unit/integration/e2e test strategy |
| `threejs-3d` | Current Three.js/R3F, renderer compatibility and GPU resource ownership |
| `typescript-strict` | Strict null checks, exhaustive switch, branded types, discriminated unions |
| `verify-before-done` | Prove a change works with the project's own checks before reporting it done |
| `visual-regression` | Detect unintended UI changes with reproducible rendered screenshots and reviewed baselines |
| `vps-deploy` | Deploy an owned application to an explicitly authorized VPS with versioned artifacts, service identity and live health evidence |
| `vue-nuxt` | Build and upgrade Vue or Nuxt applications with reactive state, server rendering and typed data boundaries |
| `web-performance` | LCP/INP/CLS and matched before/after browser profiling |
| `web-platform-baseline` | Dated, refreshable modern CSS/HTML/a11y facts with a staleness rule — never assert browser support from memory |
| `wrongstack-kanban` | Deterministic Kanban task lifecycle, verification, and evidence enforcement |
| `wrongstack-mailbox` | External-facing client for the project's shared WrongStack mailbox — register as an online agent, read messages, send replies, broadcast, and stay visible in the WebUI fleet |
| `wrongstack-mailbox-mcp` | Coordinate with agents through the project-scoped Mailbox MCP server |

Versioned recommendations are checked against live registries and official sources.
The dated snapshot is in [tech-stack/current-versions](../packages/core/skills/tech-stack/references/current-versions.md);
refresh it before installations or upgrades. Latest stable packages can have
incompatible peers: Motion Canvas 3.17.2 currently declares Vite 4/5, not Vite 8.
Expo SDK and Angular compiler combinations also require their documented
compatibility matrix. A latest registry tag can point to a preview; the
[live version helper](../packages/core/skills/tech-stack/scripts/check-versions.mjs)
reports stable selections, preview tags, engines and peer requirements.

The expanded catalog covers design handoff/interaction/visual checks; mobile
frameworks, native platforms and release; authorized SSH/Linux operations;
containers, VPS/proxy/rollback/recovery; web and backend frameworks; databases,
queues, realtime, storage, auth, billing, localization and cloud/IaC workflows.
Load the relevant skill and its conditional references; do not activate every
framework merely because it appears in the catalog.

Run the read-only bundle authoring check from the repository root:

```powershell
bun run packages/core/skills/skill-creator/scripts/check-bundle.ts
```

Compact SKILL.save.md variants are active runtime instructions, not backup files.
They must be kept consistent with their full runbooks.

Override any bundled skill by creating a project- or user-level skill with the same `name`.

---

## Roster roles vs. skills

A skill is a passive Markdown file. A **roster role** is a TypeScript subagent definition. They reach the agent through completely different paths, which is why some names you'll see in the CLI — most notably `shadow-agent` — never appear in the bundled-skills table above.

| | Skill | Roster role |
|---|---|---|
| What it is | `SKILL.md` with YAML frontmatter | TypeScript `SubagentConfig` object |
| Where it lives | `packages/core/skills/<name>/SKILL.md` (or `~/.wrongstack/profiles/<name>/skills/`, `<project>/.wrongstack/skills/`) | `packages/core/src/coordination/fleet.ts` (or related agent modules) |
| How it reaches the agent | Injected into the system prompt via `DefaultSkillLoader` when `DefaultSystemPromptBuilder` builds the prompt | Spawned via `spawn_subagent { role: '<id>' }` and runs in its own context/budget |
| Who maintains it | Humans (with AI assistance via `/skill-gen`) | WrongStack core team — compiled into the binary |
| Listed in `/skill` | Yes | No |
| Listed in `fleet (action: status)` | No | Yes |

### Example: `shadow-agent`

`shadow-agent` is a roster role, not a skill. Its lazy prompt-backed configuration is defined in `packages/core/src/coordination/fleet.ts` and uses `SHADOW_AGENT_SKILLS` from `packages/core/src/coordination/agents/role-skills.ts`. The roster catalog in `packages/core/src/coordination/fleet.ts` registers it under the key `'shadow-agent'`. You start it with:

```
spawn_subagent { role: 'shadow-agent', task: '...', maxIterations: 12 }
```

The fleet configuration and bundled agent prompt define the role. Project-developed
agent identity and skills live under `.wrongstack/agents/`; an installed
`.wrongstack/skills/shadow-agent/SKILL.md` is a local skill, not the fleet role
definition. See [agent identity and learning](slash/agent-improve.md).

Other roster roles follow the same pattern (see `packages/core/src/coordination/agents/`). If you're looking for "how do I make the agent smarter about X", you almost always want to write a skill. If you're looking for "how do I spawn a specialized subagent that runs X", you want a roster role.

---

## Writing effective skills

### Description quality

The `description` field is the trigger. The agent reads it to decide whether the skill is relevant to the current task. Make it:

- **Specific**: "Use this skill when writing or reviewing React 19+ code" ✅
- **Not too broad**: "General programming help" ❌
- **Action-oriented**: "Use when proposing, creating, or reviewing git commits" ✅
- **Scope-limited**: Include what the skill does NOT cover if there's ambiguity

### Body structure

```markdown
---
name: example
description: |
  Use this skill when doing X. Covers Y and Z.
version: 1.0.0
---

# Title

One-line summary of the skill's purpose.

## Section 1 — Domain rules

- Rule 1
- Rule 2
- Rule 3

## Section 2 — Patterns

| Pattern | When to use | Example |
|---|---|---|
| A | When X | `code example` |
| B | When Y | `code example` |

## Anti-patterns

- Don't do X because Y.
- Avoid Z — it causes W.
```

### Token budget

The system prompt has a finite context window. Skills that are too long will be truncated or will crowd out other important context. Guidelines:

- **Target**: 200–800 tokens per skill
- **Hard limit**: ~2000 tokens (the loader doesn't enforce this, but the compactor will trim)
- **Tip**: Use tables and bullet points over prose. Code examples should be minimal — show the pattern, not the full implementation.

### Common mistakes

| Mistake | Why it's bad | Fix |
|---|---|---|
| Too broad description | Activates on irrelevant tasks, wastes context | Narrow the trigger to specific scenarios |
| No examples | Agent can't infer the pattern from rules alone | Add at least one concrete code example |
| Too long | Crowds out other skills and user messages | Split into multiple focused skills |
| Duplicate name | Shadows the other skill silently | Use unique, descriptive names |
| No anti-patterns | Agent may apply the skill incorrectly | List what NOT to do |

---

## Viewing discovered skills

```bash
# CLI subcommand
wrongstack skills

# Slash command (in REPL/TUI)
/skill
```

Both show the skill name, source layer (project / user / bundled), and description.

---

## Example: Project-specific skill

```markdown
---
name: acme-conventions
description: |
  Use this skill when writing or modifying code in the acme-web repository.
  Covers naming conventions, test patterns, and deployment rules specific to Acme.
version: 1.0.0
---

# Acme Web Conventions

## Naming

- Components: PascalCase (`UserProfile.tsx`)
- Hooks: `use` prefix (`useUserData.ts`)
- Utilities: camelCase (`formatDate.ts`)
- Constants: SCREAMING_SNAKE (`MAX_RETRIES`)

## Testing

- Unit tests co-located: `foo.ts` → `foo.test.ts`
- Integration tests in `tests/integration/`
- Use `vi.mock()` for external deps, never for internal modules
- Run `pnpm test` before every commit

## Deployment

- `main` = production, `develop` = staging
- Never push directly to `main` — use PRs
- CI runs lint + typecheck + test on every PR
```

Save as `<project>/.wrongstack/skills/acme-conventions/SKILL.md` and commit it.

---

## Installing, searching, and authoring skills

WrongStack ships a toolkit of slash commands (the first-party `wstack-skills`
plugin) for discovering, installing, and creating skills:

| Command | Purpose |
|---|---|
| `/skill` | List available skills or show one skill's body. |
| `/skill-search <query>` | Search the skill registry (skills.sh) for installable skills. |
| `/skill-install <ref>` | Install from `<user/repo[@ref]>`, `skills.sh:<owner/repo>`, or any registry id. |
| `/skill-import [--from <tool>]` | Take ownership of a foreign agent's skill (copy/symlink into `.wrongstack/skills`). |
| `/skill-update [name]` | Re-fetch installed skills from their source. |
| `/skill-uninstall <name>` | Remove an installed skill. |
| `/skill-gen` | Authoring toolkit — see below. |

### Searching the registry

`/skill-search` queries [skills.sh](https://www.skills.sh/docs). Results include
an installation reference selecting the matching skill. Security scores are
shown only when supplied by a registry; the default search response does not
provide them.

```
/skill-search react
```

To point at a self-hosted skills-api instance, set `config.skills.registryUrl`
in the active profile config. This field is **stripped from repo-committed
config** (`<project>/.wrongstack/config.json`) because the parsed registry
response flows into the prompt — a repo-controlled URL would be an
SSRF / prompt-injection vector.

### Installing

```
/skill-install octocat/react-pro              # GitHub, default branch
/skill-install octocat/react-pro@v2.0.0       # GitHub, specific ref
/skill-install skills.sh:octocat/react-pro    # registry-resolved
/skill-install octocat/react-pro --global     # → ~/.wrongstack/profiles/<name>/skills/
```

**Private repos:** set `GITHUB_TOKEN` (or `GH_TOKEN`) in your environment. The
token is sent as `Authorization: Bearer <token>` to the GitHub API; without it
only public repos work and the anonymous 60/hour rate limit applies.

Supports both single-skill repos (`SKILL.md` at root) and multi-skill repos
(`skills/<name>/SKILL.md`).

### Authoring with `/skill-gen`

`/skill-gen` is a toolkit with sub-commands for the mechanical parts of skill
creation (validation, scaffolding) plus an AI-guided wizard for the open-ended
parts:

| Sub-command | Purpose |
|---|---|
| `/skill-gen` (bare) | AI-guided wizard — you answer questions, the agent writes the file. |
| `/skill-gen skeleton <name> --desc "..." --trigger a,b` | Generate a valid SKILL.md skeleton to edit. |
| `/skill-gen from-prompt "<text>"` | Turn a prompt into a skill draft. |
| `/skill-gen validate <name>` | Validate an existing document, or check a proposed name before writing. |
| `/skill-gen view <name>` | Show a skill's body (read-only). |
| `/skill-gen edit <name>` | Open a skill in `$EDITOR` / `$VISUAL`. |
| `/skill-gen list` | List skills with their source layer. |

The bundled `skill-creator` skill (loaded into the prompt) is the wizard's
brain — it holds the authoring rules and workflow. Always run
`/skill-gen validate <name>` after writing a new skill to confirm it loads.

## Authoring validation and refresh

`/skill-gen validate <name>` validates an existing skill document (YAML, name, directory agreement, field limits, metadata, and body). If the file does not exist, it checks the proposed name. Skeleton/from-prompt and WebUI changes refresh the loader automatically. Use `/skill reload` after editing files outside those flows.

`/skill use <name> <task>` explicitly asks the agent to load and follow the skill for the supplied task. `/skill <name>` previews it.

The tool reports `nextOffset` when a body or resource needs another page. Continue with `skill({ name, offset: nextOffset })`, or include the same `resource` when reading a resource. Read all instruction pages before relying on the skill.

Export all creates complete ZIP packages including scripts, references, and binary assets. The detail view's single-file export downloads only Markdown. Registry references may select one skill using `owner/repo#skill-name`; updates by skill name preserve that selection.


You can also select skills inline: `$code-review Review these changes.` Type `$`
in the TUI, WebUI, or SimpleUI composer for autocomplete. Multiple mentions are
supported; Enter/Tab inserts a selection without submitting. See
[inline skill mentions](slash/skills.md#inline-skill-mentions) for literal syntax
and refinement behavior.
