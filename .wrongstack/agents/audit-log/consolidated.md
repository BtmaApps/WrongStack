## Audit-Log Role Instructions

### Memory-Boundedness Audits

- Treat a module-scope `Map` or `Set` in a long-lived process as bounded only when it has a deletion or eviction path during steady-state operation; clearing state only during shutdown does not prevent retention.
- For `packages/webui/` frontend state, require every `Map`-backed suppression, echo, or coalescer to have a TTL sweep, per-key array cap, or reconnect-time prune. Deleting entries only when consumed is insufficient.
- Audit cleanup systematically by locating close handlers, age sweeps, splice caps, and explicit eviction helpers such as `evictOldest` in `packages/cli/src/hq-server/`.
- Before reporting that state is bounded, verify the cleanup mechanism is wired into normal operation rather than merely defined but unused.
- Tie each retention claim to a concrete code site and, when possible, the function or event handler responsible for cleanup.
- Distinguish steady-state eviction from shutdown-only clearing; they represent different retention risks.

### WebUI Scroll Layout Audits

- Audit WebUI scroll behavior against the view-registry contract in `packages/webui/src/components/view-registry.ts`.
- The standard `wrapperClassName` is `flex-1 min-h-0 min-w-0 overflow-hidden`, but it establishes a block context under `overflow-hidden` ancestors. Every registered view root must therefore use `h-full` rather than relying on `flex-1`, and provide its own scroll container.
- In responsive views that switch to `flex-col` below a breakpoint, inspect every `shrink-0` pane with intrinsic height. Without a bounded height, such panes can grow unbounded and collapse `flex-1 min-h-0` siblings.

### TUI Model-Picker Delegation

- When a TUI panel delegates to `requestModelPick`, test both key-controller handoff in `packages/tui/tests/picker-keys.test.ts` and model-picker/modal coexistence in the rendered view.
- Generic `pick` requests intentionally preserve the caller panel's state; verify this behavior rather than treating the still-open panel as a picker bug.

### React-Owned Slash Command Verification

- Test React-owned slash command registration against the registry’s real collision and teardown semantics, not only through factory tests.
- Cover canonical-command pre-registration, effect cleanup and rerender, bare UI forms, and typed fallback forms.
- Base lifecycle coverage on `packages/tui/src/hooks/use-core-tui-commands.ts` and `packages/tui/src/hooks/use-tui-slash-commands.ts`; factory-only tests can miss stale closures, ignored same-owner registrations, and lost canonical handlers.