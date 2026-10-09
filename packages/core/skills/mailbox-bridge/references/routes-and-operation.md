## Routes

All routes take JSON bodies on POST (or no body on GET). All requests
require `Authorization: Bearer <token>`. All responses are JSON.

| Method | Path | Wraps |
|--------|------|-------|
| POST | `/mailbox/send` | `GlobalMailbox.send` |
| POST | `/mailbox/query` | `GlobalMailbox.query` |
| POST | `/mailbox/check` | convenience inbox check: direct/base/broadcast query plus optional read/completion batch ack |
| POST | `/mailbox/ack` | `GlobalMailbox.ack` |
| POST | `/mailbox/ack-many` | `GlobalMailbox.ackMany` (batch under one lock + rewrite) |
| POST | `/mailbox/unread-count` | `GlobalMailbox.unreadCount` |
| POST | `/mailbox/agents/register` | `GlobalMailbox.registerAgent` (`source = 'http'`) |
| POST | `/mailbox/agents/heartbeat` | `GlobalMailbox.heartbeat` |
| POST | `/mailbox/register-client` | `GlobalMailbox.registerClient` (`source = 'http'`) |
| POST | `/mailbox/heartbeat` | `GlobalMailbox.clientHeartbeat` |
| POST | `/mailbox/purge-clients` | `GlobalMailbox.purgeClients` |
| GET | `/mailbox/agents` | `GlobalMailbox.getAgentStatuses` |
| GET | `/mailbox/agents/online` | `GlobalMailbox.getOnlineAgents` |
| GET | `/mailbox/events` | authenticated SSE stream for mailbox events |
| GET | `/healthz` | liveness probe (no auth or rate limit) |

### Error shape

Every error response follows the WrongStack API convention:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "field \"from\" is required (string)" } }
```

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Missing/wrong-type field in request body, body too large, or invalid JSON. |
| `UNAUTHORIZED` | 401 | Missing or wrong bearer token. |
| `NOT_FOUND` | 404 | No route for the request method + URL. |
| `RATE_LIMITED` | 429 | More than 120 authenticated requests in the rolling 60-second window. |
| `INTERNAL_ERROR` | 500 | `GlobalMailbox` threw (e.g. store unavailable, disk full). |

### Limits

- Body cap: **256 KB**. The mailbox message format is small; this leaves
  headroom for long bodies and base64 attachments while rejecting
  pathological payloads before they reach `JSON.parse`.
- Authenticated routes share a per-bearer sliding-window limit of **120
  requests per 60 seconds**. `/healthz` bypasses authentication and the limit.
  This bounds accidental flooding; it is not an identity or authorization
  boundary because every caller uses the same project token.

## The HQ dashboard writes to the same mailbox

The HQ command center (`wstack --hq`) shares this exact `GlobalMailbox`.
When an operator sends a prompt from the HQ screen, it lands in the same
`_mailbox.sqlite` store an external agent reads through `/mailbox/query` — so an
external agent participating via this bridge sees HQ prompts too.

HQ delivers a prompt one of two ways:

- **`POST /api/command`** on the HQ server — routes to a *connected*
  client, which then calls `GlobalMailbox.send`.
- **`POST /api/mailbox-send`** on the HQ server — writes to the project
  mailbox **directly**, so the prompt is delivered even when no agent is
  connected. The HQ server resolves the target `projectRoot` from its
  `SessionRegistry` (never a browser-supplied path).

Either way, the resulting mailbox message carries one of the HQ **send
types**, which map onto the mailbox `type` field an external agent will
observe:

| HQ send type | Mailbox `type` | Intent for the receiver |
|--------------|----------------|-------------------------|
| `steer`      | `steer`        | Change course now.       |
| `btw`        | `btw`          | FYI / context — no course change demanded. |
| `queue`      | `note`         | A queued prompt; handle before the next step. |
| `broadcast`  | `broadcast`    | Sent to all agents on the project (`to: all`). |

An external agent does not need to distinguish HQ-originated messages —
they arrive with `from` set to `hq@<tag>` and are read, acked, and
completed through the same `/mailbox/query` + `/mailbox/ack` routes as
any other message. Filter on `from` if you want to treat HQ prompts
specially.

## Pairing with the external-facing skill

This internal skill describes how to run the server. The
`wrongstack-mailbox` skill (also bundled with `@wrongstack/core`) describes
how the external agent uses the routes. When configuring an external agent,
install both:

- In the WrongStack project: `bundledSkillsDir/mailbox-bridge/` (this file)
- In the external agent's project: copy
  `bundledSkillsDir/wrongstack-mailbox/SKILL.md` to the agent's skills
  directory (e.g. `.claude/skills/wrongstack-mailbox/SKILL.md`).
  The repo ships `scripts/install-mailbox-bridge-skills.sh` for this.

## Examples

Before using this workflow, read [the complete instructions](examples.md).
Load with `skill({ name: "mailbox-bridge", resource: "references/examples.md" })`, or resolve the reference relative to this skill directory in another client.

## How it ends

`Ctrl+C` (SIGINT) or `SIGTERM` triggers a graceful shutdown: stop accepting
new connections, let in-flight requests finish, flush the mailbox cache,
unlink the token file. The `mailbox_serve_started` and
`mailbox_serve_stopping` JSON log lines on stdout are the deterministic
hooks for any log-shipper watching the process.

## Health watchdog

`packages/core/src/coordination/mailbox-health.ts` provides a
`MailboxHealthWatchdog` that probes `/healthz` and sends a
`mailbox-bridge-down` message to the project mailbox when the bridge stops
responding (and a recovery message when it returns). Nothing starts it
automatically and no slash command exists for it: host code constructs
`new MailboxHealthWatchdog({ mailbox, url })` and calls `start()`. Defaults:
probe every 15 s, 3 s timeout, alert after 2 consecutive failures.

## Security notes

- The token is the only credential. Anyone who can read
  `~/.wrongstack/projects/<slug>/.mailbox.token` AND reach the bind host
  can act on the project's mailbox. Loopback binding makes "reach"
  require shell access on the host machine.
- The shared bearer is **not bound to an agent identity or capability set**.
  An authenticated caller supplies message `from`/type, registration ids, and
  acknowledgement `readerId`; the bridge does not separately authorize
  `steer`/control messages or prevent impersonation. Add an identity-aware
  trusted proxy before exposing it beyond mutually trusted local clients.
- Token comparison uses `timingSafeEqual`.
- The bridge does NOT log message bodies. The structured
  `mailbox_serve_started` event includes the bind URL, port, project dir,
  and token path — never the token itself.
- The HTTP server has no request logging at the access-log level. If
  audit trails of which external agent called which route are needed,
  the agent itself should log them client-side.
