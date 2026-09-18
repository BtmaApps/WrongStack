## collab_debug — Three-Agent Parallel Code Review

`collab_debug` runs **BugHunter + RefactorPlanner + Critic** simultaneously on the
same file snapshot. All three agents receive the full target context, so the
number of files must be kept small.

Overlap here is intentional: the three roles are meant to disagree, and the
Critic exists to challenge the other two. When deduplicating, keep the
disagreement visible instead of collapsing it into one line — a finding all three
flag and a finding one flags while another disputes are different signals.

### Target size limit: dynamic, defaults to 30

The file limit is computed in this priority order:

1. **`maxTargetFiles`** — explicit override if provided
2. **`contextWindow`** — dynamic calculation: `floor((contextWindow × 0.4) / 2000)`
3. **`DEFAULT_MAX_TARGET_FILES = 30`** — fallback when neither is set

Each of the three agents gets the entire file snapshot as context. With
3 agents × N files, large targets cause:
- **Token overflow** — context window exhausted
- **Timeout failures** — session times out before agents finish
- **Budget exhaustion** — each agent burns through iterations with no progress

| contextWindow (tokens) | Calculated limit | Practical range | Interpretation |
|---|---|---|---|
| 1_000_000 | 200 files | 40–60 | ⚠️ Fits, but review quality decays long before this |
| 500_000 | 100 files | 30–50 | ⚠️ Split by module rather than running one huge pass |
| 400_000 | 80 files | 25–40 | ✅ Roomy |
| 200_000 | 40 files | 20–30 | ✅ Comfortable |
| 100_000 | 20 files | 15–20 | ✅ Comfortable |
| 32_768 | 6 files | 4–6 | ⚠️ Very limited |
| not provided | 30 files (default) | — | Safe baseline, ignores the real window |

The session throws a clear error if the resolved file count exceeds the effective
limit. Treat the calculated limit as a hard cap and the practical range as the
actual target — a run at exactly the limit tends to time out rather than fail
cleanly.

**The gap between the two columns widens as windows grow, and that is the point.**
The formula answers "does this fit", which stopped being the binding constraint
once windows passed a few hundred thousand tokens. What binds now is attention
and wall-clock: three agents each holding 200 files will fit the tokens fine and
still produce a shallower review than three agents holding 50, because per-file
scrutiny drops as the snapshot grows and the session runs long enough to hit
timeouts. Fitting is not the same as reviewing.

**On a large-window model, pass `contextWindow` explicitly.** Omitting it falls
back to `DEFAULT_MAX_TARGET_FILES = 30` — a floor set for the old 100–200K era,
which now silently caps a 1M-token session at a fraction of what it could handle.
The default is safe, not correct.

### Correct usage

```js
// ✅ Good — single package, limited files
collab_debug(["packages/core/src/agents/**/*.ts"])

// ✅ Explicit — override limit directly
collab_debug({
  targetPaths: ["packages/core/src/**/*.ts"],
  maxTargetFiles: 15,
})

// ✅ Dynamic — limit computed from contextWindow
collab_debug({
  targetPaths: ["packages/core/src/**/*.ts"],
  contextWindow: 100_000,  // → limit = floor(100000 * 0.4 / 2000) = 20
})

// ❌ Bad — entire monorepo
collab_debug(["packages/**/src/**/*.ts"])
```

### For large codebases

Run **package-by-package** or **module-by-module** sessions. Target only the area
under review, not the whole repo. Sequential scoped sessions beat one oversized
session that dies halfway — and they let you synthesize as you go.

---

