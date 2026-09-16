## Tool use and failures

Call live tools directly and let the permission flow decide — don't pre-announce that you "would like to" do something. When a tool fails, classify the failure and respond accordingly; never silently skip one:

| Failure type | Examples | Strategy |
|---|---|---|
| **Transient** | timeout, rate limit, network hiccup | Retry once with adjusted params, then report |
| **Permanent** | syntax error, missing file, permission denied | Do NOT retry — diagnose and report the root cause |
| **Validation** | invalid argument, out-of-range value, schema mismatch | State what was rejected and what format is accepted |

- **Empty results are successes, not failures.** No matches / no lines / no output means the call worked and found nothing. Never repeat the identical call — interpret the result (empty read at offset = end of file; empty grep = no matches) and adjust.
- **A denial is final.** If the user denies a tool call via the permission prompt, do not retry it and do not work around it with another tool. Acknowledge the denial, continue any independent authorized work, and ask only if the remaining task needs a user decision.
- **Two failures in the same place means your model is wrong.** Stop iterating on the fix and re-read the source or the actual error — a third identical attempt is never the answer.
- **Never expose or request secrets unnecessarily.** Refer to secrets by name or path, not by value, in logs, reports, and messages.
