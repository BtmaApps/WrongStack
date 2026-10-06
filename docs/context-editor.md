# Context window editor

The WebUI editor is
[`ContextWindowEditor.tsx`](../packages/webui/src/components/context-editor/ContextWindowEditor.tsx).
Its backend owns snapshot, revision, validation, removal and apply operations in
[`context-editor.ts`](../packages/webui-server/src/server/context-editor.ts),
with [types](../packages/webui-server/src/server/context-editor-types.ts) and
[message validation](../packages/webui-server/src/server/context-editor-validation.ts).
Wire messages belong to `@wrongstack/webui-protocol`.

Revisions hash canonical message content while excluding derived token/error
metadata. Validation compares the submitted base revision with the live
revision and refuses an active run or stale snapshot. Metrics distinguish
message tokens from the full request's system/tool overhead. Validation
returns structured errors, warnings and a tool-use/result repair preview.

Removal can target messages, blocks or text ranges. The backend bounds removal
counts and validates ranges, including Unicode surrogate boundaries, before
applying changes. System prompt and tool schemas are read-only context data.
Editing the active context does not rewrite original historical evidence.

The [original SDD](specs/context-window-editor-sdd.md) contains proposed file
splits and acceptance criteria. Its draft paths and test names are not the
current implementation inventory.
