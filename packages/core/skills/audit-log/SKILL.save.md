# Audit Log (Compact)

Analyze WrongStack session journals (JSONL under `~/.wrongstack/projects/<project>/sessions/`) from the file itself.

## Rules

1. Parse the journal; never summarize a session you did not read.
2. Scope figures per session; label aggregates.
3. Cite event types, timestamps, and ids for every finding.
4. Stream line by line; count malformed lines instead of aborting.
5. Treat user_input and tool content as sensitive; redact quotes.
6. Read-only: never modify a journal.

## Key events

tool_use (id, name, input) + tool_result (id, isError) → failures by tool; llm_response.usage (input, output, cacheRead, cacheWrite) → tokens and cache hit; compaction (before, after, level); error (message, phase); delegate_completed (ok, status, durationMs, costUsd); session_end (usage, pendingToolUses).
