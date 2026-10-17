# @wrongstack/vibeui

A focused coding workspace between SimpleUI and the full WebUI. Fresh Next.js
App Router/Radix UI design, served by the existing WrongStack HTTP/WebSocket host.

## Run

```sh
bun install --frozen-lockfile
bun run --filter @wrongstack/vibeui build
bun run --filter @wrongstack/cli build
wstack vibeui --open
```

`wstack --vibeui` is equivalent. The launch menu includes VibeUI; its default port
is **3476**. Existing `--port`, `--host`, `--open` and browser authentication flags
apply. The package contains prebuilt `dist` assets for npm and standalone binaries.
It does not start a separate Next server in production.

## Development

Start the backend on another port, then Next's development server:

```sh
wstack vibeui --port 3477
bun run --filter @wrongstack/vibeui dev
```

Next development runs at `http://127.0.0.1:3476`. The development-only WebSocket
meta configuration defaults to `ws://127.0.0.1:3477`; set
`WRONGSTACK_BACKEND_PORT` to use a different backend port. With required auth,
open the development page with a valid backend `?token=`. Production builds
derive their WebSocket endpoint from the page origin or the host-injected meta.

## Scope

- Streaming chat, Markdown/code, stop, a bounded per-session queue with pause,
  reorder, edit and remove. Steer stops the active run and sends the new direction
  first after its termination is acknowledged.
- Session creation/resume/search/rename, Markdown export and per-session drafts.
- Workspace navigation on the left, five recent sessions and a separate history
  dialog, plus direct Files, Changes, Tasks, Agents and Providers shortcuts.
- Searchable provider/model picker, advertised reasoning-effort levels, API-key
  setup and smaller-context confirmation.
- Dedicated provider/account modal: masked saved keys, key activation/add/remove,
  API-key accounts, backend-advertised OAuth/subscription flows (including
  ChatGPT when supported), manual callback entry/cancellation and custom endpoints.
- Project `@file` and installed `$skill-name` completion with keyboard selection,
  plus image attachments/paste. Prompt refinement offers editable refined and
  English versions, preserves explicit skill mentions, references and images,
  and returns the chosen text to the draft without automatically sending it.
- Settings drawer: working mode, Off/Suggest/Auto autonomy, YOLO and next-step
  policy. Controls use server-confirmed preferences scoped to the active session.
- Context bar offers Simple metrics and Extended content modes. It opens real
  conversation content, optional read-only system/tool
  instructions, token estimates, request residency/history retention and cache
  statistics. Cumulative cache reads/writes and current prefix coverage are
  separate. Explicit compaction pauses the queue; resume it deliberately.
- Final `<nextsteps>` suggestions return to the composer on selection. Automatic
  continuation remains owned by the runtime; the UI never duplicates it.
- Files open in a standalone modal: content on the left, directory/search on the
  right. Changed files open a diff/before/after modal; plan/task/to-do views are read-only.
- Tool activity, passive text/image/diff previews and an Agents view with task,
  provider/model, status, iteration/tool counts and bounded live transcripts.
  Inactive workers are hidden by default. Task, model and latest output come first;
  detailed activity is collapsed. Worker replay and current-session fleet snapshots
  restore available activity after reconnect; missing metadata is labelled.
- Permission decisions and queued structured user questions.
- Reconnection with canonical replay, dark/light appearance, four persistent
  accent palettes, frontend/backend version information and mobile drawers.
- Ctrl/Cmd+P quick actions and session navigation; Ctrl/Cmd+Shift+F searches
  loaded conversation messages and jumps to a result.
- Shared resource center: backend prompt search/favorites/creation, required
  template variables, skill content and mention insertion, tool availability,
  MCP status/enable/disable/reconnect and a paged read-only memory snapshot with
  search across all loaded content.
- Collapsible Context/Efficiency, Execution/Delegation and Refiner/Reasoning
  settings. Numbers use explicit Apply; preferences reflect backend confirmation.
- Personal instruction editor with explicit global scope and backend revision
  checking. A conflict preserves the local draft until the user reloads.

## Where WebUI capabilities live

| Need | VibeUI entry |
| --- | --- |
| Reuse prompts or inspect installed skills | Left navigation → Library |
| Inspect tools and MCP connections | Left navigation → Tools & MCP |
| Read runtime memory | Resource center → Memory |
| Tune compaction, token saving or delegation | Settings → collapsed behavior groups |
| Choose the prompt-refiner model | Settings → Refiner & reasoning |
| Edit global agent rules | Settings → Personal instructions |
| Find an action or session quickly | Quick actions / Ctrl/Cmd+P |
| Find a loaded conversation message | Quick actions / Ctrl/Cmd+Shift+F |

Resource use returns text to the draft and never submits a chat message. Tool and
MCP changes affect the shared runtime; they are disabled during the current run.
Lists and content load on demand, and connection errors stay inside the relevant
modal. Existing session, Files, diff and agent layouts keep their focused roles.

Terminal/editor, browser-stream artifacts, automation editing and
advanced runtime administration remain in WebUI. Chrome is English in this first
version; conversation language follows the user. Queues and unsent image data
stay in memory. Draft text and file references persist locally.

## Checks

```sh
bun run --filter @wrongstack/vibeui test
bun run --filter @wrongstack/vibeui typecheck
bun run --filter @wrongstack/vibeui build
bun packages/vibeui/tests/browser-smoke.mjs
```

The browser check serves the real exported application through the production
HTTP/CSP implementation with a loopback protocol fixture. It exercises chat,
queueing, file references, model warnings, workspace views, drafts, reconnection
and responsive layouts without making model calls. It also covers prompt variables,
shared library writes, stale skill replies, tool toggles, rejected MCP changes,
instruction revision conflicts, quick-action keyboard navigation and extra prefs.
Screenshots are written to
`.temp_files/vibeui/`. Live account/model discovery is a separate check.
