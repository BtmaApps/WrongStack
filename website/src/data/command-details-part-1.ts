import type { CommandDetailMap } from './command-detail-types';

export const commandDetailsPart1: CommandDetailMap = {
  '/goals': {
    purpose: 'Inspect every executable goal in the current project without changing a run.',
    behavior:
      '`/goals` lists the project catalog; `/goals <id>` accepts a unique id prefix. Rows show owner/session, tasks, phases, blockers, branch and verification. No-task progress is unknown, and completed tasks do not establish final verification. WebUI My Goals projects the same catalog; another terminal retains control of its run.',
    before: 'Start an executable run with `/goal start <goal>` or inspect an existing project.',
    during: 'Read ownership, reachability and verification separately from task progress.',
    after:
      'Send pause, stop or retry through the owning terminal. Review the retained goal branch before integration.',
  },
  '/nextsteps': {
    purpose: 'Choose how finished turns propose more work and bound automatic continuation.',
    behavior:
      '`/nextsteps required [limit]` requires a next action or an explicit completion marker. `optional` makes suggestions conditional; `limit <n>` caps consecutive automatic turns, with 0 or unlimited removing that cap. Defaults are required and unlimited. In auto autonomy, open todos take priority and repeated suggestions still stop the loop. A typed prompt re-arms the counter; WebUI settings are per tab.',
    before: 'Choose `/autonomy auto` when you want suggestions to continue automatically.',
    during:
      'Use `/nextsteps` to inspect the mode and limit; choose a finite cap when you want an input checkpoint.',
    after:
      'Required mode completion stops further suggestions. These controls do not grant tool permissions.',
  },
  '/solo': {
    purpose: 'Choose the TUI session worker policy before submitting work.',
    behavior:
      '`/solo on` blocks delegation, background workers, Chimera and companions. `/solo companions` permits only resident read-only Memory/Explore companions; `/solo off` admits workers subject to normal capability, budget and depth controls. The session records its policy for resume and refuses changes after the runtime locks it.',
    before: 'Choose the worker policy before the first message.',
    during: 'Use `/solo status` to inspect the selected mode and lock reason.',
    after: 'The policy does not disable leader tools or change the profile fleet defaults.',
  },
  '/effort': {
    purpose: 'Inspect or set reasoning effort for the active leader model.',
    behavior:
      '`/effort` shows the current setting and supported levels. `/effort <level>` updates the active profile and live leader configuration. `auto` or `clear` removes the explicit pin. `matrix` reads role/phase overrides; use `/setmodel reasoning-effort <role|phase|*> <level>` to change those. Unsupported documented levels are refused; unknown capabilities still depend on the provider request resolver.',
    before: 'Inspect the current model vocabulary before selecting an effort level.',
    during:
      'The next request uses the resolved effort. Startup and TUI model pickers also expose model-aware effort choices.',
    after:
      'Clearing the leader setting does not clear worker overrides or prove provider wire support.',
  },
  '/permissions': {
    purpose: 'Explain a tool decision and manage temporary session rules.',
    behavior:
      '`rules` shows compiled policy order and YOLO state. `explain <tool> [JSON]` evaluates a call without executing it. `allow`, `deny`, `remove <n>` and `clear` manage session overrides. Rules are not written to profile or project trust files; restricted mode ignores session allows while retaining denies.',
    before: 'Identify the registered tool and input whose decision you want to inspect.',
    during:
      'Read the compiled rule view; destructive calls, sensitive reads and higher-priority boundaries can still require approval or refuse.',
    after:
      'The shell `wstack permissions` command creates a fresh-session view and cannot inspect this session’s temporary answers.',
  },
  '/sandbox': {
    purpose: 'Inspect the resolved exec-family sandbox policy and its recent audit records.',
    behavior:
      'Run `/sandbox` to see mode, tier, backend and writable roots for bash, exec and git. Add `--audit` for recent in-process denial and expansion records. Configure tools.sandbox in your profile; this command only reports policy. Sandbox mode is off by default. The policy-only backend is advisory, full-access does not route, and containment depends on the configured Docker or Windows helper backend.',
    before: 'Choose the sandbox mode, tier and backend in your profile configuration.',
    during: 'Review the effective policy; use `/sandbox --audit` to inspect recent decisions.',
    after:
      'Permission checks still apply. An enforced label alone does not establish OS containment.',
  },
  '/scout-stats': {
    purpose: 'Compare tool discovery and delegation recorded under each system-prompt variant.',
    behavior:
      'Run `/scout-stats [sessions]` to inspect the last project session journals: 20 by default, up to 200. The report groups token usage, tool calls, empty tool searches, found-then-used tools and delegation by Scout, Lite, Standard and Pro. Journals without a recorded variant appear as unrecorded. It reads existing evidence and makes no extra model call.',
    before: 'Use `--system-scout` or `--system-prompt scout` to start a Scout session.',
    during:
      'Compare discovery results and delegation share; solo policy intentionally disables delegation.',
    after:
      'Use the recorded evidence to tune discovery guidance. The report does not certify task quality.',
  },
  '/bughunt': {
    purpose: 'Investigate a scoped defect with evidence before and after a minimal fix.',
    behavior:
      'In a Solo session, `/bughunt [scope]` starts one round. `/bughunt --rounds 3 packages/tui` authorizes three sequential rounds; WebUI also offers scope and round controls. A round may fix one proven root cause. The prompt asks for a failing reproduction, an unaffected control case, unchanged passing checks after the fix, and a retained regression. A round budget does not promise a bug count.',
    before: 'Choose a bounded scope and record the starting revision and existing changes.',
    during:
      'Trace a reachable production path and reproduce the defect before editing. Report verification gaps explicitly.',
    after:
      'Review the outcome: fixed-and-verified, fixed-verification-incomplete, no-proven-bug, or blocked. These reports are not automatically certified by the application.',
  },
  '/btw': {
    purpose: 'Add a non-aborting "by the way" note that reaches the agent on its next iteration.',
    behavior:
      '`/btw <note>` stashes a short note on the live run context. Unlike an aborting steer, the agent keeps working and the note is folded in at the start of its next iteration — between tool batches. If no run is active, the note rides along on the next turn the agent takes. `pendingBtwCount` tracks queued notes.',
    before: 'No preparation needed. Just have the note ready while the agent works.',
    during:
      'The agent is not interrupted — it continues the current tool batch and sees the note next iteration.',
    after:
      'The note becomes part of the next turn’s context. It steers without discarding in-flight work.',
  },

  '/next': {
    purpose:
      'Toggle automatic next-task prediction — the agent suggests what to do after the current task completes.',
    behavior:
      'When enabled, after each completed turn the REPL runs a lightweight single-shot prediction and shows the 1-3 most likely next steps (display-only). You select stored suggestions with `/next 1` (or `/next 1 2 3`; commas also work), list them with `/next list`, or clear with `/next clear`. Bare `/next` reports the current state; `/next on|off|toggle` changes it and persists to config. Selected suggestions execute as the next agent turn, bypassing refinement.',
    before:
      'Check whether you want predictive suggestions for your workflow style. Some users prefer manual control.',
    during:
      'If toggling on, observe the next task completion — suggestions appear at the end of the agent response.',
    after:
      'Use `/next list` to see available suggestions or `/next 1` to select one. Disable with another `/next` if it gets distracting.',
  },

  '/suggest': {
    purpose:
      'Generate context-aware next-step suggestions manually, with an optional fast heuristic mode that skips the model call.',
    behavior:
      'The command collects git status and working-directory context and asks a lightweight suggest subagent for 3-5 actionable prompts, storing them for `/next` selection. `--fast` (or `-f`) uses deterministic heuristics instead of the subagent; `--fresh` bypasses the ~60s result cache; without `onSpawnAndWait` it falls back to heuristics.',
    before: 'Complete or pause your current task so the context reflects what remains to be done.',
    during:
      'Suggestions appear as a numbered list. Heuristic mode returns near-instantly; model mode may take a few seconds.',
    after: 'Type `/next <number>` to select a suggestion or `/next list` to review them again.',
  },

  '/enhance': {
    purpose:
      'Refine a prompt before it is sent to the agent — improve clarity, add missing context, or rephrase for better results.',
    behavior:
      '`/enhance on`, `off` and `toggle` control automatic prompt refinement. Each pass rewrites the latest message using recent conversation as read-only context. Prompt and goal refinement share provider/model target rules; preview and failure decisions are shared by TUI and WebUI. Recorded evidence includes the effective target, usage and outcome.',
    before:
      'Write a rough prompt — even a few words will do. The enhancer works best when you give it a clear goal statement.',
    during:
      'Accept refined or English text, keep the original, edit, retry or cancel. A failure can retry the same target or a selected fallback instead of silently changing the submitted text.',
    after:
      'The accepted prompt is sent to the agent. If you edited it, your version is used. If cancelled, nothing is sent.',
  },

  '/fix': {
    purpose:
      'Classify an error and route it into a focused repair workflow — faster than explaining the bug manually.',
    behavior:
      'The command classifies the pasted error (or problem description) via a multi-language pattern table (TypeScript, Rust, Go, Python, security, infra, and more), then injects a per-turn directive as the next agent turn with matching skill hints (typescript-strict, bug-hunter, security-scanner, tech-stack, …). Only classifications that need multi-file analysis request delegation to a role-mapped subagent; simple fixes run inline.',
    before:
      'Keep the error message handy — copy it from your terminal or let the command read the last session error.',
    during:
      'The classifier identifies the error type, then a repair workflow runs. You see diagnostic output and the proposed fix.',
    after:
      'Review the diff. Run tests to confirm the fix. If the classifier misidentified the error, re-run with a pasted error message.',
  },

  '/goal': {
    purpose:
      'Create an executable phase goal or maintain a persistent eternal/parallel mission, with explicit ownership and recorded progress.',
    behavior:
      '`/goal start <goal>` creates an executable phase run. New git-backed runs use a dedicated goal checkout; phase worktrees integrate into that retained goal branch. `/goals` and `/goal status <id>` inspect all project runs, and other terminals retain their own control. `/goal set`, `refine` and `journal` operate the separate persistent goal.json mission used by eternal/parallel autonomy; the catalog does not migrate that aggregate into multiple missions.',
    before:
      'Formulate a concrete, achievable mission statement. Goals work best when they are scoped to a session or a few sessions. List the deliverables you expect the agent to finish — the engine uses them for both the Kanban board and the progress bar.',
    during:
      'Inspect task progress, phase state, owner, blockers and final verification independently. Pause stops admitting new tasks while active work settles; stop fences late verification results. Another terminal’s snapshot is observable without granting mutation rights.',
    after:
      'Review the goal branch and verification evidence before integration. A stopped final gate can resume without replaying completed tasks; inspect unmerged phases first. Use `/goal journal` for the separate persistent mission’s recorded history.',
  },

  '/autonomy': {
    purpose:
      'Set the active autonomy level — control how independently the agent chooses and executes tasks.',
    behavior:
      'Autonomy modes are off, suggest, auto, eternal and eternal-parallel. `/autonomy` without arguments shows the current level. `/autonomy <level>` sets it; eternal modes confirm a goal exists and force YOLO on before starting their engine. auto self-drives with Esc/Ctrl+C to redirect; eternal runs a goal-driven loop, eternal-parallel fans out 4-8 subagents per tick, both until `/autonomy stop`. Higher levels unlock automatic task chaining, goal pursuit, and proactive tool use.',
    before:
      'Decide how much control you want to retain. Higher autonomy is powerful but requires trust in the agent judgment.',
    during:
      'The new level takes effect immediately. The status line updates to reflect the change.',
    after:
      'Observe the agent behavior for a few turns. Lower autonomy if it overreaches; raise it if you want less micromanagement.',
  },

  '/plan': {
    purpose:
      'Manage the per-session strategic plan board — outline big-picture work and track progress across turns.',
    behavior:
      '`/plan add "title"` creates an item. `/plan start <id|#>` marks it in progress; `/plan done <id|#>` completes it. `/plan promote <id|#> [subtask ...]` (alias `derive`) derives todos from a plan item; `taskify` copies an item into the task store; `template [list|use <name>]` applies bundled templates; `remove`/`clear` refuse while items are unfinished. The plan is a per-session JSON file (planPath) and prints after each mutation; `--json` returns stable output.',
    before:
      'Think about the high-level milestones for your session. Plans are coarser than todos — they represent phases or features.',
    during: 'The plan board prints after each mutation. Active items show their status.',
    after:
      'Use `/plan promote` to convert completed plan items into actionable todos for detailed execution.',
  },

  '/review': {
    purpose: 'Trigger a Chimera code review of the files changed in this session.',
    behavior:
      'The command collects added/modified files from git (skipping `.wrongstack/`), reads their content, and emits a chimera.review_needed event handled by the read-only Chimera review subagent (read, grep, glob, tree, index search). It reviews up to 30 changed files by default; `--limit <n>` (1–200) and `--files <substr>` narrow the set. Review claims are installed before the event fires so concurrent sessions cannot review the same content.',
    before:
      'Stage or diff the changes you want reviewed. Narrow the scope with a file path for faster, more focused reviews.',
    during:
      'The review runs as a focused model pass. It produces a categorized report with file references and severity tags.',
    after:
      'Address critical and high-severity findings. Re-run the review after fixes to confirm resolution.',
  },

  '/kanban': {
    purpose:
      'Manage durable Kanban boards — create columns, add dependency-aware tasks, assign work, and dispatch to the fleet.',
    behavior:
      'The full Kanban system supports multiple boards, columns, tasks with dependency chains, assignments, leases, heartbeats, and fleet dispatch. `/kanban open` (aliases `panel`, `tui`) opens the TUI panel; `/kanban create <title>` creates a board; `/kanban snapshot` (alias `queue`) prints the orchestration snapshot. Task subcommands back ready/dispatch flows. Aliases: `/kb`, `/board`.',
    before:
      'Create a board with columns matching your workflow (e.g., Todo, Running, Review, Done). Define task dependencies before dispatching.',
    during:
      'The TUI panel shows live column state. Dispatched tasks appear in the fleet with lease tracking.',
    after:
      'Run `/kanban snapshot` to persist board state. Recover stale tasks with `/kanban task recover`.',
  },

  '/refiner': {
    purpose: 'Inspect or select a dedicated refinement provider/model and fallback profile.',
    behavior:
      '`/refiner show` displays the configured provider, model and fallback profile. `set provider <id>`, `set model <id>` and `set fallback-profile <name>` persist them to the active profile; `clear` removes all three. Resolution considers named fallback-profile candidates before the explicit target and fills omitted fields from the session. Prompt and goal refinement share this ordering; configured models need not be favorites. `/enhance` controls whether prompt refinement runs.',
    before: 'Configure the provider credentials and named fallback profile you intend to use.',
    during:
      'Inspect the effective target and recorded usage/outcome; unavailable targets use the consumer’s fallback or recovery flow.',
    after: 'Test with a sample prompt to verify the refinement level matches your expectations.',
  },

  '/compact': {
    purpose:
      'Run the configured context-window compactor immediately — reclaim token space without losing essential context.',
    behavior:
      '`/compact` runs the configured compactor (`trigger: manual`); `/compact aggressive` compacts more aggressively. The compactor summarizes older turns to reclaim tokens, reports before/after counts plus per-phase reductions, and also repairs orphan tool_use/tool_result blocks. If the context changed or the run stopped mid-compaction, the stale result is discarded.',
    before:
      'Check current context usage with `/context` or `/stats`. Compact when you are above 70% of the window.',
    during:
      'The compaction runs as a model pass. It may take a few seconds. A summary note is injected post-compaction.',
    after:
      'Review the compaction summary to ensure no critical context was lost. Continue working — the agent remembers the essentials.',
  },

  '/context': {
    purpose:
      'Inspect, repair, and tune context modes, thresholds, and limits — control how the agent manages its working memory.',
    behavior:
      '`/context` shows the measured context window state: token breakdown by source, message counts, and thresholds. `/context mode` lists the context-window modes (balanced, frugal, deep) and `mode <id>` switches for the session; `limit [tokens] [--persist]` reads or sets the effective window; `thresholds <warn> <soft> <hard>` tunes compaction thresholds; `repair` removes orphan tool_use/tool_result frames; `cache` prints the prompt-cache report. The `/ctx` alias works interchangeably.',
    before:
      'Check `/stats` first for a quick overview. Use `/context` when you need to inspect or modify the context strategy.',
    during:
      'The command output shows the live context state. Mode switches and threshold changes apply immediately.',
    after:
      'Monitor context usage over the next few turns to confirm the new settings work for your workflow.',
  },

  '/diag': {
    purpose:
      'Inspect runtime diagnostics and active system state — a comprehensive health check for the current session.',
    behavior:
      'The CLI host prints provider/model and optional wire family, project root, token totals, estimated cost, tool/MCP counts, recent errors and recent side effects. It does not enumerate Node version, process memory, plugins or loaded skills. Output depends on the host adapter.',
    before: 'No preparation needed. Run it anytime you want a system health snapshot.',
    during:
      'The report prints section by section. Each section is labeled and can be visually scanned for warnings.',
    after:
      'Address any warnings or errors shown in the report. Share the output when filing a bug report.',
  },

  '/stats': {
    purpose:
      'Show token, cost, and iteration statistics for the current session — understand where your budget is going.',
    behavior:
      'The CLI SessionStats report shows elapsed time, iterations, API requests, token/cache usage, estimated cost, per-tool counts and average durations, and file/shell/fetch activity. First-token latency and error counts appear when available. An inactive session has no report yet.',
    before:
      'No preparation needed. Run it to check your usage against provider limits or cost concerns.',
    during: 'The stats print instantly — no model call required.',
    after:
      'If costs are high, consider switching to a cheaper model with `/setmodel` or compacting with `/compact`.',
  },

  '/memory': {
    purpose: 'Search, graph, verify, clean, import, and inspect the structured Sage system.',
    behavior:
      'Sage persists facts across sessions. `/memory search <query>` finds relevant memories. `/memory graph` shows the knowledge graph. `/memory verify` checks integrity. `/memory hygiene` cleans stale entries. `/memory import-legacy` loads from the legacy flat-file store; `remember`, `update`, `delete`/`forget` edit structured entries; `race` and `diagnostics` compare the lexical and semantic channels. The memory system auto-injects relevant facts into agent context.',
    before:
      'Think about what you want to find or manage. Use search for fact retrieval, graph for relationship exploration.',
    during:
      'Search results show relevance scores. Graph view shows nodes and edges. Hygiene operations show what was cleaned.',
    after:
      'Verified memories are more reliable. After importing, search to confirm the data landed correctly.',
  },

  '/todos': {
    purpose: 'View and manage the current session todo list — the agent tactical task tracker.',
    behavior:
      'The todo list is the agent per-turn task list. `/todos` prints all items with their status (pending, in_progress, completed). The agent updates it automatically as it works. You can add (`/todos add <text>`), complete (`/done`, `done-all`) or remove items — there is no reorder. Todos bound to Kanban tasks are projections: mutate them through Kanban. Unlike /tasks, todos are ephemeral and reset each session.',
    before: 'No preparation needed. Run it to see what the agent is currently working on.',
    during: 'The list prints with status indicators. Only one item can be in_progress at a time.',
    after:
      'Completed items stay visible for the session. Use `/todos clear` to reset the list (refused while Kanban projections are present).',
  },

  '/tasks': {
    purpose:
      'Manage structured tasks with priorities, dependencies, types, and assignments — a richer alternative to todos.',
    behavior:
      'Tasks support types (feature, bugfix, refactor, docs, test, chore), priorities (critical, high, medium, low), dependency chains, assignees, and statuses (pending, in_progress, blocked, failed, review, completed). `/tasks` shows progress plus the list; `start`/`done`/`fail`/`status` change state and refuse while dependencies are unfinished. Tasks are session-isolated by default and survive resume; use `scope: "project"` in the task tool to share across sessions. `/tasks promote` converts a task into todo items; `planify` promotes it to a plan item.',
    before:
      'Plan your task hierarchy. Define dependencies before marking tasks ready to avoid blocked states.',
    during: 'The task list prints with type badges, priority indicators, and dependency arrows.',
    after: 'Completed tasks can be promoted to todos for detailed execution tracking.',
  },

  '/save': {
    purpose:
      'Force the live session writer to flush to disk — persist the current conversation state immediately.',
    behavior:
      'The session writer buffers events and flushes periodically. `/save` calls `ctx.session.flush()` to force buffered events to disk immediately — no session_end marker is written, because the session is still running. Use it before a risky operation or before closing the terminal.',
    before: 'No preparation needed. It is safe to run at any time.',
    during: 'The flush happens synchronously — the prompt returns when the write is complete.',
    after:
      'Your session is now durable on disk. You can safely exit or resume later with `/sessions`.',
  },

  '/sessions': {
    purpose:
      'List and resume saved sessions — pick up where you left off, also available as `/resume` and `/load`.',
    behavior:
      'The command lists recent sessions with ids, names, dates and auto-derived titles. Subcommands: `status`/`live` (live registry view), `agents`, `kill <id> [--force]` (SIGTERM another session by PID), `rename <id> [name]`, `move <id> <path>` (to another worktree/project), `archive [<id>|--apply]` (gzip closed JSONL logs), and `rehydrate <id>`. Resuming is done through `/resume` (interactive picker, `--incomplete` for crashed sessions) or `wstack resume <id>` — there is no `/sessions delete`; deletion is `/prune`.',
    before: 'Save your current session with `/save` first if you plan to switch.',
    during:
      'The session list prints with IDs and metadata. Resuming loads the session and prints a restore summary.',
    after:
      'Verify the restored context is correct. The agent should remember your previous task and plan.',
  },

  '/prune': {
    purpose:
      'Preview or delete old session data — free disk space by removing stale transcripts and checkpoints.',
    behavior:
      '`/prune` deletes sessions older than 30 days by default; `/prune 14` uses a 14-day cutoff (1–365). `/prune --dry-run` previews what would be deleted without deleting. `/prune --checkpoints` reclaims workspace checkpoints no session references; `/prune --rebuild-index` rebuilds the session index from disk. Pruning is irreversible — use `--dry-run` first. To compress instead of delete, use `/sessions archive`.',
    before:
      'Run `/prune --dry-run` first to preview what would be deleted. Confirm nothing important is in the list.',
    during: 'The dry run lists sessions older than the cutoff. Deletion reports the pruned count.',
    after:
      'Run `/prune --dry-run` again to confirm the old sessions are gone. The checkpoint sweep reports reclaimed MiB.',
  },

  '/exit': {
    purpose: 'Close the REPL cleanly — aliases include `/quit` and `/q`.',
    behavior:
      'The command runs the host’s before-exit hook (e.g. an uncommitted-changes check that can abort with a message; the exit still proceeds) and then the exit hook, which performs the surface’s clean teardown before the process ends. Use this instead of Ctrl+C for a clean exit.',
    before: 'Confirm you want to end the session. Any running fleet operations will be terminated.',
    during:
      'The shutdown sequence prints: saving session, stopping agents, cancelling timers, exiting.',
    after: 'The terminal returns to your shell. Your session is saved for later resume.',
  },

  '/interrupt': {
    purpose:
      'Abort the in-flight leader iteration safely — stop the agent mid-thought without corrupting session state.',
    behavior:
      '`/interrupt` (aliases `/stop`, `/int`) aborts the in-flight leader run via the surface-installed interrupt controller and also kills every running subagent through the fleet hook; `/interrupt all` is the same spelled explicitly. In the TUI and WebUI a slash command dispatches even mid-run; in the plain REPL the prompt blocks during a run, so Ctrl+C remains the mid-run path there.',
    before: 'Use when the agent is stuck, looping, or heading in the wrong direction.',
    during:
      'The interrupt signal propagates. In-flight tool calls may complete or abort depending on their phase.',
    after:
      'The REPL prompt returns. Review what the agent was doing and provide corrective steering.',
  },
};
