# Read-only session mode

Read-only mode is a **session-scoped toggle** that prevents the active agent and any subagents it spawns from running tools that can modify files or system state. It is designed for research, exploration and documentation tasks where the user wants to ask questions and inspect code without risk of unintended mutations.

---

## How it works

Read-only mode is enforced by the `ReadOnlyPermissionPolicy` class in `packages/core/src/security/readonly-permission-policy.ts`. This is a **wrapper** around the normal permission policy that intercepts every tool evaluation and checks two things:

1. **Is the session in read-only mode?** — reads `ctx.meta['readOnly']`
2. **Does the tool mutate?** — checks `tool.mutating === true` as well as mutation capabilities

| Condition | Result |
|---|---|
| `readOnly` not set or `false` | Pass-through — the wrapper is a no-op |
| `readOnly === true` + neither mutation declaration nor mutation capability | Pass-through — read-only tools work normally |
| `readOnly === true` + mutation declaration or capability | **Denied** — unless the tool targets a `.md` file under `.temp_files/` |

### Mutation capabilities blocked

Any tool that declares one of these capabilities is blocked in read-only mode:

- `fs.write` — file write
- `fs.write.outside-project` — write outside project root
- `memory.write` — memory persist
- `memory.delete` — memory delete
- `shell.arbitrary` — arbitrary shell execution (`bash`)
- `shell.restricted` — restricted execution (`exec`)
- `shell.exec` — project linter/formatter execution
- `tool.mutate.any` — meta-tool invocation
- `config.mutate` — configuration mutation
- `package.install` — package management
- `subagent.spawn` — subagent creation

### Allowed write exception

The **only** write operation permitted in read-only mode is producing `.md` report files under the `.temp_files/` directory. This allows the agent to write research summaries, analysis reports and documentation output without enabling general file mutations.

---

## Enabling read-only mode

### Programmatic toggle

```ts
// Enable read-only mode for the current session
agent.ctx.meta['readOnly'] = true;

// Disable read-only mode
agent.ctx.meta['readOnly'] = false;
```

### Container wiring (once per session)

The `ReadOnlyPermissionPolicy` must be installed as a wrapper around the session's `DefaultPermissionPolicy` when the container is set up:

```ts
import { ReadOnlyPermissionPolicy } from '@wrongstack/core/security';
import { DefaultPermissionPolicy } from '@wrongstack/core/security';

const inner = new DefaultPermissionPolicy({ trustFile, yolo });
container.bind(TOKENS.PermissionPolicy, () =>
  new ReadOnlyPermissionPolicy(inner, projectRoot),
);
```

Once wired, the session toggle (`ctx.meta['readOnly']`) controls activation — no additional wiring is needed to enable or disable it mid-session.

### Toggling via WebSocket (WebUI)

The WebUI communicates read-only state through a `session.setReadOnly` message:

```json
{
  "type": "session.setReadOnly",
  "payload": { "enabled": true }
}
```

The backend handler sets `agent.ctx.meta['readOnly'] = enabled` and broadcasts the updated session state to all connected clients.

---

## Subagent behaviour

Subagents independently inherit read-only constraints through the `AutoApprovePermissionPolicy`, which uses a capability allowlist. When the leader session is in read-only mode:

- **Leader**: The `ReadOnlyPermissionPolicy` wrapper blocks mutation-capable tools.
- **Subagents**: The director configures subagents with a read-only capability allowlist (`FS_READ`, `NET_OUTBOUND`, `MEMORY_READ`, `TOOL_META`, coordination capabilities) that excludes all write/delete/shell capabilities.

This means subagents never need their own `ctx.meta['readOnly']` check — their permission policy simply does not grant write capabilities.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   PermissionPolicy                    │
│  ┌──────────────────────────────────────────────┐    │
│  │        ReadOnlyPermissionPolicy (wrapper)    │    │
│  │  ┌────────────────────────────────────────┐  │    │
│  │  │    DefaultPermissionPolicy (inner)      │  │    │
│  │  │  - trust.json rules                    │  │    │
│  │  │  - YOLO mode                           │  │    │
│  │  │  - path-based deny/allow patterns      │  │    │
│  │  └────────────────────────────────────────┘  │    │
│  │                                              │    │
│  │  checks ctx.meta['readOnly'] at evaluate()   │    │
│  │  blocks tools with mutation capabilities     │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Files

| File | Purpose |
|---|---|
| `packages/core/src/security/readonly-permission-policy.ts` | Policy wrapper class |
| `packages/core/src/security/index.ts` | Barrel export |
| `packages/core/src/types/permission.ts` | `PermissionDecision.source` includes `'readonly_mode'` |
| `packages/core/tests/security/readonly-permission-policy.test.ts` | Policy regression coverage |

---

## Testing

The policy tests cover mutation declarations, capabilities and report-path exceptions:

```
✓ passes through when ctx.meta.readOnly is not set
✓ passes through when ctx.meta.readOnly is false
✓ blocks write tool when readOnly is true
✓ blocks shell tool when readOnly is true
✓ allows read tool when readOnly is true
✓ allows memory read tool when readOnly is true
✓ allows writing .md to .temp_files/ when readOnly is true
✓ blocks writing .ts to .temp_files/ when readOnly is true
✓ blocks writing .md outside .temp_files/ when readOnly is true
✓ rejects path traversal escape from .temp_files/ when readOnly is true
✓ delegates trust/deny/denyOnce/allowOnce to inner policy
✓ explain delegates to inner policy when readOnly is not set
```

Run with:

```bash
pnpm --filter @wrongstack/core test tests/security/readonly-permission-policy.test.ts
```

---

## Limitations

- **No global config persistence**: Read-only mode is session-scoped and stored in `ctx.meta`. It is not persisted to `config.json` and must be re-enabled on each session.
- **Tool metadata coverage**: `toolMutates` blocks `mutating: true` even without capability labels. A tool that omits both its mutation declaration and relevant capabilities can still bypass this classification.
- **`.temp_files/*.md` path check**: The exception uses string-based path resolution. Symbolic links or alternative path representations may bypass the check — the policy resolves paths against the project root for basic traversal protection.
