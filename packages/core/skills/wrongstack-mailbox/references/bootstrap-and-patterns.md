## Discovering the bridge: `mbWithBootstrap()`

The plain `mb()` helper above assumes `WRONGSTACK_MAILBOX_URL` and
`WRONGSTACK_MAILBOX_TOKEN` are set. External agents usually don't have
those env vars — they discover the bridge from the per-project lock file (or
spawn one).

`mbWithBootstrap()` handles all three scenarios from the
"What this skill assumes" section:

1. **Env vars set** → use them directly.
2. **No env vars, but a bridge is running** → read the
   `.mailbox-bridge.lock` and `.mailbox.token` files from the project
   directory to discover the running bridge.
3. **No env vars, no surface running, but `wstack` is on PATH** →
   spawn `wstack mailbox serve` as a child process and wait for the
   lock to appear (the bootstrap helper writes it within ~200 ms of
   `listen()` returning). Use this when you want full self-service.

The helper takes two paths:

- `projectDir` — WrongStack's per-project **state directory**, not the
  repository: `~/.wrongstack/projects/<slug>/`. The slug is the repository
  folder name (lowercased, runs of non-alphanumerics collapsed to `-`), a
  hyphen, and 6 hex characters of a hash of the canonical repository path —
  for example `my-app-3f9a1c`. Don't try to compute the hash; list
  `~/.wrongstack/projects/<folder-slug>-*/` and take the directory that holds
  `.mailbox-bridge.lock` (ask the user when more than one does).
  `wstack mailbox serve` also prints it as `Project dir:`.
- `repoRoot` — the repository itself, used as the working directory when the
  helper has to start a bridge.

It returns a configured `mb(path, body)` function. Call it once at agent
startup; use the returned `mb` for every subsequent route call.

