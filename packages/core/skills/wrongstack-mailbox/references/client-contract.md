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

Before using this workflow, read [the complete instructions](bootstrap-and-patterns.md).
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

Before using this workflow, read [the complete instructions](recipes.md).
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
