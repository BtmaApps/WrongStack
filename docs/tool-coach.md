# Tool Coach

Tool Coach gives the active model short, timely advice about tools that are **enabled in its current session**. It is an advisory part of the Core agent loop, not a separate authority or tool executor.

It is on by default, including for existing profiles that omit the setting. Set `features.toolCoach` to `false` to disable it, or use `/settings tool-coach on|off`, the TUI Settings picker, the WebUI Context tab, or SimpleUI Settings. The change applies to the next task in the active runtime.

## When it speaks

1. At the start of a user task, it ranks the enabled catalog against the task and suggests at most three tools. If no match is clear, it points to `tool_search` when that tool is enabled.
2. After a discovery tool succeeds, it suggests inspecting returned paths or symbols before changing code.
3. After a file-changing tool succeeds, it suggests available focused verification tools.
4. After a tool error, it tells the model to use the actual error, change its next action, and avoid an identical retry. Selection alternatives are shown only when they are enabled. A policy denial is final and never produces a bypass suggestion.

The error path uses the executor's structured settlement (`invalid_input`, `denied_by_policy`, `blocked_by_hook`, `declined`, and so on). It does not infer a policy decision from words in a tool's output. A batch with both discovery and a file change prioritizes the verification note.

The model-facing notes are in English. They are inserted immediately before the next provider request, so the next decision sees the advice. Notes are bounded and deduplicated for the active run.

## Sources of truth

Tool Coach reads `Context.catalogTools`, the complete enabled catalog. It does not infer availability from the provider's shortened tool list, and it does not invent tool names. Each note is a recommendation; the model still checks the task and tool result before acting. Permissions, approval, required skills, and execution remain with the existing tool executor.

The ranking is local and deterministic. It uses tool names, descriptions, usage hints, categories, and a small English/Turkish vocabulary bridge. It makes no additional provider call. The full schema remains available through `tool_search` and through validation error feedback.