```ts
/**
 * Returns a configured `mb(path, body)` function for talking to
 * the WrongStack mailbox bridge, spawning one if necessary.
 *
 * Discovery order:
 *   1. WRONGSTACK_MAILBOX_URL + WRONGSTACK_MAILBOX_TOKEN env vars
 *      (highest precedence — used as-is).
 *   2. <projectDir>/.mailbox-bridge.lock  (the per-project lock file
 *      written by the running bridge — read its
 *      `url` + `token` fields).
 *   3. <projectDir>/.mailbox.token         (the token file, in case
 *      the URL is set in env but the token isn't, or vice versa).
 *   4. Spawn `wstack mailbox serve` via async `spawn` + unref, then
 *      poll the lock file for up to 5 s. Used as a last resort when no
 *      WrongStack surface is running yet.
 *
 * Throws only when ALL three fail (no env vars, no lock file, no
 * `wstack` on PATH). The caller decides whether to surface that
 * to the user or fall back to manual setup.
 */
async function mbWithBootstrap(
  projectDir: string,
  repoRoot: string,
): Promise<(path: string, body?: unknown) => Promise<unknown>> {
  // 1. Env vars win outright.
  if (process.env.WRONGSTACK_MAILBOX_URL && process.env.WRONGSTACK_MAILBOX_TOKEN) {
    return mb;
  }

  // 2-3. Lock + token files.
  const lockPath = path.join(projectDir, '.mailbox-bridge.lock');
  const tokenPath = path.join(projectDir, '.mailbox.token');
  let url = process.env.WRONGSTACK_MAILBOX_URL;
  let token = process.env.WRONGSTACK_MAILBOX_TOKEN;

  try {
    const lockRaw = await fs.readFile(lockPath, 'utf8');
    const lock = JSON.parse(lockRaw) as { url: string; token: string };
    if (lock.url && lock.token) {
      url = url ?? lock.url;
      token = token ?? lock.token;
    }
  } catch {
    // lock file absent — fall through to spawn step
  }
  if (token === undefined) {
    try {
      token = (await fs.readFile(tokenPath, 'utf8')).trim();
    } catch {
      // token file absent — fall through to spawn step
    }
  }

  // 4. Last resort — spawn `wstack mailbox serve` ourselves.
  //    Use async `spawn` + unref, NOT `spawnSync`: the bridge is a
  //    long-lived server that never exits, so `spawnSync` would block
  //    this agent forever. On Windows `wstack` is a `.cmd` shim, so
  //    `shell:true` is required to resolve it on PATH; `detached` is
  //    POSIX-only (on win32 it pops a visible console window).
  if (url === undefined || token === undefined) {
    try {
      const { spawn } = await import('node:child_process');
      const isWin = process.platform === 'win32';
      const child = spawn('wstack', ['mailbox', 'serve'], {
        cwd: repoRoot, // `wstack mailbox serve` resolves the project from its cwd
        detached: !isWin,
        stdio: 'ignore',
        windowsHide: true,
        shell: isWin,
      });
      // Spawn errors (e.g. wstack not on PATH) surface via the
      // poll-timeout below rather than crashing the agent.
      child.on('error', () => undefined);
      child.unref();
      // Poll for the lock file for up to 5 s.
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const raw = await fs.readFile(lockPath, 'utf8');
          const lock = JSON.parse(raw) as { url: string; token: string };
          if (lock.url && lock.token) {
            url = lock.url;
            token = lock.token;
            break;
          }
        } catch {
          // not yet — keep polling
        }
      }
    } catch (err) {
      throw new Error(
        `Could not find or start a WrongStack mailbox bridge for ` +
        `${projectDir}. Tried env vars, the per-project lock + token ` +
        `files, and spawning \`wstack mailbox serve\`. Last error: ` +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // Set env vars for the inner `mb` helper so it picks them up
  // without further branching. (Strictly optional — could also
  // close over `url` and `token` directly.)
  process.env.WRONGSTACK_MAILBOX_URL = url;
  process.env.WRONGSTACK_MAILBOX_TOKEN = token;
  return mb;
}
```

Usage:

```ts
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const mb = await mbWithBootstrap(
  path.join(os.homedir(), '.wrongstack', 'projects', 'my-app-3f9a1c'),
  '/path/to/my-app',
);
const { data } = await mb('/mailbox/query', {
  to: agentId,
  incompleteOnly: true,
  limit: 50,
}) as { data: MailboxMessage[] };
```

### When to prefer `mb()` over `mbWithBootstrap()`

If you've already been given a URL + token (env vars, CLI args, a
config file), use plain `mb()`. The bootstrap path is for
discovery-first integrations — agents that want to "just connect to
whatever's running" without asking the user.

## Patterns

### Discover a running bridge without env vars

The recommended pattern for an agent that doesn't have
`WRONGSTACK_MAILBOX_URL` / `WRONGSTACK_MAILBOX_TOKEN` pre-set:

```ts
import * as path from 'node:path';

async function findBridge(projectDir: string): Promise<{ url: string; token: string } | null> {
  const lockPath = path.join(projectDir, '.mailbox-bridge.lock');
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const lock = JSON.parse(raw) as { url: string; token: string; pid: number };
    if (!lock.url || !lock.token) return null;
    // Optional: ping /healthz to confirm the PID is actually serving
    // (a crashed-but-not-cleaned-up lock would still parse).
    const res = await fetch(`${lock.url}/healthz`, {
      signal: AbortSignal.timeout(500),
    });
    return res.ok ? { url: lock.url, token: lock.token } : null;
  } catch {
    return null;
  }
}
```

For the "no env vars AND no running surface" case, fall back to
`mbWithBootstrap()` above (which spawns `wstack mailbox serve` for
you and waits for the lock file to appear).

### Pick a stable agent id

If you're going to register, pick a stable `agentId` you can reuse
across sessions (so the WebUI can show your read history). Convention:

```
claude-code-<pid>-<short-hostname>
```

or any unique-enough string. **Do not** randomize per call — read
receipts break if your `agentId` changes every poll.

### Register once, then heartbeat

Register before you do anything else. Then run a heartbeat every 30 s
while you're alive; without it, you flip to "offline" after 60 s and
the WebUI hides you.

```ts
const agentId = process.env.WRONGSTACK_AGENT_ID
  ?? `claude-code-${process.pid}`;

await mb('/mailbox/agents/register', {
  agentId,
  sessionId: 'external',
  name: 'Claude Code',
  role: 'external',
  pid: process.pid,
});

