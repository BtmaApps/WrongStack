# Coding-agent feedback

WrongStack uses completed tool evidence to guide the next coding step across
CLI, TUI, WebUI and SimpleUI through the shared agent runtime.

## Post-edit diagnostics

With `@wrongstack/plug-lsp`, `diagnosticsAfterEdit: "background"` (the default)
and host hooks enabled, successful `edit`, `write`, `replace`, `patch` and
`codebase-ast-replace` calls for a configured language receive inline LSP
feedback before the tool result returns. Single-file targets come from `path`
or `file`. Bulk `replace` and `patch` targets come from the completed tool's
structured file scope, preserved independently of output rendering, clipping
and spooling. Patch paths respect its working directory. Input globs and diff
text are not expanded or parsed again by the LSP plugin. Dry runs are skipped;
shell commands are not automatically checked.

Feedback identifies the file, tracked document version, SHA-256 content hash
and server. It uses the configured severities and diagnostic counts, with a
7,000-character diagnostic-body limit and an 8,000-character overall limit.
At most eight supported files are checked per call. Diagnostic count limits
apply across the batch; omitted files and unavailable scopes are explicitly
unverified. The host carries at most 64 path entries, excluding paths changed
by secret scrubbing. Earlier files are rechecked after later analysis. The
total analysis deadline shared by all files is
`min(diagnosticsWaitMs, 5000)` milliseconds, including lazy server startup.
A cold server may therefore report an unverified notice; use `lsp_diagnostics`
for an explicit follow-up check. The verified-file count refers to diagnostic
snapshot identity and freshness, not to correctness or passing tests.

Silent servers, changed documents, replaced servers and failed checks never
produce a clean-file claim. Results from a departed project/session or canceled
hook are discarded. The observations describe the current file, not only errors
introduced by the edit, and do not replace tests or typecheck. Manual mode and
disabled ordinary hooks skip this feedback. Minimal hosts without hook support
retain background collection.

## Repetition detection

Tool iterations are evaluated after execution. Each interaction includes the
tool name, canonical arguments, result content and error status; transient call
IDs are excluded. Changing results do not count as identical interactions.
For spooled outputs, a host-only digest of the full scrubbed output is used,
so random artifact names do not look like progress and a changed middle section
is not hidden by identical head/tail previews. Inline hook feedback participates
in that digest; content-changing policies invalidate the stored fingerprint.
All calls in a batch participate in iteration and periodic-cycle detection.

Existing steer/cut thresholds, observation-tool allowances and run budgets
remain active. Text-only repetition is still detected. Different output may
contain new evidence but does not certify progress, correctness or completion;
variable timestamps and other changing output still require the run budget.
The call reaching a repetition threshold has already executed and been journaled
when the detector acts. Permission checks and tool/run budgets still apply before
execution.

## Research handoff

The existing Research role is instructed to return decision-relevant findings,
source links, exact API names and applicable versions, useful sourced examples,
and explicit uncertainty/unanswered questions. This is a prompt contract, not a
runtime guarantee of source accuracy. Existing role budgets and configured
model selection apply; this change creates no automatic worker or extra model
call. The leader remains responsible for validating implementation-critical facts.

## Evidence boundary

Regressions cover changing results, unchanged failures/cycles, fresh diagnostic
feedback, stale-file/server rejection, timeout, cancellation and plugin/tool
hook delivery. These checks do not establish higher live-model success rates,
lower billing, or faster completion. Those require paired tasks against the
same model, inputs and budget, reporting outcomes and total provider usage.
