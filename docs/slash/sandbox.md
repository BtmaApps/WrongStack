# /sandbox

Show the active exec-sandbox policy (plan 28 — `docs/specs/sandboxed-execution-tiers-sdd.md`).

## Usage

```
/sandbox [--audit]
```

- Prints the resolved policy for the exec-family tools (`bash`, `exec`, `git`):
  `mode` (`off` | `enforced`), `tier` (`read-only` | `workspace-write` | `full-access`),
  `backend`, and `writableRoots`.
- `--audit` additionally prints the last audit records (denials and expansion
  requests/outcomes) recorded in this process.

## Configuration

Set `tools.sandbox` in your **profile config** (`~/.wrongstack/profiles/<name>/config.json`):

```json
{ "tools": { "sandbox": { "mode": "enforced", "tier": "workspace-write", "writableRoots": [] } } }
```

A repo-committed `<project>/.wrongstack/config.json` may only set `mode`/`tier`;
`backend` and `writableRoots` are stripped by the in-project policy (see
`IN_PROJECT_DENIED_PATHS` in `packages/core/src/storage/config-loader/in-project-policy.ts`).

Default is `mode: "off"` — no behavioral change until you opt in.

## Events

Audit events are emitted on the EventBus when a bus is wired
(`setSandboxAuditEvents`): `sandbox.denied`, `sandbox.expansion_requested`,
`sandbox.expansion_outcome`. Without a bus, only the in-memory ring buffer
(`/sandbox --audit`) keeps the record.
