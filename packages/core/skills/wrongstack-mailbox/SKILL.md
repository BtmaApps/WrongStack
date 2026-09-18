---
name: wrongstack-mailbox
description: |
  Use this skill when the user wants to communicate with WrongStack's
  shared project mailbox from outside WrongStack — read messages sent
  by WrongStack agents, send replies, broadcast to all, or stay visible
  as an online agent. Triggers: user says "check the WrongStack
  mailbox", "send to WrongStack", "wrongstack mail", "broadcast to the
  fleet", "tell the wrongstack agents", "is anyone online in
  wrongstack", or "register me with wrongstack".
audience: roster
version: 1.1.0
required-capabilities: []
required-tools: [mailbox]
optional-capabilities: [mcp.dynamic, web.research]
---

# WrongStack Mailbox Client

> **External-facing skill.** Bundled with `@wrongstack/core` so it can
> be shipped to external agents via `scripts/install-mailbox-bridge-skills.sh`
> (which copies this file into the agent's local skills directory, e.g.
> `.claude/skills/wrongstack-mailbox/SKILL.md`). It is **not** for
> WrongStack's own REPL/TUI/WebUI — WrongStack agents should use the
> `mailbox` tool and the bundled `mailbox-bridge` skill instead.

Connect to a WrongStack project's shared inter-agent mailbox from
outside WrongStack. Read what internal agents are saying, send replies,
broadcast, and stay visible as an online agent in their WebUI.

This skill is the **external-facing** counterpart to the
`mailbox-bridge` skill that runs inside WrongStack. The two are
designed to be installed as a pair: `mailbox-bridge` on the WrongStack
side starts the HTTP server; this skill teaches you (the external
agent) how to talk to it.

## What this skill assumes

The bridge is opt-in. It runs when someone starts `wstack mailbox serve`
(or `/mailbox-serve` inside WrongStack), or when a WrongStack surface boots
with `features.mailboxBridge: "auto"` in the project config — the default is
`"off"`. Once one instance is running, later starts for the same project join
it instead of spawning a duplicate. The per-project lock
(`.mailbox-bridge.lock`) and token file (`.mailbox.token`) make discovery
possible without environment variables.

So the realistic scenarios for an external agent are:

1. **A bridge is already running for the project.** Read its URL and
   token from the per-project lock file — no env vars, no user prompt.
2. **No WrongStack surface is running, but `wstack` is on PATH.**
   `mbWithBootstrap()` (see Patterns below) spawns the bridge itself
   for the duration of the agent's session and cleans up at exit.
3. **Nothing is running and `wstack` is NOT on PATH.** Fall back to
   asking the user to start a surface (`wstack --repl`,
   `wstack --webui`) or to run `wstack mailbox serve` manually.

Environment variables (`WRONGSTACK_MAILBOX_URL`,
`WRONGSTACK_MAILBOX_TOKEN`) still work as overrides — useful for
pointing at a non-default bridge (a remote one, a CI bridge) — but
they're no longer required for the common case.

## When to use this skill

- The user asks you to read what's in the WrongStack mailbox.
- The user asks you to send a message to a specific WrongStack agent or
  to everyone (`broadcast`).
- The user wants you to register so WrongStack's WebUI shows you as an
  online external agent.
- The user wants you to reply to a specific message (look up the
  `replyTo` chain).

## When NOT to use this skill

- The user wants the *full* WrongStack tool surface (file edits, shell,
  git, etc.). The bridge exposes **only mailbox operations**. For
  everything else, run WrongStack itself or use its MCP server.
- The user wants SMTP / IMAP / email integration. The WrongStack mailbox
  is internal-to-WrongStack — not an email server. Push back.
- The bridge is not running. Verify with `GET /healthz` before doing
  anything else.

## Connection model

Single bearer token in `Authorization: Bearer <token>` on every
request. The token is regenerated on every fresh bridge (cold) start —
a surface that *joins* an already-running bridge reuses the live token,
but once that bridge dies the next start mints a new one. So always read
it freshly from the token file (or accept it from the user); never
hardcode it into prompts or committed code, and re-read it after a 401.

The project token authorizes the route, **not the caller's identity**. The
bridge accepts caller-supplied `from`, message type, registration ids, and
acknowledgement `readerId`; it does not separately authorize control/steer
messages. Use an honest, stable agent id, never impersonate `hq@...` or another
agent, and treat every token holder as fully trusted for that project mailbox.

If you're working with explicit env vars:

