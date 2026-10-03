## View-Registry Contract

- For every WebUI scroll bug, inspect the view registration in `packages/webui/src/components/view-registry.ts` before changing pane internals. Treat the standard `wrapperClassName` (`flex-1 min-h-0 min-w-0 overflow-hidden`) as a **block** box beneath `overflow-hidden` ancestors: every registered view root must include `h-full` and its own scroll container; never rely on `flex-1` alone.

## Responsive Pitfalls

- In each below-breakpoint `flex-col` variant, check `shrink-0` panes for intrinsic or unbounded height. Ensure they cannot grow indefinitely and collapse siblings using `flex-1 min-h-0`.
- Apply this check specifically to the journal pane in `ChimeraReviewsView` and the metadata pane in `RepositoryHistoryView`.
