# `/flow` — Cross-board workbench

TUI command; alias `/workbench`. Reads the current project's Kanban workbench
without claiming or changing tasks.

The report shows lifecycle totals, board count and four focus lanes: **Now**,
**Next**, **Blocked** and **Review**. Each item includes its board/source,
placement reason, child progress and available contract-readiness information.
The command displays up to three items per lane and three alerts; hidden counts
remain visible so a bounded view is not mistaken for the whole board.

```text
/flow
/kanban
```

Use `/flow` to identify the next card to inspect, then `/kanban` to read or
update the authoritative card. Failure to load the workbench is reported in
chat. A text view does not dispatch work, mark completion or run verification.

Source: [`workbench-slash.ts`](../../packages/tui/src/workbench-slash.ts).
See [workbench lanes](../kanban-workbench.md) and [Kanban commands](kanban.md).
