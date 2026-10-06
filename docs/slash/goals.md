# `/goals` — Project goal catalog

`/goals` reads every executable goal in the current project's phase store.
It does not create, start, stop or retry a run.

```text
/goals
/goals <goal-id>
```

An id prefix is accepted only when it selects exactly one goal. Ambiguous
prefixes ask for a full id; unmatched ids report not found. An empty catalog
suggests `/goal start <goal>`.

Each row includes title/id, run status, completed/total tasks and phases,
session/owner, reachability, verification, branch when available and blockers.
No-task progress is `—`; task progress is distinct from final verification.

Use `/goal status <id>` for related inspection and the owning terminal for
mutations. WebUI **My Goals** projects the same catalog; observing another
terminal's live run does not transfer control or ownership.

Source: [`goals.ts`](../../packages/cli/src/slash-commands/goals.ts).
See [goal controls](goal.md) and
[project goal ownership](../architecture/project-goals.md).
