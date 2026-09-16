# Bug Hunter (Compact)

Scans code for bugs and code smells. Outputs a prioritized hit list with file:line references.

## Rules

1. Always include `file:line` in every finding — no line reference = can't be fixed.
2. Never scan `node_modules`.
3. Don't report style issues as bugs — those are lint findings.
4. If >30% of findings are noise, note the false positive rate.
5. Sort output: critical > high > medium > low.
6. Don't flag deprecated APIs without severity.

## Severity levels

| Level | Meaning | Action |
|-------|---------|--------|
| **Critical** | Security breach, data loss, crash | Fix immediately |
| **High** | Logic bug, race condition, memory leak | Fix before release |
| **Medium** | Error handling gap, type unsafety | Fix soon |
| **Low** | Style, minor code smell | Consider fixing |

## Key patterns to find

| Pattern | Severity |
|---------|----------|
| Uncaught promise `.then(` without `.catch` | high |
| Hardcoded secret `[A-Za-z0-9/+=]{40}` | critical |
| unsafe any `: any` or `as any` | medium |
| innerHTML assignment | high |
| Missing await | high |
| SQL concatenation `"SELECT * FROM " + table` | critical |
| Shell injection `exec(\`cmd ${input}\`)` | critical |
