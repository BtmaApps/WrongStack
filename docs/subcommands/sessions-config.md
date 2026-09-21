# `wstack sessions` · `wstack config`

## `wstack sessions`

Bare `wstack sessions` lists up to 20 saved sessions. Each row contains the session id, start time, recorded token total, and title.

```text
wstack sessions
```

Resume is a launcher alias rather than a nested `sessions` action:

```text
wstack resume <session-id>
```

`wstack sessions resume <id>` and `wstack sessions delete <id>` are **not registered actions**. With those arguments, the current handler simply prints the normal session list.

### Fork a session journal

```text
wstack sessions fork [session-id]
wstack sessions fork [session-id] --to <checkpoint-index>
```

If the id is omitted, the latest saved session is used. Fork creates an append-only child journal while leaving the parent unchanged. The result prints the child id, the checkpoint hash, and any captured workspace-checkpoint manifest. The project files are shared; journal forking does not copy a working tree.

`--to` must be a non-negative checkpoint prompt index. The output includes a `wstack resume <child-id>` command.

### Inspect fleet runs

```text
wstack sessions fleet
wstack sessions fleet <run-id>
```

The nested `fleet` handler lists persisted fleet runs or inspects one run. It is distinct from the in-session `/fleet` control surface.

## `wstack config`

| Command | Effect |
|---|---|
| `wstack config` / `wstack config show` | Print the effective configuration as JSON with secret-like keys redacted. |
| `wstack config edit` | Print the command/path to open the global config in `$EDITOR` (or `vi`). |
| `wstack config backup` | Create `config.json.last` plus a timestamped full encrypted snapshot for the active profile. |
| `wstack config history` | List configuration history entries. |
| `wstack config history --id <id>` | Show one masked snapshot and diff summary. |
| `wstack config restore <id>` | Restore a history snapshot and create a backup. |
| `wstack config restore --latest` | Restore `config.json.last`. `-l` is also accepted. |

The command reads the effective in-memory config for `show`; it does not print decrypted API-key values.

History snapshots shown by `history` are masked views. Full encrypted pre-write
snapshots are also kept for recovery. Secret arrays are restored by stable
`label`/`id`, not by array position, so key reordering cannot attach a live
credential to the wrong historical label. Interactive boot recovery applies to
the selected named profile, not only `default`.

## Related checkpoint command

Use [`wstack rewind`](rewind.md) to restore file checkpoints in an existing session. `sessions fork` creates a non-destructive child journal instead.

## Code reference

- `packages/cli/src/subcommands/handlers/sessions-config.ts`
- `packages/cli/src/subcommands/handlers/sessions-fleet.ts`
- `packages/cli/src/config-history.ts`
- `packages/core/src/storage/session-store.ts`