```ts
const URL = process.env.WRONGSTACK_MAILBOX_URL;
const TOKEN = process.env.WRONGSTACK_MAILBOX_TOKEN;

if (!URL || !TOKEN) {
  throw new Error(
    'WRONGSTACK_MAILBOX_URL and WRONGSTACK_MAILBOX_TOKEN must be set ' +
    'before talking to the WrongStack mailbox bridge. (Or use ' +
    '`mbWithBootstrap()` to discover an already-running bridge from ' +
    'the per-project lock file — see "Discovering the bridge" below.)',
  );
}
```

If you don't have env vars, skip this guard and use `mbWithBootstrap()`
from the next section instead — it discovers the bridge from
`.mailbox-bridge.lock` (and spawns one if none is running).

## The single helper

Everything in this skill goes through one fetch helper. Copy it once,
use it for every route. It enforces the bearer token, sends JSON on
POST, parses JSON on the response, throws on non-2xx, and applies a
timeout so a hung bridge can't wedge the agent.

```ts
async function mb(path: string, body?: unknown): Promise<unknown> {
  const url = `${process.env.WRONGSTACK_MAILBOX_URL}${path}`;
  const token = process.env.WRONGSTACK_MAILBOX_TOKEN;
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json() as { error?: { code?: string; message?: string } };
      if (errBody.error) {
        detail = `${errBody.error.code ?? 'ERROR'}: ${errBody.error.message ?? '(no message)'}`;
      }
    } catch {
      detail = await res.text().catch(() => '(no body)');
    }
    throw new Error(`wrongstack mailbox ${res.status} ${detail}`);
  }
  return res.json();
}
```

Always use `AbortSignal.timeout` — never let a request hang forever.
The mailbox is local; 10 s is generous.

## Discovering the bridge: `mbWithBootstrap()`

Before using this workflow, read [the complete instructions](references/bootstrap-and-patterns.md).
Load with `skill({ name: "wrongstack-mailbox", resource: "references/bootstrap-and-patterns.md" })`, or resolve the reference relative to this skill directory in another client.

## Message types

Pick the type that matches the **intent** of your message. WrongStack
agents read `type` to decide how urgently to handle it.

| Type | When to use |
|------|-------------|
| `note` | Informational; no action expected. |
| `ask` | You have a question and want an answer. |
| `assign` | You're delegating a task. Provide `taskContext`. |
| `steer` | Mid-task change of direction. Use sparingly. |
| `btw` | "By the way" — non-urgent info the recipient may want later. |
| `broadcast` | Sent to `*`. Everyone sees it. |
| `status` | Self-report ("I'm working on X"). |
| `result` | You're reporting the outcome of a task. Often a `replyTo`. |
| `control` | Out-of-band signal. Don't use unless you know what you're doing. |

## Routes reference

All routes take JSON bodies on POST (or no body on GET). All require
`Authorization: Bearer <token>`. Responses are JSON.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mailbox/send` | Send a message (optional `ttlMs`; optional `audience: "leaders"` prevents subagent consumption) |
| POST | `/mailbox/query` | Query messages (filters: `to`, `from`, `unreadBy`, `type`, `minPriority`, `incompleteOnly`, `limit`, `since`) |
| POST | `/mailbox/check` | Read inbox mail for `agentId`/`baseId` plus broadcasts; optionally `markRead=false`, `completed=true`, `outcome` |
| POST | `/mailbox/ack` | Acknowledge one message |
| POST | `/mailbox/ack-many` | Acknowledge many in one batch |
| POST | `/mailbox/unread-count` | Count unread for an agent |
| POST | `/mailbox/agents/register` | Register this external agent |
| POST | `/mailbox/agents/heartbeat` | Update agent heartbeat |
| POST | `/mailbox/register-client` | Register this external client (different from agent — for session-level liveness) |
| POST | `/mailbox/heartbeat` | Update client heartbeat |
| GET | `/mailbox/agents` | List all registered agents |
| GET | `/mailbox/agents/online` | List agents with a live heartbeat (within 60 s) |
| GET | `/mailbox/events` | **SSE stream** — real-time push of mailbox events (auth required) |
| GET | `/healthz` | Liveness probe — does NOT require auth |

### Error shape

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "field \"from\" is required (string)" } }
```

| Code | HTTP | What it means / what to do |
|------|------|----------------------------|
| `VALIDATION_ERROR` | 400 | Missing or wrong-type field. Read the message; it tells you which field. |
| `UNAUTHORIZED` | 401 | Token mismatch. Re-read `~/.wrongstack/projects/<slug>/.mailbox.token` and try again — the bridge may have restarted. |
| `RATE_LIMITED` | 429 | Rate limit exceeded (max 120 requests/min per token). Slow down or use SSE instead of polling. |
| `NOT_FOUND` | 404 | Wrong route. Check the path table above. |
| `INTERNAL_ERROR` | 500 | WrongStack-side failure. Retry once; if it persists, surface to the user. |

