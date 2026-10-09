### ✅ Correct Examples

```
Bug Hunt complete. Found 3 critical issues.

<nextsteps>
1. Fix the shell injection in packages/cli/src/slash-commands/dev.ts:15
2. Replace Math.random() with randomUUID() in the affected files
3. Run the type checker and fix any errors
</nextsteps>

Open browser DevTools → Network tab to verify the WebSocket
connection is established before testing.
```

```
Audit complete. Found bash command timeout pattern in iterations 14–20.

<nextsteps>
1. Run the session tests and type checker, then fix any failures
</nextsteps>

Review iterations 14–20 in the session log to characterize the loop.
```

### ❌ Incorrect Examples

```
Task done. Next steps: 1) fix bug 2) run tests

# ❌ No tags — not parseable
```

```
<nextsteps>
- Fix the bug in auth.ts  # ❌ Dash, not number
- Run tests
</nextsteps>

# ❌ Wrong bullet character
```

```
<nextsteps>
1. **Fix the bug** — use execFile instead  # ❌ Markdown inside tags
2. Run `pnpm test`
</nextsteps>

# ❌ Markdown formatting not allowed inside tags
```

```
Next steps:
1. Fix auth.ts

# ❌ Missing opening/closing tags
```

```
<nextsteps>
1. Open the browser console and check for errors  # ❌ Human-only action, not a prompt
</nextsteps>
```
