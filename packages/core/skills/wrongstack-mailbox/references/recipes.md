## Recipes

### "Is anyone online?"

```ts
const result = await mb('/mailbox/agents/online') as { data: AgentStatus[] };
console.log(`${result.data.length} agent(s) online:`);
for (const a of result.data) {
  console.log(`  ${a.agentId}  ${a.status}  ${a.currentTask ?? '(idle)'}`);
}
```

### "Read my inbox"

```ts
const result = await mb('/mailbox/query', {
  to: agentId,
  unreadBy: agentId,
  incompleteOnly: true,
  limit: 20,
}) as { data: MailboxMessage[] };
for (const m of result.data) {
  console.log(`[${m.type}] ${m.from}: ${m.subject}`);
  console.log(`  ${m.body}`);
}
```

### "Reply to the most recent message directed at me"

```ts
const { data: messages } = await mb('/mailbox/query', {
  to: agentId,
  incompleteOnly: true,
  limit: 1,
}) as { data: MailboxMessage[] };
const latest = messages[0];
if (!latest) return;

await mb('/mailbox/send', {
  from: agentId,
  to: latest.from,
  type: 'result',
  subject: `Re: ${latest.subject}`,
  body: '<your reply>',
  replyTo: latest.id,
});
await mb('/mailbox/ack', {
  messageId: latest.id,
  readerId: agentId,
  read: true,
  completed: true,
});
```

### "Broadcast a status update"

```ts
await mb('/mailbox/send', {
  from: agentId,
  to: '*',
  type: 'status',
  subject: 'Claude Code: <one-line summary>',
  body: '<details>',
});
```

## Anti-patterns

- **Don't bypass the HTTP layer to read the mailbox store directly.** The
  store is a SQLite database owned by the running WrongStack process; going
  around the bridge skips identity, read receipts, and change events.
- **Don't reuse one `agentId` across multiple external sessions.** If
  two processes register under the same id, heartbeats overwrite each
  other and read receipts become unreliable.
- **Don't poll faster than 1 Hz.** The bridge enforces a rate limit of
  120 requests/min per bearer token (returns `429 RATE_LIMITED` beyond
  that). Prefer SSE (`GET /mailbox/events`) over polling when possible.
- **Don't include the token in any logged output.** It's the only
  credential. If you must print the URL, redact the token (`[REDACTED]`).
- **Don't reply to a broadcast with another broadcast.** Replies should
  target the original sender via `to: <their-id>`, with `replyTo` set.
- **Avoid `control` messages.** They go through a different path in
  the WrongStack agent loop and will likely be dropped on the floor by
  the recipient.

## Example: minimal end-to-end session

```ts
// 1. Confirm the bridge is up.
await mb('/healthz'); // throws if down

// 2. Pick a stable id and register.
const agentId = `claude-code-${process.pid}`;
await mb('/mailbox/agents/register', {
  agentId,
  sessionId: 'external',
  name: 'Claude Code',
  role: 'external',
  pid: process.pid,
});

// 3. Heartbeat every 30 s.
setInterval(() => {
  mb('/mailbox/agents/heartbeat', { agentId }).catch(() => undefined);
}, 30_000);

// 4. Poll for new mail every 5 s.
let lastSeen: string | undefined;
setInterval(async () => {
  try {
    const args: Record<string, unknown> = {
      to: agentId,
      incompleteOnly: true,
      limit: 50,
    };
    if (lastSeen !== undefined) args['since'] = lastSeen;
    const { data } = await mb('/mailbox/query', args) as { data: MailboxMessage[] };
    for (const m of data) {
      // ...your handling logic here...
      console.log(`[${m.type}] ${m.from}: ${m.subject}`);
    }
    if (data.length > 0) lastSeen = data[data.length - 1]!.timestamp;
  } catch (err) {
    console.error('mailbox poll failed:', (err as Error).message);
  }
}, 5_000);
```

This is the smallest viable integration. From here, the typical
extension is to **act on** the messages — call tools, write files, run
tests — and post results back via `/mailbox/send`.