// Then, while alive:
setInterval(() => {
  mb('/mailbox/agents/heartbeat', {
    agentId,
    currentTask: '<one-line description of what you're doing>',
  }).catch(() => { /* heartbeat is best-effort */ });
}, 30_000);
```

### Real-time push via SSE (preferred) or polling

The bridge supports **Server-Sent Events (SSE)** on `GET /mailbox/events`
for real-time push. This is the preferred approach — no polling needed.

```ts
// Open an SSE connection that pushes events in real-time.
const res = await fetch(`${url}/mailbox/events`, {
  headers: { Authorization: `Bearer ${token}` },
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();

for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // SSE events arrive as: data: {"type":"message.sent",...}\n\n
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === 'message.sent') {
      console.log(`[${event.type}] ${event.from} → ${event.to}: ${event.messageId}`);
      // Fetch the full message via /mailbox/query or /mailbox/check.
    }
  }
}
```

**SSE event types:**

| Event `type` | When | Payload fields |
|--------------|------|---------------|
| `message.sent` | A message was sent via `POST /mailbox/send` | `messageId`, `from`, `to`, `timestamp` |

The SSE stream sends a `: connected` comment on open and a
`: keepalive` comment every 15 s to prevent proxy/CDN timeouts.

**Important:** SSE events carry only the message id and metadata — not
the full message body. When you receive an event, call `/mailbox/check`
or `/mailbox/query` to fetch the complete message content.

**Fallback: polling.** If your HTTP client doesn't support SSE (or you're
behind a proxy that buffers responses), poll on a 5–10 s interval. Don't
poll faster than 1 Hz — the bridge enforces a rate limit of 120 requests
per minute per bearer token.

```ts
// Fallback: poll every 5 s when SSE is unavailable.
async function pollOnce(): Promise<void> {
  const result = await mb('/mailbox/check', {
    agentId,
    baseId: 'claude-code',       // optional: your bare alias
    limit: 50,
  }) as { data: MailboxMessage[] };

  for (const m of result.data) {
    console.log(`[${m.type}] from=${m.from} subject=${m.subject}`);
    // ...handle the message...
  }
}

setInterval(pollOnce, 5_000);
```

Use `/mailbox/query` directly when you need custom searches such as
`from`, `type`, `since`, or `minPriority` filters rather than inbox
catch-up.

### Reply with `replyTo`

Set `replyTo` to the id of the message you're replying to. The original
sender's client will then thread your reply to their message. Without
`replyTo`, your reply is a freestanding message and the sender has to
match by subject.

```ts
await mb('/mailbox/send', {
  from: agentId,
  to: originalMessage.from,
  type: 'result',
  subject: `Re: ${originalMessage.subject}`,
  body: '<your response>',
  replyTo: originalMessage.id,
});
```

### Complete messages while checking inbox

If handling a message finishes the requested work, mark it completed in the
same `/mailbox/check` call. This preserves read receipts and completion
state with one batch ack:

```ts
const result = await mb('/mailbox/check', {
  agentId,
  baseId: 'claude-code',
  completed: true,
  outcome: 'handled',
}) as { data: MailboxMessage[] };
```

Use `markRead: false` to peek without consuming messages:

```ts
await mb('/mailbox/check', { agentId, markRead: false });
```

### Ack in batches

If you've just consumed a backlog through custom `/mailbox/query` filters,
don't ack them one at a time. Use `/mailbox/ack-many` — one HTTP request
and one batched write inside WrongStack:

```ts
await mb('/mailbox/ack-many', {
  acks: messages.map((m) => ({
    messageId: m.id,
    readerId: agentId,
    read: true,
    completed: true,
    outcome: 'handled',
  })),
});
```

Prefer this over per-message `/mailbox/ack` whenever you have more than
one unread message.

### Broadcast with `to: "*"`

`to: "*"` (or `"all"`) reaches every online agent. Use sparingly — the
internal WebUI marks broadcasts with a different color and humans
notice noise. A reasonable rule: at most one broadcast per task, and
always with a clear subject so people can mute it mentally.

```ts
await mb('/mailbox/send', {
  from: agentId,
  to: '*',
  type: 'note',
  subject: 'Claude Code: starting security audit',
  body: 'Will report findings via /mailbox/send directed at leader@…',
});
```

