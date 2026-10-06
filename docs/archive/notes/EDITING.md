# Safe Editing Patterns

> Archived on 2026-10-06. Claims, counts and test results below are historical
> evidence or proposals; they are not current checkout certification. Use the
> [maintained documentation](../../README.md) and current source for runtime behavior.


## The Problem

The `edit` tool sends `old_string`/`new_string` as JSON string fields over a streaming connection. When content exceeds ~2KB or contains backslashes/newlines, the JSON encoding breaks silently and the tool fails with:

```
Tool "edit" received arguments that were not a valid JSON object
```

This is NOT a tool bug — it's a payload size/encoding limit in the streaming protocol.

## The Rules

### Rule 1: `write` for new files
Always use `write` for new files. It handles multi-line content without issues.

### Rule 2: `edit` ONLY for trivial changes
Use `edit` only when ALL of these are true:
- `old_string` is ≤200 characters
- `new_string` is ≤200 characters
- No backslashes in either string
- No more than 2 newlines in either string
- No special regex characters that need escaping

### Rule 3: `read` → `write` for everything else
For any non-trivial edit to an existing file:
1. `read` the file first
2. Build the new content in memory
3. `write` the complete new file

### Rule 4: Chunk large files
If a file is very large, edit it in two passes:
1. First pass: identify a unique anchor line near the change
2. Second pass: make the actual change

## Quick Decision Tree

```
Need to edit an existing file?
│
├─ Trivial change (≤2 lines, no special chars)?
│   └─ YES → use edit
│
├─ New file?
│   └─ YES → use write
│
└─ Non-trivial change?
    └─ YES → read → write
```

## What Counts as "Trivial"

✅ SAFE for `edit`:
- Adding/removing a single line
- Changing one variable name
- Fixing a typo
- Adding one import
- Changing a single string value

❌ UNSAFE for `edit`:
- Multi-line function bodies
- Anything with regex patterns (backslashes)
- Code blocks with comments
- Files with complex JSON/string content
- Anything that requires scrolling to find old_string

## Examples

### SAFE (use edit)
```javascript
// Old
const MAX_FILES = 20;

// New
const MAX_FILES = 50;
```

### UNSAFE (use read + write)
```javascript
// Old — too long, multi-line
function findCorruptionInStagedFiles(stagedFiles) {
  const findings = [];
  for (const file of stagedFiles) {
    if (!isScannable(file)) continue;
    const content = getFileContent(file);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(CORRUPTION_FRAGMENT)) {
        findings.push({ file, line: i + 1, snippet: lines[i].slice(0, 120) });
      }
    }
  }
  return findings;
}

// New — same structure, just different logic
```

### UNSAFE (use read + write) — backslashes
```javascript
// Old
const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*');

// New
const regex = pattern.replace(/\./g, 'DOT').replace(/\*/g, 'STAR');
```

## When in doubt: read → write

If you're not sure whether `edit` will work, just do:
1. `read` the file
2. Mentally compose the new version
3. `write` the complete file

This is always safe and takes the same amount of time as fighting with `edit`.
