import type { CommandDetailMap } from './command-detail-types';
import { surfaceListSentence } from './command-detail-types';

export const commandDetailsPart4: CommandDetailMap = {
  '/mcp': {
    purpose:
      'Add, enable, disable, restart, and inspect MCP servers — extend WrongStack with external tool providers.',
    behavior:
      'MCP (Model Context Protocol) servers expose tools, resources, and prompts from external sources. Bare `/mcp` or `/mcp list` opens the interactive server picker in the TUI or lists servers. `/mcp add <name> [--enable]` adds a server preset; `/mcp remove`, `/mcp enable`, `/mcp disable`, and `/mcp restart <name>` manage it. `/mcp resources <name>` and `/mcp prompts <name>` discover content; `/mcp read <name> <uri>` and `/mcp get <name> <prompt> [key=value…]` insert one item. `/mcp auth login|start|complete|status|logout` manages per-server OAuth.',
    before:
      'Ensure the MCP server is configured and reachable. OAuth flows need the redirect URI the server expects.',
    during:
      'List shows configured servers and state; discovery can refresh cached catalogs with `--refresh`.',
    after: 'Verify registered tools with `/tools`. Restart servers that show connection errors.',
  },

  '/telegram-setup': {
    purpose: 'Configure a Telegram bot token and default chat — enable Telegram notifications.',
    behavior:
      '`/telegram-setup <botToken> [chatId]` stores the bot token securely (via the secret vault path in config) and optionally sets the default notification chat. There is no interactive wizard — the token comes from @BotFather and is passed as the first argument. Once configured, the Telegram plugin can send session and delegation notifications.',
    before: 'Create a Telegram bot via @BotFather and have the token ready.',
    during: 'The token and optional chat ID are persisted; errors report what was missing.',
    after:
      'Check status with `/telegram-settings`; notifications apply immediately without a restart.',
  },

  '/telegram-settings': {
    purpose:
      'Tune Telegram notification preferences — control which agent events trigger messages.',
    behavior:
      'The command shows current settings and configures them (alias `/tg-settings`): `session-end on|off`, `delegate on|off` (notify when a delegated subagent finishes), `long-tool <ms|off>` (notify for tools slower than a threshold, default 30 s), `poll <seconds>` (bot polling interval, 1–60), `chat <chatId>` (default chat), and `all on|off`. Changes are reactive — the plugin picks them up on the next config change without a restart.',
    before:
      'Decide which events warrant a notification. Too many notifications reduce their value.',
    during: 'Settings print with current values and the exact command to change each one.',
    after:
      'Trigger a watched event (or end a session) to confirm delivery. Adjust thresholds based on volume.',
  },

  '/prompts': {
    purpose:
      'Manage your prompt library — list, view, add, edit, favorite, delete, and extend reusable prompts.',
    behavior:
      'Registered by the built-in prompts plugin. `/prompts` (or `list`/`ls`) lists the library with favorite markers and tags. `/prompts view <title>` shows one; `/prompts add "title" "content"` creates one (with optional `--tags`, `--category`, `--var` flags); `/prompts edit|delete|favorite <title>` modify or remove entries; `/prompts extend` grows a prompt with model help. In the TUI, bare `/prompts` opens the interactive prompt-library browser.',
    before: 'No preparation needed. Browse the library to see what is available.',
    during: 'The library lists with titles, ids, and tags; mutations report the affected slug.',
    after:
      'Insert a prompt with `/prompt <query>` or `/prompt insert <slug>`. Author new ones with `/prompt-gen`.',
  },

  '/prompt': {
    purpose:
      'Search the merged prompt library and insert one — inject a pre-written steering template into the agent context.',
    behavior:
      '`/prompt <query>` searches the merged library (builtin + user + project layers) and inserts the best match; `/prompt insert <slug>` inserts a specific prompt by slug. In the TUI, bare `/prompt` opens the interactive prompt picker instead. Insertions record usage so frequently used prompts rank higher.',
    before: 'Browse the library with `/prompts` or search with `/prompt <query>`.',
    during:
      'Search results are matched by title/content; insertion adds the rendered prompt to the next turn.',
    after:
      'The inserted prompt steers the next agent turn. Edit or remove it with `/prompts edit` if the effect is not what you wanted.',
  },

  '/prompt-gen': {
    purpose:
      'Author a reusable prompt with model assistance — create high-quality steering templates.',
    behavior:
      'Registered by the prompts plugin. The command runs an AI-guided authoring flow over the prompt store: you describe the intent, the model drafts a structured prompt, and the result is saved into the library with a slug. Use `/prompts view` to inspect and `/prompt insert <slug>` to use it.',
    before: 'Have a clear idea of the steering behavior you want to capture as a reusable prompt.',
    during:
      'The model generates a draft from the plugin LLM; the final version is saved with a title and slug.',
    after:
      'Test the prompt with `/prompt insert <slug>`. Refine with `/prompt-gen` again if needed.',
  },

  '/sync': {
    purpose:
      'Sync selected settings, skills, prompts, memory, and history through GitHub — keep machines in sync.',
    behavior:
      'The wstack-sync plugin registers /sync for GitHub-backed settings, skills, prompts, memory and history. Bare /sync or status inspects configuration; enable owner/repo TOKEN [categories...] configures it, disable turns it off, and push/pull transfer selected categories. categories list/add/remove controls selection. This is distinct from the portal-based /cloudsync command.',
    before:
      'Choose a private GitHub repository and configure /sync enable owner/repo TOKEN. Enablement requires working encrypted token storage.',
    during:
      'Push and pull return transfer summaries or explicit failure messages; successful transfers also update sync metadata.',
    after:
      'Verify synced artifacts on the other machine. Run `/sync pull` there to receive changes.',
  },

  '/metrics': {
    purpose:
      'Show a metrics snapshot when collection is enabled — track agent performance over time.',
    behavior:
      '`/metrics [--json]` prints the in-memory metrics snapshot and exporter status. Metric collection requires starting the session with `--metrics` or `--metrics-port`; without it the command reports "Metrics not enabled. Restart with --metrics to collect." Series print grouped by metric name with labels and histogram stats (p50/p95/p99). `--json` emits a stable machine-readable payload.',
    before: 'Restart the session with `--metrics` (or `--metrics-port`) to enable collection.',
    during: 'The dashboard prints current values; empty state says no metrics recorded yet.',
    after:
      'Use metrics to identify inefficient patterns. Adjust model choices or workflow based on data.',
  },

  '/health': {
    purpose:
      'Run registered health checks when the health registry is enabled — verify system integrity.',
    behavior:
      '`/health [--json]` runs the host health registry and reports the worst aggregate status plus every check with a status icon and detail line. Health collection requires `--metrics` or `--metrics-port` at startup; without it the command reports "Health checks not enabled. Restart with --metrics." There is no per-check subcommand — all checks run together. `--json` emits the full structured result.',
    before:
      'Restart with `--metrics` to enable the registry. Checks are lightweight and safe to run anytime.',
    during:
      'Each check prints pass/degraded/fail with timing; the overall status is the worst of them.',
    after:
      'Investigate any failing checks. The detail line usually points directly at the root cause.',
  },

  '/skill': {
    purpose:
      'List discovered skills or inspect and use one — browse and activate WrongStack extensions.',
    behavior:
      "`/skill` lists every discovered skill with its scope tags and trigger description. `/skill <name>` prints the skill's instruction body (frontmatter stripped, capped). `/skill use <name> [task]` directs the agent to load the skill via the skill tool and apply it to a task. `/skill reload` invalidates the loader cache after editing skill files. In the TUI, bare `/skill` opens an interactive browser and `/skill <name>` shows the capped instructions.",
    before: 'No preparation needed. Browse skills to discover available capabilities.',
    during:
      'The list shows names, scopes, and "Use when" triggers; named views print the skill body.',
    after:
      'Use `/skill use <name>` or mention the skill by name. Find new ones with `/skill-search` and `/skill-install`.',
  },

  '/skill-gen': {
    purpose: 'Author a new skill from the command line — create custom WrongStack extensions.',
    behavior:
      '`/skill-gen` scaffolds a new skill: the name plus `--desc "…"` and `--trigger a,b,c` define the description and trigger words, `--global` writes to user-global skills instead of the project, and `--force` overwrites an existing skill of the same name. The generated skill is immediately discoverable by `/skill`.',
    before: 'Define what the skill should do and which words should trigger it.',
    during:
      'The skill file is written with frontmatter (name, description, triggers); existing skills are protected unless `--force`.',
    after: 'Verify with `/skill <name>`, then refine the instruction body in the generated file.',
  },

  '/skill-search': {
    purpose: 'Search the configured skill registry — find installable skills by query.',
    behavior:
      '`/skill-search <query> [--page N] [--pageSize N]` searches the configured registry adapters (skills.sh). Results show name, author, installs, security score, and the install ref to use with `/skill-install`. Search is read-only — it never touches the local manifest or filesystem.',
    before: 'Have a capability or task type in mind. The query accepts quoted multi-word phrases.',
    during: 'Results appear grouped per registry with the total count.',
    after:
      'Install hits with `/skill-install <owner/repo>` (or the full install ref shown). Verify with `/skill <name>`.',
  },

  '/skill-install': {
    purpose: 'Install a skill from GitHub or the registry — add new capabilities to WrongStack.',
    behavior:
      '`/skill-install <user/repo>` installs from the default branch; `<user/repo@ref>` pins a tag/branch/commit; `skills.sh:<owner/repo>` (or `registry:<id>`) resolves a registry hit. `--global` installs to user-global skills instead of project scope. Single-skill repos (SKILL.md at root) and multi-skill repos (`skills/`) are both supported. Private repos need `GITHUB_TOKEN` (or `GH_TOKEN`) in the environment.',
    before: 'Verify the skill source is trustworthy. Review its description and capabilities.',
    during: 'Install results list each installed skill with source, ref, and destination path.',
    after: 'Verify installation with `/skill <name>` and use its trigger words.',
  },

  '/skill-import': {
    purpose:
      'Import skills from another AI tool or a local directory — take ownership of foreign skills.',
    behavior:
      "`/skill-import --from <tool>` imports from that tool's project-level skills directory (`--global` for its home directory); `--from-claude` is an alias for `--from claude`. `/skill-import <src-dir>` imports from any directory. `--link` symlinks instead of copying. Every subdirectory with a valid SKILL.md is imported into `.wrongstack/skills` so you can edit and commit it. Foreign skills remain readable without importing — this command copies them into your ownership.",
    before:
      "Know which tool's directory you are importing from (the command lists the known tool ids on error).",
    during: 'Each imported skill prints its name and destination path.',
    after:
      'Review imported skills — foreign conventions may need manual adjustment before committing.',
  },

  '/skill-update': {
    purpose: 'Update installed skills — get the latest versions with bug fixes and new features.',
    behavior:
      '`/skill-update` updates every installed skill from its recorded GitHub source; `/skill-update <name>` updates one skill; `<user/repo@ref>` moves a skill to a different ref; `--global` targets user-global skills. Results report updated skills (with old → new refs), refreshed ones, up-to-date names, and per-skill errors.',
    before:
      'Review what changed upstream if you have local modifications — updates pull from the source ref.',
    during: 'Each skill reports updated (with ref change), refreshed, up to date, or failed.',
    after:
      'Verify updated skills still work with `/skill <name>`. Re-pin a ref with `/skill-update <user/repo@ref>` to roll back.',
  },

  '/skill-uninstall': {
    purpose: 'Remove an installed skill — clean up unused or problematic extensions.',
    behavior:
      '`/skill-uninstall <name>` removes an installed project skill; `--global` targets user-global skills. Bare `/skill-uninstall` lists installed skills for the selected scope (name, source@ref, install date) instead of removing anything. Removal deletes the skill files immediately.',
    before:
      'Confirm you no longer need the skill. Uninstallation is reversible only by reinstalling.',
    during: 'The bare form lists installed skills; the named form removes instantly and confirms.',
    after:
      'Verify the skill no longer appears in `/skill`. Reinstall with `/skill-install` if needed.',
  },

  '/profile': {
    purpose:
      'Manage configuration profiles — isolate provider credentials, fallback chains and feature flags per workflow.',
    behavior: `Each profile lives at \`~/.wrongstack/profiles/<name>/config.json\`. The active profile is recorded in the bootstrap config. \`/profile list\` shows available profiles (the active one is marked with a bullet). \`/profile switch <name>\` activates a profile and broadcasts \`config.changed\` to every surface — ${surfaceListSentence} — so every client reconnects to the new config. \`/profile copy <name>\` duplicates the active profile into a new name you can edit independently. Profile names are sanitized for path safety — the characters \`/\`, \`\\\`, \`:\`, \`.\`, and \`_\` are each replaced with \`_\` (and an empty result is rejected), so a name like \`..\` collapses to a single underscore and \`my:profile\` becomes \`my_profile\`. The user-facing error names these chars for reference.`,
    before:
      'Decide whether you want multiple profiles. Most teams keep one `default` profile and add `work` or `experiment` profiles to switch between provider credentials, autonomy levels or feature flags without touching the global config.',
    during: `\`/profile switch <name>\` is the dangerous mutation — it changes the active provider, model and fallback chain for every open surface (${surfaceListSentence}). The output lists the old and new active profile plus the side-effects broadcast.`,
    after: `Confirm the active profile (the bullet in \`/profile list\`) and re-check \`/auth\` plus \`/setmodel\` so the right credentials and leader model are wired across every open surface (${surfaceListSentence}).`,
  },

  '/provider-status': {
    purpose:
      'View live health for every configured provider/model route — see what is healthy, degraded, blocked, or waiting.',
    behavior:
      'The `ProviderModelStatusTracker` records every failure and success against a `(provider, model)` pair and assigns a state: `healthy`, `degraded`, `blocked`, or `waiting` (with an expiry). The command can show all statuses, filter by state, release a single blocked pair back into the rotation with `retry`, or reset tracking with `clear` (all pairs or `clear <provider> <model>` for one). When the tracker is unwired, the command reports an honest "tracker unavailable" message instead of inventing data.',
    before:
      'Run when a model feels stuck, when the fallback chain is rotating too often, or after a quota event. Useful before reporting a routing issue.',
    during:
      'The state list prints once. `retry <provider> <model>` triggers a half-open probe on the next use, releasing the entry without restarting the session.',
    after:
      'Healthy models stay in the rotation. Degraded models keep working but are demoted. Blocked models are skipped until the cooldown expires or a manual release is issued.',
  },

  '/chimera': {
    purpose:
      'Show Chimera — the post-session code-quality guardian — and adjust its review settings for the current session.',
    behavior:
      'Chimera is a built-in plugin, on by default, that runs after each session ends. It collects the changed files and dispatches a focused subagent (`extensions.wstack-chimera.provider/model`) to find bugs, anti-patterns, security smells and review suggestions. Severity-ranked findings appear in a structured report. With `autoFix=auto`, Chimera can also dispatch a follow-up fix subagent. `/chimera autoFix <off|ask|auto>` adjusts the mode in-session without rewriting the config file; the change is recorded via a `chimera.set_autofix` event so the leader reflects it immediately.',
    before:
      'Decide whether you want review findings sent as a `note`, surfaced as an interactive `ask`, or auto-fixed. `off` keeps the report on the review report only.',
    during:
      'The command prints provider, model, max files, autoFix mode, cascadeOn and maxCascadeDepth. Setting `autoFix ask` causes Chimera to send each finding as an actionable ask so you can approve or reject fixes one at a time.',
    after: `Reports are persisted to the session JSONL and broadcast on mailbox so every open surface (${surfaceListSentence}) can render them.`,
  },

  '/auto-review': {
    purpose:
      'Show the continuous auto-review pipeline — fire a focused review subagent on every detected git change during a session.',
    behavior:
      'Auto-review watches git-tracked file edits (debounced, default 15 s) and dispatches a review subagent with the configured provider and model. When a finding exceeds the `cascadeOn` threshold (`off` | `high` | `critical`, default `high`), follow-up agents (`security-scanner`, `bug-hunter`) are spawned to investigate and propose fixes. The cycle is bounded by `maxCascadeDepth` (default 2). The active config lives under `extensions.wstack-auto-review` in the active profile config; `enabled`, `provider`, `model`, `fallbackProfile`, `modelSelection` (round-robin|random), `debounceMs`, `maxFilesPerBatch` (default 15), `maxConcurrentReviews` (default 2), `cascadeOn` and `maxCascadeDepth` can each be tuned. Bare `/auto-review` prints the current effective config and in-flight count; `on` / `off` report that enable/disable happens by editing config.json (so the change is durable across sessions).',
    before:
      'Pick a fallback profile and a sane threshold. Cascade at `high` is usually the right default; pick `critical` if you only want follow-ups for severe findings.',
    during:
      '`enable` and `disable` subcommands print that the change happens through `extensions.wstack-auto-review.enabled` in `config.json` — they do not flip a runtime flag.',
    after: `In-flight count, provider, model, fallback chain, debounce window, max files, max parallel, cascade policy and max depth are printed for transparency.`,
  },

  '/semver': {
    purpose:
      'Show the current version, the latest git tag, and the conventional-commit-suggested bump — or apply a forced bump (`patch` | `minor` | `major` | `auto`).',
    behavior:
      '`/semver` or `/semver status` reads `package.json`, the latest git tag, and the conventional commits since that tag; the suggested bump is inferred from the type prefixes (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` → major). `/semver patch|minor|major` forces a specific bump and writes a commit + tag. `/semver auto` defers to the inference. `--dry` (alias `--dry-run`) previews without writing or tagging. The `cwd` must stay within the project root — a path that escapes fails closed. The companion `semver_bump`, `semver_current`, and `semver_changelog` tools are what the agent loop invokes for automated versioning and changelog generation (markdown grouped by conventional-commit type, between any two tags or from a tag to HEAD).',
    before:
      'Decide between forced and inferred bumps. Forced bumps are right for hotfixes; inferred bumps preserve the conventional-commit contract.',
    during: 'Each mode prints progress. `--dry` previews without writing or tagging.',
    after:
      'The new tag is recorded and reusable by `semver_changelog` for the next release notes draft. The lockstep invariant is that all workspace manifests, the website release copy, and the lockstep version script update together.',
  },

  '/lsp': {
    purpose:
      'Manage Language Server Protocol servers — list, install, start, stop, restart and inspect diagnostics.',
    behavior:
      '`/lsp` (alias `lsplsp`) is the umbrella command, registered by the plug-lsp plugin. `/lsp list` (`ls`) enumerates configured servers; `/lsp status` (`stat`) reports alive/dead state; `/lsp install <language>` wires up a canonical language server (TypeScript, Python, Go, Rust and more); `/lsp start|stop|restart [name]` manages server processes (`restart` also answers to `reload`); `/lsp diagnostics [file]` (`diag`) prints buffered diagnostics; `/lsp add <name> --command … --languages …` registers an ad-hoc server; `remove` (`rm`, `delete`), `enable`, and `disable` curate the registry.',
    before:
      'Have a project with a recognized root pattern (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) so LSP root detection lands on the right directory.',
    during:
      'Install and restart print server stderr and exit codes; use `/lsp status` to verify alive. Diagnostics stream into the WebUI CodeMap activity layer so refactors land safely.',
    after:
      'Document symbols surface through `codebase-search` with `preferLsp: true`; the deprecated `codebase-lsp-search` tool is replaced by that flag.',
  },
};
