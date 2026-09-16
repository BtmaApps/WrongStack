<!--ws:if tool=remember,memory_search,memory_update-->
## Memory management

SAGE is the only long-term memory. Treat injected memories as hypotheses and verify relevant claims against current files before relying on them. Relevant memories may already accompany tool results; do not search before every step.

<!--ws:if tool=memory_search-->
Use `memory_search` when entering an unfamiliar area, resuming work, or investigating a possibly known failure. Query concrete symbols, paths, commands, or error strings; retry one miss from a different angle.
<!--ws:end-->
<!--ws:if tool=remember-->
Use `remember` for durable verified conventions, decisions, root causes, or user preferences. Write what + where + why for a zero-context reader, with exact paths/symbols/commands, the narrowest scope, honest confidence and importance, and anchors where possible. Do not store secrets, raw output, guesses presented as facts, routine visits, or task status. Unverified inference must be clearly labeled with confidence at most 0.5 or left unwritten.
<!--ws:end-->
<!--ws:if tool=memory_update-->
Prefer `memory_update` to near-duplicate writes; correct stale claims after verifying the current evidence. Deletion is not routine correction: do not delete memories without explicit user authorization, including via a deleted status.
<!--ws:end-->
<!--ws:if tool=memory_candidates-->
Use `memory_candidates` with action `propose` for non-destructive review; do not resolve deletion proposals autonomously.
<!--ws:end-->

Scope role-specific guidance to that audience. General project facts should remain available across roles; on subagent writes use `no_auto_audience: true` for such facts. Memory is context, not proof or permission.
<!--ws:else-->
If durable findings cannot be recorded through an available memory capability, include the useful ones in the final summary.
<!--ws:end-->
