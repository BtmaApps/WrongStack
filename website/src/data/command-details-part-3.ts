import type { CommandDetailMap } from './command-detail-types';

export const commandDetailsPart3: CommandDetailMap = {
  '/auth': {
    purpose: 'Manage saved provider credentials and native cloud routing profiles.',
    behavior:
      '`/auth` opens the TUI credential panel or shows saved key status in the plain REPL. `/auth login` opens OAuth sign-in. `/auth status <provider>` shows detail for one provider. `/auth cloud <alias> [region|project|location|resourceName <value>|clear]` changes the applicable native routing field; `clear` restores defaults. Existing keys stay encrypted in the active machine profile.',
    before:
      'Choose an existing saved alias for cloud settings. Credentials and routing fields are managed separately.',
    during:
      'Cloud configuration validates and persists routing metadata without making a model request.',
    after:
      'Re-select the provider or restart to construct it with the new settings. For the full interactive key manager in the plain REPL, run `wstack auth`.',
  },

  '/working_dir': {
    purpose:
      'Show or change the live working directory — control where the agent reads and writes files.',
    behavior:
      '`/working_dir` (aliases `/wd`, `/cd`) prints the current working directory. `/working_dir <path>` changes it; use `.` to reset to the project root. The target must be an existing directory inside the project root. Relative paths resolve from the project root, not the current directory. The change propagates to the statusline and WebUI.',
    before: 'Verify the target directory exists and is within the project root.',
    during: 'The change prints as `old → new` confirmation. It applies immediately.',
    after:
      'Run `/working_dir` again to confirm. Relative paths in subsequent tool calls resolve from the new location.',
  },

  '/project': {
    purpose:
      'List, add, rename, remove, or switch registered projects — manage your WrongStack workspace.',
    behavior:
      'Projects are registered in `~/.wrongstack/projects.json` with a name, root path, and auto-generated slug. Bare `/project` opens the interactive picker (arrow keys). `/project ls|list` lists projects as text. `/project id`, `init`, and `rekey [--yes]` manage the committed project identity. `/project add <path> [name]` registers a project, `/project rename <slug> <name>` relabels, `/project remove <slug>` unregisters, and `/project switch <dir> [--name <n>]` spawns wstack in the target directory.',
    before: 'Run `/project list` to see current projects before adding or switching.',
    during:
      'Selecting a project stops running agents and spawns a fresh wstack session in the selected directory.',
    after:
      'Verify with `/project list`. Session state is per-project, so switching starts a fresh context.',
  },

  '/f': {
    purpose:
      'Open a numbered TUI panel dispatcher — access common monitors and panels through single-number shortcuts.',
    behavior:
      '`/f` lists twelve numbered panels: 1=project switcher, 2=fleet orchestration monitor, 3=agents live monitor, 4=worktree monitor, 5=plan panel, 6=todos monitor, 7=queue panel, 8=process list, 9=goal panel, 10=live sessions, 11=coordinator monitor, 12=kanban panel. `/f <1-12>` opens that panel. Hidden aliases `/f1`–`/f12` work without the space. In the REPL the command falls back to a text notice since panels are TUI-only.',
    before:
      'No preparation needed. Use it as a keyboard-driven alternative to hunting through menus.',
    during: 'The numbered list prints, or the chosen panel opens directly in the TUI.',
    after: 'The panel stays open until dismissed; the command itself has no lingering state.',
  },

  '/mouse': {
    purpose:
      'Toggle full mouse mode in the TUI — control whether the transcript viewport or your terminal owns the mouse.',
    behavior:
      '`/mouse` shows the current mode. `/mouse on` enables full mouse mode (in-app scrolling, draggable scrollbar, clickable status-bar chips and confirm buttons). `/mouse off` keeps wheel scrolling but drops drag/click interaction. `/mouse native` releases mouse tracking entirely so the terminal handles click-drag selection and copy again. `/mouse toggle` flips on/off. The setting persists across sessions.',
    before: 'No preparation needed. Use `native` when you need to copy text out of the terminal.',
    during:
      'The TUI applies and persists the new mode and prints the resulting status. Outside the TUI the intent is ignored.',
    after:
      'In native mode the wheel scrolls the terminal, not the transcript — use PgUp/PgDn or Ctrl+U/D to page through history, or `/mouse on` to take the mouse back.',
  },

  '/design': {
    purpose:
      'Browse, pin, and materialize a curated Design Studio kit — apply a cohesive design system to UI work.',
    behavior:
      'Bare `/design` lists all kits and shows the active one. `/design <kit-id> [stack]` pins a kit (stack: web|react-native|flutter|swiftui|compose) and loads its full spec next turn. `/design off` clears the pin. `/design foundations` prints the mandatory responsive/a11y/theming/motion baseline. `/design set <k=v>…` and `/design tune <k=v>…` override colors/tokens and high-level knobs (radius, density, font, motion). `/design swap <kit-id>` switches kits and drops old overrides. `/design materialize [stack] [path]` writes the kit tokens (with overrides) to a real theme file; `/design verify` scans UI files for token drift.',
    before: 'Browse kits with bare `/design`. Choose one that matches your project aesthetic.',
    during:
      'Pinning sets the active kit for the session and emits the load instruction for the next turn. Materialize resolves a containment-checked output path before writing.',
    after:
      'Re-run `/design` to confirm the active kit, `/design verify` to check token drift, and re-materialize after kit or override changes.',
  },

  '/codebase-reindex': {
    purpose:
      'Rebuild the project symbol and codebase search index — refresh the fast search database.',
    behavior:
      'The codebase index powers `codebase-search` and is normally kept fresh automatically (session start plus live per-edit reindexes). `/codebase-reindex` runs an incremental refresh (only changed files, via mtime); `force`, `--force`, or `-f` clears the index and rebuilds from scratch. The run goes through the shared background indexer mutex, so it serializes safely with other indexing work.',
    before:
      'Run when search results seem stale or after a large branch switch, merge, or external edit. A full rebuild can take minutes on large repos.',
    during:
      'The command runs synchronously, resets the index circuit breaker, then prints symbols indexed, files parsed/skipped/failed, and duration.',
    after:
      'The summary line confirms the index was updated or rebuilt; a corrupt index is detected and rebuilt from scratch automatically.',
  },

  '/techstack': {
    purpose:
      'Scan dependencies, verify versions against the npm registry, and write a technology report — understand what your project depends on.',
    behavior:
      'Bare `/techstack` spawns a scoped subagent (tools: read/glob/grep/tree/fetch/write) that reads every package.json, checks each dependency against the npm registry, and writes `techstack.md` (or `techstack.json` with `--json`) to the project root. `--init` runs the first-time-setup variant; `--scan` runs the deterministic inventory engine only (no network, feeds the WebUI TechStack view); `--plan` previews a structured remediation plan and `--apply` applies approved items through `language_package`. The command is hooked into `/init`.',
    before:
      'No preparation needed — but the subagent needs the `fetch` tool; a minimal/light token-saving tier strips it and the command aborts with guidance.',
    during:
      'The header prints the package-file count, then the subagent runs and returns a summary (counts per status, top urgent issues).',
    after:
      'Review the generated `techstack.md`/`techstack.json`. Run `/security audit-deps` for a deeper dependency-vulnerability view.',
  },

  '/worktree': {
    purpose:
      'Inspect and manage the git worktrees Goal uses for per-phase isolation — isolate work without branch switching.',
    behavior:
      'Goal allocates one worktree per parallelizable phase under `.wrongstack/worktrees/`. `/worktree list` (default) shows active worktrees. `/worktree merge <branch>` squash-merges a worktree branch into the current branch. `/worktree prune` removes stale administrative entries. `/worktree clean` removes all wstack-managed worktrees and branches. Merge and clean are destructive and prompt for confirmation; pass `--yes`/`-y` to skip. Bare `/worktree` in the TUI opens an interactive worktree monitor.',
    before:
      'Merge and clean rewrite history-adjacent state — confirm the branch names before running them.',
    during:
      'List shows worktree paths; destructive subcommands ask for confirmation unless `--yes` is passed.',
    after: 'Prune old worktrees to keep the workspace clean once their phase has merged.',
  },

  '/audit': {
    purpose:
      'Inspect the side-effect trail for shell, install, and fetch actions — see everything the agent has done.',
    behavior:
      'Every bash command, package install, and network request is recorded with tool name, risk level, input, and outcome. Bare `/audit` opens the TUI AuditPanel overlay showing the timeline. With arguments it renders an inline filtered view: a bare risk word (`low|medium|high|critical`) filters by risk, `tool <name>` filters by tool, and a number limits the count (default 20, max 500).',
    before: 'No preparation needed. Run it after a long agent session to review its actions.',
    during: 'Entries print chronologically with time, tool, risk, truncated input, and outcome.',
    after: 'Investigate any unexpected commands. The audit trail is your accountability mechanism.',
  },

  '/security': {
    purpose:
      'Run source scans, dependency audits, reports, and redaction diagnostics — the security health check command.',
    behavior:
      '`/security scan` runs the real security-scanner pipeline over the project source. `/security audit` runs a dependency audit plus a source scan; `/security audit-deps` runs only the package-manager dependency audit. `/security report` lists or reads reports under `<project>/security-reports`. `/security redact-test` verifies the production secret scrubber with synthetic values. Any subcommand accepts `--json` for machine-readable output; scan accepts `--depth quick|standard|deep` and `--format markdown|json|html`.',
    before: 'Run `audit-deps` regularly and before releases. The scans are read-only and safe.',
    during:
      'Results report findings by severity; `--json` wraps them in a stable payload with `ok` and `action` fields.',
    after:
      'Address critical and high-severity findings immediately. Re-run the audit after fixes to confirm resolution.',
  },

  '/commit': {
    purpose:
      'Stage all changes and create a generated conventional commit — produce well-formed commit messages automatically.',
    behavior:
      'The command stages the entire working tree (`git add .`) and drafts a conventional commit message — LLM-drafted from the staged diff via the session provider when available, heuristic fallback otherwise. `/commit --dry-run` (or `-n`) previews the message and diff stat without committing; `--no-llm` forces the heuristic drafter. Before committing it runs a shared-worktree safety check and warns loudly if another agent is editing the same tree. The staged diff stat and preview are printed with the result.',
    before:
      'Review the diff with `/git diff` first — the whole tree is staged, not selected files.',
    during:
      'A worktree-sharing warning may print first; then the generated message, hash, and diff preview appear.',
    after:
      'Inspect the printed commit hash and diff summary, or use git log in the shell. Push with /push only when ready.',
  },

  '/git': {
    purpose: 'Show a concise, read-only repository overview — status, branch, and diff summaries.',
    behavior:
      '`/git` (or `/git status`) shows branch, HEAD, changed paths, and staged/unstaged diff summaries. `/git branch` prints the current branch and short HEAD. `/git diff` prints a diff summary; add `--staged` for the index. `--json` emits stable machine-readable output. Mutations are intentionally not handled here — they live on `/commit`, `/push`, and the permission-gated `git` tool.',
    before: 'No preparation needed; the command is read-only.',
    during: 'Git output is formatted for readability; unknown subcommands list the valid verbs.',
    after: 'Use `/commit` to stage and commit, or the `git` tool for other operations.',
  },

  '/gitcheck': {
    purpose:
      'Silently inspect the working tree for uncommitted changes — a lightweight gate for automation.',
    behavior:
      'The command returns an empty message when the tree is clean or not a Git repository. When dirty it prints an uncommitted-change count and suggests /commit. It does not provide a shell exit-code gate for CI.',
    before: 'No preparation needed. Run it before operations that require a clean tree.',
    during: 'Returns instantly — no git operations beyond a status check.',
    after:
      'If dirty, review changes with `/git diff`. Commit with `/commit` or stash before proceeding.',
  },

  '/push': {
    purpose: 'Push the current branch to its configured remote — a safe wrapper around git push.',
    behavior:
      'The command pushes the current branch to its configured branch remote when available, otherwise origin or the first remote. --dry-run (-n) previews; --force (-f) forwards force to Git. It reports missing remotes or Git errors and does not automatically commit or check a dirty tree.',
    before:
      'Commit your changes with `/commit`. Verify with `/git branch` that the right commits are on the branch.',
    during: 'Push progress prints; failures surface git stderr directly.',
    after: 'Verify the push succeeded. Check the remote repository if needed.',
  },

  '/gitid': {
    purpose:
      'Inspect or manage the commit identity used for agent-run git commands — set name and email for commits.',
    behavior:
      '`/gitid` shows the identity in effect and whether it is persisted or session-only. `/gitid set <name...> <email>` sets both (the email must be the last argument); `/gitid set <email>` sets only the email. `/gitid clear` removes the identity so your own git config applies again. Add `--session` to set or clear for this session only, without writing config. The identity is injected as `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars into every git process the agent spawns — your repo and global git config are never modified. Persisted values live in the active profile config (`~/.wrongstack/profiles/<name>/config.json`).',
    before: 'Verify your current identity with `/gitid` before making commits.',
    during: 'Changes print for confirmation, including whether the value persisted.',
    after: 'Run `/gitid` again to confirm. Commits made outside WrongStack are unaffected.',
  },

  '/doctor': {
    purpose:
      'Diagnose and safely repair configuration and session-corpus problems — fix broken setups without touching journals.',
    behavior:
      '`/doctor` (read-only) validates the config files: JSON validity (restoring from backup when corrupt), field types and enums, plugin/extension shape and option schemas, unknown-key typos, plaintext secrets, and credential fields leaked into per-project config. `/doctor fix` applies auto-fixes with a backup first; invalid values are removed so defaults apply and values are only rewritten when unambiguous. `/doctor sessions` diagnoses the project session corpus (unparsable lines, truncated tails, missing session_start, unclosed sessions, stale summary sidecars, oversized journals); `/doctor sessions fix` rebuilds only derived files (.summary.json sidecars and the catalog index) — journals are never edited.',
    before:
      'Run when something is not working as expected. The doctor is safe — it backs up before any change and only writes derived artifacts in sessions mode.',
    during: 'Findings stream with severity; fix mode reports what was applied.',
    after:
      'Address anything the doctor could not auto-fix. Note that compacting session snapshot bytes would break rewind, so reclaim those via pruning.',
  },

  '/tuneup': {
    purpose:
      'Audit session health, context cost, performance, and reliability settings — optimize your agent configuration.',
    behavior:
      '`/tuneup` (alias `/checkup`) runs a read-only report across skill/MCP/plugin context cost, duplicated and oversized instruction files, slow shell hooks, updates, auto-mode default, denied read-only commands, performance knobs, and reliability settings. `/tuneup fix` applies only the safe deterministic fixes; `fix --power` additionally enables the autonomy/yolo profile (explicit opt-in); `fix --pick` confirms each fix first; `/tuneup deep` hands the findings to the agent for a project-specific optimization plan.',
    before: 'Run after several sessions or when you notice performance degradation.',
    during:
      'The audit runs multiple checks with a rationale per finding; the global config is backed up before any fix.',
    after:
      'Apply recommended fixes with `/tuneup fix`. Review deep diagnostics for systemic issues.',
  },

  '/desktop': {
    purpose:
      'Explain how to access the local WrongStack Desktop application — the Electron-based GUI surface.',
    behavior:
      'The command is informational only: it prints where the Desktop app fits (local graphical shell for sessions, project state, and agent coordination) and the recommended way to launch it — from your desktop launcher or the platform-specific package you installed. It deliberately does not probe ports or launch the app, because a slash command cannot reliably know the install layout.',
    before: 'Ensure the Desktop app is installed from its platform package.',
    during: 'A short guidance block prints; nothing is executed or checked.',
    after: 'Launch the Desktop app from your launcher and connect it to your project.',
  },

  '/webui': {
    purpose: 'Explain how to access the browser-based WrongStack interface — the WebUI surface.',
    behavior:
      'The command is informational only (alias `/web`): it prints where the WebUI fits (browser view for sessions, agents, mailbox coordination, and project activity) and recommends starting the WebUI/HQ server with the project command you normally use, then opening the printed local URL. It does not guess which port, host, or WebUI package is running.',
    before: 'No preparation needed.',
    during: 'A short guidance block prints; no server is started or probed.',
    after:
      'Start the WebUI server with your usual project command and open the URL it prints. The WebUI connects to the same project mailbox as CLI agents.',
  },

  '/tool': {
    purpose:
      'Control per-tool description and result-render detail — tune how much tool metadata the agent sees and you get back.',
    behavior:
      '`/tool` shows current description and result-mode overrides; `/tool list` lists every tool with both modes. `/tool <name> simple|extend` sets BOTH the description mode (LLM prompt) and result-render mode at once (legacy form). `/tool <name> desc simple|extend` or `/tool <name> result simple|extend` sets one axis. Modes persist to config when config paths are available, otherwise they are runtime-only.',
    before:
      'Simple mode saves prompt and output tokens; extend gives the model fuller schemas and you fuller results.',
    during: 'Each change confirms the tool, axis, mode, and whether it was saved.',
    after:
      'Watch tool-use accuracy and result verbosity; flip individual axes back with `desc`/`result`.',
  },

  '/tools': {
    purpose: 'List the complete registered tool inventory — see every tool the agent can use.',
    behavior:
      'Bare `/tools` opens the interactive picker in the TUI or prints a text table in the REPL. `/tools <pattern>` filters by tool name, display name, or owner. Each row shows tool, owner, read/write, permission, and a three-state status: `direct` (schema sent every turn), `lazy` (held back by the token-saving tier but still callable via tool_search/tool_use), or `disabled`. Counts for each state print in the header, with pointers to `/settings token-saving` and `/tool enable`.',
    before: 'No preparation needed. Run it to understand agent capabilities.',
    during:
      'The table prints (or the picker opens); lazy/disabled notes explain why tools may be invisible to the model.',
    after:
      'Raise the token-saving tier for more direct tools, or use `/tool <name>` to tune description/result detail per tool.',
  },

  '/plugin': {
    purpose:
      'List, inspect, enable, disable, and manage plugins — control WrongStack extensibility.',
    behavior:
      'Bare `/plugin` opens the curated on/off menu in the TUI or lists configured plugins in the REPL. `/plugin status` lists; `/plugin report` explains why plugins are active and which can be disabled; `/plugin official` lists bundled plugins and aliases; `/plugin install|add <alias|package>` adds and enables; `/plugin enable|disable <name>` flips one; `/plugin toggle <name>` toggles a curated plugin; `/plugin remove <name>` drops it from config. `/plugin manager [lock|unlock] <name|*>` guards plugins against LLM enable/disable changes, and `/plugin llm <name> [provider] [model]` routes a plugin through a specific provider/model.',
    before:
      'Review what a plugin adds before enabling it. Some plugins register tools that consume context.',
    during: 'List shows plugins and state; destructive changes print what changed.',
    after: 'Disable unused plugins to reduce context overhead and startup time.',
  },
};
