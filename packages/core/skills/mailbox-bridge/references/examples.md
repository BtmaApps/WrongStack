## Examples

### Start the bridge from REPL or TTY

```
$ wstack mailbox serve
WrongStack mailbox bridge listening on http://127.0.0.1:34827
Project dir:  ~/.wrongstack/projects/wrongstack-abc1234
Token file:   ~/.wrongstack/projects/wrongstack-abc1234/.mailbox.token (mode 0600)

Routes:
  POST /mailbox/send              send a message
  POST /mailbox/query             query messages
  ...
  GET  /healthz                   health probe (no auth)

Send the bearer token in: Authorization: Bearer <token>
Cat the token from another shell:
  cat ~/.wrongstack/projects/wrongstack-abc1234/.mailbox.token

Press Ctrl+C to stop.
```

### Send a message via curl

```
curl -X POST http://127.0.0.1:34827/mailbox/send \
  -H "Authorization: Bearer $(cat ~/.wrongstack/projects/wrongstack-abc1234/.mailbox.token)" \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "external-scout",
    "to": "*",
    "type": "broadcast",
    "subject": "Hello from outside",
    "body": "External agent has joined the conversation.",
    "audience": "leaders",
    "priority": "normal"
  }'
```

Use optional `"audience": "leaders"` when a project/session message is
operator context that only main agents should consume. Subagent inbox/check
delivery filters it out; omitting the field preserves normal all-agent delivery.

### Register so the external agent appears in the WebUI

```
curl -X POST http://127.0.0.1:34827/mailbox/agents/register \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "agentId": "claude-code-3941", "sessionId": "external",
        "name": "Claude Code", "role": "external", "pid": 3941 }'
```

The agent now shows up at `GET /mailbox/agents` and in the WebUI's
online-agents panel with `source: 'http'`.

### Heartbeat loop (keep the agent visible as "online")

```
# Every 30 s while alive:
curl -X POST http://127.0.0.1:34827/mailbox/agents/heartbeat \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "agentId": "claude-code-3941", "currentTask": "auditing auth layer" }'
```

Without heartbeats the agent flips to offline after 60 s.

### Query with a poll

```
# Every 5–10 s, only new messages since last poll:
curl -X POST http://127.0.0.1:34827/mailbox/query \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "to": "claude-code-3941", "since": "2026-06-27T08:50:00.000Z", "limit": 50 }'
```

### Acknowledge many in one batch

```
curl -X POST http://127.0.0.1:34827/mailbox/ack-many \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{ "acks": [
    { "messageId": "msg_aaa", "readerId": "claude-code-3941", "read": true },
    { "messageId": "msg_bbb", "readerId": "claude-code-3941", "read": true, "completed": true, "outcome": "Handled in PR #42" }
  ]}'
```

The batch path applies every ack in one write — preferred over N sequential
`/mailbox/ack` calls.

