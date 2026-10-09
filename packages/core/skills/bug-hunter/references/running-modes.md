## Running modes

### 1. Standalone scan (default)

As documented above. Report only; suggest fixes, don't apply them, unless the
user asked for fixes.

### 2. Fan-out worker

Dispatched by a leader across a chunk of files (typically 5–10 per worker).

- Stay inside the assigned paths. Scope creep breaks the leader's coverage math.
- Return the **same result shape** every sibling worker returns — severity,
  `file:line`, one-line fix — so findings deduplicate cleanly.
- If the chunk is too large to finish, report what you confirmed and name the
  files you did not reach. Silent partial coverage is the failure that matters.

### 3. Cascade agent (behind a chimera review)

When verified chimera findings meet the `cascadeOn` threshold
(`high` or `critical`; default `high`), the runtime spawns bug-hunter for
findings at or above that severity. You receive the review report and the changed files; you investigate
each finding and **apply fixes**. Results go directly to the session
transcript. **NEVER send mailbox messages** to the leader. You take part in the
re-review loop, up to `maxCascadeDepth` cycles.

- **Minimal diff.** Fix the flagged defect and nothing else.
- **Verify the line first.** If the cited line doesn't say what the report
  claims, report the discrepancy instead of editing something adjacent.
- **Don't fix what you can't check.** If the fix needs a design decision or
  would change a public contract, leave it and say why.
- **List what you didn't fix** and the reason.

### 4. Proof-driven round (Proof-Driven Bug Hunter, /bughunt)

One round = at most one proven, fixed, verified root cause. The round's own
instructions are the protocol; this mode governs how the candidate is chosen.
It overrides the out-of-scope list below: in this mode you **do** fix the bug
and **do** write its regression test, and you **never** fan out, however large
the target.

1. **Read prior round reports first.** Collect their root-cause fingerprints
   (affected path + trigger + violated contract) and skip any candidate with the
   same root cause, even if it surfaces through a different symptom.
2. **Survey, then shortlist.** Walk the target layer by layer with the pattern
   table, lifecycle and async paths first. Keep two or three confirmed
   candidates, not one guess.
3. **Rank by provability × impact.** Prefer a reachable defect you can
   reproduce deterministically through the production path over a scarier one
   you can only argue for. A candidate whose proof would need mocking the very
   code under suspicion is not provable; drop it.
4. **Commit to one.** Write down its trigger, expected behaviour and its basis,
   observed behaviour, and impact. Then prove it with `debugging` and `testing`
   before touching production code.
5. **If the proof won't go red,** the candidate is unproven, not fixed. Move to
   the next shortlisted candidate within the round's budget, or end the round
   with no proven bug. Never edit production code to "see if it helps".
6. **Keep a coverage note:** surfaces inspected, candidates rejected and why,
   and unresolved leads. An unsuccessful reproduction does not make a surface
   bug-free, and the report must not imply it does.

Finish with `verify-before-done`: the same proof green, the regression test in
the normal suite, related checks, and an honest outcome label.

---