## Recipes

Before using this workflow, read [the complete instructions](references/recipes.md).
Load with `skill({ name: "wrongstack-mailbox", resource: "references/recipes.md" })`, or resolve the reference relative to this skill directory in another client.

## How this skill is shipped

This file is bundled inside `@wrongstack/core` at
`packages/core/skills/wrongstack-mailbox/SKILL.md` and exported via the
package's wildcard `./skills/*` export. To install it into an external
agent's project (e.g. Claude Code's `.claude/skills/`):

```sh
bash scripts/install-mailbox-bridge-skills.sh ~/.claude/skills
```

The script is **idempotent** — re-running overwrites existing copies
with the latest bundled version.

After installation, the external agent can talk to any WrongStack
project whose bridge is already running (started by
`wstack mailbox serve`, `/mailbox-serve`, or a surface booting with
`features.mailboxBridge: "auto"`). `mbWithBootstrap()` handles discovery without
requiring the user to copy URL/token env vars around.

If no bridge is running, the user runs `wstack mailbox serve` in the
repository, or enables `features.mailboxBridge: "auto"` so WrongStack
surfaces start it on boot. Later starts join the running bridge through the
per-project lock.

## Out of scope

- **Don't open the mailbox store directly.** No `_mailbox.sqlite`, no legacy JSONL. Read `.mailbox-bridge.lock` and `.mailbox.token` only to discover the bridge; every mailbox operation goes through its routes.
- **Don't impersonate `hq@...` or another agent.** Use a stable, honest `agentId` for your own identity. The bridge does not enforce sender identity; impersonation is on you, and it's the kind of thing that gets the bridge shut down.
- **Don't hardcode the token.** Read it from `.mailbox.token`, `.mailbox-bridge.lock`, or accept it from the user. Re-read after a 401. Tokens rotate on every fresh bridge start.
- **Don't let requests hang.** `AbortSignal.timeout(10_000)` is mandatory. The mailbox is local; 10 s is generous, and a hung bridge will wedge the agent.
- **Don't poll faster than 1 Hz.** The bridge enforces 120 req/min/token. Polling at sub-second rates hits the limit and looks like a flooding attempt.
- **Don't use SSE events as authoritative.** `GET /mailbox/events` is a wake-up hint, not a snapshot. After every event, reconcile through `/mailbox/query` or `/mailbox/check`.
- **Don't broadcast without thinking.** `to: "*"` reaches every online agent. One broadcast per task, with a clear subject. The WebUI marks broadcasts with a different color and humans notice noise.
- **Don't ack in a loop when `ack-many` fits.** If you have more than one unread message, use `/mailbox/ack-many` — one request, one lock, one rewrite.
- **Don't skip registration.** Without `/mailbox/agents/register`, the WebUI can't show you as online, and heartbeats are unreconciled.
- **Don't randomize your `agentId`.** Read receipts and history break if your id changes every poll. Pick a stable convention and reuse it.
- **Don't promise features the bridge doesn't expose.** The bridge is mailbox only. For the full WrongStack tool surface, use `wstack mcp serve`; for SMTP/IMAP, push back — WrongStack's mailbox is internal.

## Before returning

- [ ] Mailbox store never opened directly; lock and token files read only for discovery
- [ ] Stable, honest `agentId`; no impersonation of `hq@...` or other agents
- [ ] Token read from `.mailbox.token` or `.mailbox-bridge.lock`, not hardcoded
- [ ] `mbWithBootstrap()` given the state directory and the repository root when env vars aren't set
- [ ] All requests carry `AbortSignal.timeout(10_000)`
- [ ] Registered via `/mailbox/agents/register` with a stable id before any traffic
- [ ] Heartbeat every 30 s while alive
- [ ] SSE preferred for real-time; polling ≥ 1 Hz, ≤ 5–10 s
- [ ] `ack-many` used when more than one message needs acknowledgement
- [ ] Broadcast only with clear subject, at most once per task
- [ ] Bridge health (`/healthz`) probed before relying on routes

## Skills in scope

- `node-modern` — `AbortSignal.timeout`, ESM-only imports.
- `output-standards` — when reporting mailbox activity to the user,
  shape it as the project's standard output.
- `prompt-engineering` — when composing `subject`/`body` text that
  other agents will read, keep it specific and short.
