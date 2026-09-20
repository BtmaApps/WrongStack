export const toolCategories = [
  'Browser & E2E',
  'Files & search',
  'Shell, Git & web',
  'Work & state',
  'Quality & language',
  'Dependencies & operations',
  'Generation & design',
  'Discovery & index',
] as const;

export type ToolCategory = (typeof toolCategories)[number];

export const toolCatalog = [
  {
    name: 'browser_open',
    summary:
      'Create an isolated, agent-owned Playwright browser session, optionally opening an approved HTTP(S) URL. Use it to begin browser QA; private and localhost origins require an explicit allowlist.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_status',
    summary:
      'Check whether the managed Playwright Chromium installation is available before attempting browser automation.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_list',
    summary:
      'List browser sessions owned by this agent, including their state and current page, without exposing sessions owned by other agents.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_navigate',
    summary:
      'Navigate one of this agent’s browser sessions to an approved HTTP(S) URL. Use browser_open first; private and localhost origins require an explicit allowlist.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_snapshot',
    summary:
      'Inspect the current page through a bounded accessibility snapshot, with redacted console and network summaries. Prefer this before interacting with page elements.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_screenshot',
    summary:
      'Capture a PNG of the current page or a selected element for visual QA. The result is a sensitive artifact with integrity metadata.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_click',
    summary:
      'Click a verified page element in an owned browser session. Snapshot first and use the most specific stable selector available.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_type',
    summary:
      'Fill a form control in an owned browser session. Use secretEnv for credentials so secret values never enter tool arguments or the audit trail.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_select',
    summary:
      'Choose an option in a select control in an owned browser session after confirming the target selector and intended value.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_press',
    summary:
      'Send a keyboard key or shortcut to an owned browser session, such as Enter after verifying a form is ready to submit.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_hover',
    summary:
      'Hover over a verified page element in an owned browser session to reveal menus, tooltips, or other hover-driven UI state.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_drag',
    summary:
      'Drag one page element onto another in an owned browser session. Use only when the page’s drag-and-drop interaction is the intended action.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_wait',
    summary:
      'Wait for a selector, navigation condition, or bounded duration in an owned browser session before taking the next browser action.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_evaluate',
    summary:
      'Run a bounded JavaScript expression in an owned page when browser APIs cannot inspect the needed state. Treat page code as arbitrary and use sparingly.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_upload',
    summary:
      'Upload project-local files through a page file input in an owned browser session. Verify both the file path and target control before uploading.',
    permission: 'confirm',
    mutating: true,
    category: 'Browser & E2E',
  },
  {
    name: 'browser_close',
    summary:
      'Close an owned browser session and reclaim its resources, returning trace-artifact metadata when tracing was enabled.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'e2e_plan',
    summary:
      'Create an end-to-end test plan from a feature or user flow. Use it to identify scenarios and acceptance coverage; it plans tests rather than executing them.',
    permission: 'auto',
    mutating: false,
    category: 'Browser & E2E',
  },
  {
    name: 'read',
    summary:
      'Read a project file safely, with optional line ranges and binary-aware output. Use it to inspect source before editing; paths must stay within the project.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'read_url_content',
    summary:
      'Fetch content from a URL via HTTP request and convert HTML directly to clean markdown. Use for public docs and web pages without browser overhead.',
    permission: 'auto',
    mutating: false,
    category: 'Shell, Git & web',
  },
  {
    name: 'write',
    summary:
      'Create or replace one project file with the complete supplied content. Use for new files or intentional full rewrites, after reading existing content when applicable.',
    permission: 'confirm',
    mutating: true,
    category: 'Files & search',
  },
  {
    name: 'edit',
    summary:
      'Make a precise, guarded text edit by replacing an expected block in a project file. Prefer it for small source changes so mismatches prevent accidental overwrites.',
    permission: 'confirm',
    mutating: true,
    category: 'Files & search',
  },
  {
    name: 'replace',
    summary:
      'Preview or apply a regular-expression replacement across selected project files. Start with dry_run, constrain files and globs carefully, then apply only reviewed changes.',
    permission: 'confirm',
    mutating: true,
    category: 'Files & search',
  },
  {
    name: 'glob',
    summary:
      'Find project files by glob pattern, respecting repository boundaries and ignore rules. Use it to locate candidate paths before reading or editing them.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'grep',
    summary:
      'Search project text with a bounded regular expression and contextual matches. Use it for exact literals or patterns when semantic codebase search is not appropriate.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'bash',
    summary:
      'Run a shell command in the project with bounded output and timeout controls. Use it for development commands after checking side effects; background mode returns a process handle.',
    permission: 'confirm',
    mutating: true,
    category: 'Shell, Git & web',
  },
  {
    name: 'exec',
    summary:
      'Execute a command directly without shell interpretation, using explicit program arguments. Prefer it when argument safety and predictable process invocation matter.',
    permission: 'confirm',
    mutating: true,
    category: 'Shell, Git & web',
  },
  {
    name: 'pwsh',
    summary:
      'Execute a PowerShell command in the project with timeout, output, and background controls. Use it for Windows-native project operations and verify commands that can modify state.',
    permission: 'confirm',
    mutating: true,
    category: 'Shell, Git & web',
  },
  {
    name: 'fetch',
    summary:
      'Fetch and extract content from an approved HTTP(S) URL for research or integration work. Use it for a known page or endpoint, not for general web discovery.',
    permission: 'confirm',
    mutating: false,
    category: 'Shell, Git & web',
  },
  {
    name: 'search',
    summary:
      'Search the public web for current external information, then inspect selected results with fetch. Use it when repository evidence is insufficient or the fact may have changed.',
    permission: 'auto',
    mutating: false,
    category: 'Shell, Git & web',
  },
  {
    name: 'todo',
    summary:
      'Create, update, or list the session’s concrete work items and their progress. Use it to keep multi-step work visible; it does not implement the tasks itself.',
    permission: 'confirm',
    mutating: true,
    category: 'Work & state',
  },
  {
    name: 'plan',
    summary:
      'Create and manage higher-level plan-board items, priorities, and status. Use it for strategic work tracking rather than small immediate edits.',
    permission: 'confirm',
    mutating: true,
    category: 'Work & state',
  },
  {
    name: 'kanban',
    summary:
      'Manage project Kanban boards, cards, assignments, and acceptance evidence. Use it for persistent team workflow; changing board state is intentional and reviewable.',
    permission: 'confirm',
    mutating: true,
    category: 'Work & state',
  },
  {
    name: 'task',
    summary:
      'Manage structured task records, dependencies, ownership, and promotion into actionable session work. Use it to organize bounded work before delegation or execution.',
    permission: 'confirm',
    mutating: true,
    category: 'Work & state',
  },
  {
    name: 'git',
    summary:
      'Inspect or run scoped Git operations in the project, including status, diff, history, branches, and commits. Review the target and working tree before mutating operations.',
    permission: 'confirm',
    mutating: true,
    category: 'Shell, Git & web',
  },
  {
    name: 'patch',
    summary:
      'Apply a unified diff to project files with patch-style context checking. Use it for a reviewed multi-file change when exact patch content is available.',
    permission: 'confirm',
    mutating: true,
    category: 'Files & search',
  },
  {
    name: 'json',
    summary:
      'Read, query, validate, or merge JSON/JSON5/YAML files while preserving valid structure (read-only — does not write). Use it instead of raw text edits when reading or querying structured data.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'diff',
    summary:
      'Show file content with line numbers, staged/working-tree diffs via git, or commit/branch diffs. A safer and more structured alternative to raw `git diff` via shell.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'tree',
    summary:
      'Render a bounded directory tree with depth, file, hidden-file, and ignore controls. Use it for repository orientation without reading every file.',
    permission: 'auto',
    mutating: false,
    category: 'Files & search',
  },
  {
    name: 'lint',
    summary:
      'Run the project’s configured linter for a target path or working directory and return diagnostics. Use it after code edits to catch style and static-analysis issues.',
    permission: 'confirm',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'format',
    summary:
      'Run the project’s configured formatter on selected files or directories. Use it after editing code, while reviewing the resulting diff for unintended formatting scope.',
    permission: 'confirm',
    mutating: true,
    category: 'Quality & language',
  },
  {
    name: 'typecheck',
    summary:
      'Run TypeScript type checking for an auto-detected or specified tsconfig. Use it after type-affecting changes; it reports diagnostics without writing source files.',
    permission: 'confirm',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'test',
    summary:
      'Run the detected test runner for selected tests, with optional name filtering, coverage, watch, and timeout controls. Prefer focused tests first, then broader validation as needed.',
    permission: 'confirm',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'language_info',
    summary:
      'Inspect detected language tooling, workspaces, and supported operations for the project or target path. Use it before invoking language-specific tooling.',
    permission: 'auto',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'language',
    summary:
      'Run a supported language-tooling operation in a detected workspace. Use it when the language profile provides a safer, structured alternative to an arbitrary shell command.',
    permission: 'confirm',
    mutating: true,
    category: 'Quality & language',
  },
  {
    name: 'language_package',
    summary:
      'Plan or perform a dependency operation through the detected package ecosystem. Use dry-run first when possible and specify the workspace or dependency scope deliberately.',
    permission: 'confirm',
    mutating: true,
    category: 'Quality & language',
  },
  {
    name: 'install',
    summary:
      'Install project dependencies with the detected package manager. Use only when dependency changes are required, and inspect lockfile and manifest changes afterward.',
    permission: 'confirm',
    mutating: true,
    category: 'Dependencies & operations',
  },
  {
    name: 'audit',
    summary:
      'Run the package manager’s dependency vulnerability audit and summarize actionable findings. Use it to assess known dependency advisories, not source-code vulnerabilities.',
    permission: 'confirm',
    mutating: false,
    category: 'Dependencies & operations',
  },
  {
    name: 'outdated',
    summary:
      'List outdated project dependencies and available versions without changing manifests or lockfiles. Use it to plan dependency maintenance.',
    permission: 'confirm',
    mutating: true,
    category: 'Dependencies & operations',
  },
  {
    name: 'logs',
    summary:
      'Read or tail configured local, container, or process logs with bounded output. Use it to investigate a known runtime failure or service behavior.',
    permission: 'confirm',
    mutating: false,
    category: 'Dependencies & operations',
  },
  {
    name: 'design',
    summary:
      'Choose, preview, or materialize a UI design kit (e.g. minimal-clarity, neo-brutalist) for the active stack. Lists available kits, previews tokens, or writes a design-token source file to the project.',
    permission: 'confirm',
    mutating: true,
    category: 'Generation & design',
  },
  {
    name: 'tool_search',
    summary:
      'Search the full tool catalog by name or description, including tools whose schemas were withheld from this request to save tokens. Results include each matching tool input schema; use it before concluding a capability is unavailable, then invoke the local tool with tool_use instead of searching MCP.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'clarify',
    summary:
      'Record or ask a focused clarification when a missing decision would materially change the implementation. Do not use it for questions that can be answered from the repository.',
    permission: 'auto',
    mutating: false,
    category: 'Work & state',
  },
  {
    name: 'tool_use',
    summary:
      'Invoke a registered tool by its exact name, including one not listed in this request. Use it for a tool found through tool_search; the call still goes through the same permission and capability checks as a direct call.',
    permission: 'confirm',
    mutating: true,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-index',
    summary:
      'Build or refresh the local semantic codebase index, optionally for selected languages. Use it when index results are absent or stale; force performs a full reindex.',
    permission: 'confirm',
    mutating: true,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-search',
    summary:
      'Search indexed symbols, signatures, and documentation with optional language, kind, path, or LSP-kind filters. Use it for semantic discovery before broad text search.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-skeleton',
    summary:
      'Extract a compact structural skeleton from a source file or directory, preserving declarations while omitting implementation detail. Use it to understand unfamiliar code quickly.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-repo-map',
    summary:
      'Generate a centrality-ranked, token-budgeted Repository Map within ~1200 tokens by default: package clusters with their hub file, the repo-wide hotspots, then the signatures of the most central files. Use at the beginning of complex tasks or when navigating unfamiliar repositories to get a bird-eye view of the architecture.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-context',
    summary:
      'Find the files and declarations a task touches from a plain-language description. Ranked symbol search seeds a personalised walk over the reference graph, so results include what the matches are structurally attached to, not just what matched by name. Start here for any task spanning more than one file.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-ast-replace',
    summary:
      'Replace a named declaration using source-aware structure instead of fragile text matching. Use it for a function, method, class, interface, or variable when the target is unambiguous.',
    permission: 'confirm',
    mutating: true,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-invariant-check',
    summary:
      'Compare candidate code with its original source and report structural invariants that may have changed. Use before writing a risky refactor; it validates but does not modify files.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-impact-analysis',
    summary:
      'Find likely callers, dependents, related tests, and change risk for a named symbol. Use it before changing a public or widely used declaration.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-targeted-test',
    summary:
      'Discover and run tests that cover a specified symbol, source file, or explicit test files. Use it for focused regression validation after a change.',
    permission: 'confirm',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'security-ast-scan',
    summary:
      'Statically scan source code for supported security patterns and return findings with locations. Use it as a focused code check, not as a substitute for a full security assessment.',
    permission: 'auto',
    mutating: false,
    category: 'Quality & language',
  },
  {
    name: 'codebase-incoming-calls',
    summary:
      'Find indexed call sites that invoke a named function, method, or type, optionally scoped to a file. Use it to estimate breakage before changing an API.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-outgoing-calls',
    summary:
      'Find indexed symbols called by a named function, method, or type, optionally scoped to a file. Use it to understand dependencies before refactoring behavior.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'codebase-stats',
    summary:
      'Report codebase-index health, indexed file and symbol counts, languages, and freshness. Use it before relying on indexed discovery results.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
  {
    name: 'dead-code-scan',
    summary:
      'Analyze the indexed project for declarations that appear unreachable from configured entry points. Treat results as candidates for review, not automatic deletion instructions.',
    permission: 'auto',
    mutating: false,
    category: 'Discovery & index',
  },
] as const;

export const pluginSources = ['Core', 'Suite', 'Bridge'] as const;

export const pluginCatalog = [
  {
    name: 'wstack-prompts',
    risk: 'medium',
    summary: 'Prompt library and prompt authoring commands.',
    defaultState: 'active',
    source: 'Core',
  },
  {
    name: 'wstack-sync',
    risk: 'medium',
    summary: 'Cloud sync commands for prompts, skills, settings, memory, and history.',
    defaultState: 'active',
    source: 'Core',
  },
  {
    name: 'wstack-cloud-config-sync',
    risk: 'medium',
    summary: 'my.wrongstack.com config synchronization over the namespaced sync API.',
    defaultState: 'active',
    source: 'Core',
  },
  {
    name: 'wstack-chimera',
    risk: 'medium',
    summary: 'Spawns a post-session code review subagent when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Core',
  },
  {
    name: 'wstack-skills',
    risk: 'medium',
    summary: 'Skill library, authoring, install, update, and uninstall commands.',
    defaultState: 'active',
    source: 'Core',
  },
  {
    name: 'wstack-auto-review',
    risk: 'medium',
    summary: 'Tracks changed files and requests bounded mid-session Chimera reviews.',
    defaultState: 'inactive',
    source: 'Core',
  },
  {
    name: 'wstack-specialist-triggers',
    risk: 'medium',
    summary: 'Spawns roster specialists when files matching their patterns change.',
    defaultState: 'inactive',
    source: 'Core',
  },
  {
    name: 'agent-handoff',
    risk: 'medium',
    summary: 'Automatically posts subagent results to the mailbox when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'auto-doc',
    risk: 'medium',
    summary: 'Generates JSDoc/TSDoc comments for source files.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'auto-i18n-extractor',
    risk: 'low',
    summary:
      'Finds hardcoded user-facing UI strings and suggests i18n keys when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'accessibility-auditor',
    risk: 'medium',
    summary: 'Scans UI files for common accessibility issues when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'git-autocommit',
    risk: 'high',
    summary: 'Stages files and creates AI-generated conventional commits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'shell-check',
    risk: 'low',
    summary: 'Runs shellcheck on shell scripts.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'cost-tracker',
    risk: 'low',
    summary: 'Tracks token usage and estimated session cost.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'file-watcher',
    risk: 'medium',
    summary: 'Watches project files and emits change events.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'cron',
    risk: 'medium',
    summary: 'Schedules recurring in-session tasks.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'template-engine',
    risk: 'medium',
    summary: 'Expands and writes file templates.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'semver-bump',
    risk: 'high',
    summary: 'Computes version bumps, changelogs, and tags.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'secret-scanner',
    risk: 'high',
    summary: 'Blocks or redacts credential leaks in tool input and output.',
    defaultState: 'active',
    source: 'Suite',
  },
  {
    name: 'token-budget',
    risk: 'medium',
    summary: 'Warns or stops when token budgets are exceeded.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'lint-gate',
    risk: 'medium',
    summary: 'Runs lint checks before write/edit commits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'branch-guard',
    risk: 'high',
    summary: 'Enforces project-specific protected-branch policy when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'diff-summary',
    risk: 'low',
    summary: 'Injects compact git diff context after edits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'commit-validator',
    risk: 'medium',
    summary: 'Enforces conventional-commit policy when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'format-on-save',
    risk: 'medium',
    summary: 'Runs formatter after write/edit tool calls.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'test-runner-gate',
    risk: 'medium',
    summary: 'Runs relevant tests after source edits when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'import-organizer',
    risk: 'medium',
    summary: 'Sorts imports and applies safe linter fixes after edits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'todo-listener',
    risk: 'low',
    summary: 'Broadcasts todo tool updates to the project mailbox when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'session-recap',
    risk: 'low',
    summary: 'Posts a session recap to the project mailbox on stop.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'spec-linker',
    risk: 'low',
    summary: 'Finds unlinked plugin references in markdown edits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'doc-sync-guard',
    risk: 'low',
    summary:
      'Warns when docs drift from recently changed public source files when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'loop-breaker',
    risk: 'low',
    summary: 'Detects runaway tool-call loops; warns, then blocks repeats.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'gitignore-guard',
    risk: 'medium',
    summary: 'Suggests or appends ignore rules for generated artifacts after writes and edits.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'path-guard',
    risk: 'medium',
    summary: 'Enforces project-specific protected-path policy when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'context-pins',
    risk: 'low',
    summary: 'Pins durable facts into the system prompt across compactions.',
    defaultState: 'active',
    source: 'Suite',
  },
  {
    name: 'checkpoint',
    risk: 'medium',
    summary: 'Retains pre-edit file contents in memory when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'error-lens',
    risk: 'low',
    summary: 'Distills failed command output into compact error digests.',
    defaultState: 'active',
    source: 'Suite',
  },
  {
    name: 'dep-guard',
    risk: 'medium',
    summary: 'Supervises dependency installs: deny list and typosquat warnings.',
    defaultState: 'active',
    source: 'Suite',
  },
  {
    name: 'dependency-vulnerability-gate',
    risk: 'high',
    summary: 'Runs a blocking dependency audit after installs when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'license-audit-gate',
    risk: 'high',
    summary: 'Audits dependency licenses after package installs.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'security-hotspot-scanner',
    risk: 'high',
    summary:
      'Scans source files for common security anti-patterns on demand or when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'api-compatibility-gate',
    risk: 'medium',
    summary: 'Warns when public entry-point exports are removed when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'migration-planner',
    risk: 'low',
    summary: 'Builds evidence-backed migration checklists with optional LLM risk analysis.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'schema-evolution-guard',
    risk: 'high',
    summary: 'Warns on destructive database or API schema changes.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'config-validator',
    risk: 'low',
    summary: 'Validates JSON/YAML/TOML files right after write/edit.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'notify-hub',
    risk: 'medium',
    summary: 'Sends session events and ad-hoc notifications to a webhook.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'changelog-writer',
    risk: 'low',
    summary: 'Collects session work and writes Keep-a-Changelog entries.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'injection-shield',
    risk: 'low',
    summary: 'Flags prompt-injection patterns in tool output.',
    defaultState: 'active',
    source: 'Suite',
  },
  {
    name: 'llm-cache',
    risk: 'medium',
    summary: 'Caches identical provider requests (opt-in; wraps every LLM call).',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'model-router',
    risk: 'medium',
    summary: 'Routes each LLM call to a different model by size/tool rules (opt-in).',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'pr-drafter',
    risk: 'low',
    summary: 'Generates session pull request draft markdown.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'prompt-firewall',
    risk: 'high',
    summary: 'Detects/redacts credential leaks on the provider wire (opt-in).',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'auto-escalate',
    risk: 'medium',
    summary: 'Retries with an escalated model on transient provider errors (opt-in).',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'token-throttle',
    risk: 'medium',
    summary: 'Rolling-window tokens/min rate limiting via provider-call delays (opt-in).',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'plugin-stack-observer',
    risk: 'low',
    summary: 'Reports provider wrapper stack order and health.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'test-coverage-gate',
    risk: 'medium',
    summary: 'Checks coverage thresholds after test runs.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'test-flake-detector',
    risk: 'medium',
    summary: 'Runs tests repeatedly to identify flaky failures.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'performance-regression-gate',
    risk: 'medium',
    summary: 'Compares benchmark results and reports performance regressions.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'type-gate',
    risk: 'medium',
    summary: 'Runs TypeScript type checks after relevant edits when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'duplicate-code-detector',
    risk: 'low',
    summary:
      'Detects duplicate or similar code blocks across source files on demand or when explicitly enabled.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'release-notes-generator',
    risk: 'low',
    summary: 'Builds traceable release notes with optional hash-preserving LLM polish.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'process-guard',
    risk: 'high',
    summary:
      'Reports kill commands; built-in bash and exec guards enforce protection for WrongStack processes and host terminals.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: 'test-generator',
    risk: 'low',
    summary: 'Generates framework-correct test files with optional behavior-focused LLM authoring.',
    defaultState: 'inactive',
    source: 'Suite',
  },
  {
    name: '@wrongstack/plug-lsp',
    risk: 'medium',
    summary: 'Language Server Protocol tools and slash commands.',
    defaultState: 'inactive',
    source: 'Bridge',
  },
  {
    name: 'telegram',
    risk: 'medium',
    summary: 'Telegram bridge for messages, approvals, and notifications.',
    defaultState: 'inactive',
    source: 'Bridge',
  },
] as const;

/* =========================================================================
   Detail-page helpers — slugs and lookups for /plugins/:slug and /tools/:slug.
   ========================================================================= */

export type PluginCatalogEntry = (typeof pluginCatalog)[number];
export type ToolCatalogEntry = (typeof toolCatalog)[number];

export function pluginSlug(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '-');
}

export function pluginFromSlug(slug: string): PluginCatalogEntry | undefined {
  return pluginCatalog.find((plugin) => pluginSlug(plugin.name) === slug);
}

export function toolSlug(name: string): string {
  return name.replace(/_/g, '-');
}

export function toolFromSlug(slug: string): ToolCatalogEntry | undefined {
  return toolCatalog.find((tool) => toolSlug(tool.name) === slug);
}

/** Derived counts — always match the actual array lengths, never hardcode. */
export const TOOL_COUNT = toolCatalog.length;
export const PLUGIN_COUNT = pluginCatalog.length;
