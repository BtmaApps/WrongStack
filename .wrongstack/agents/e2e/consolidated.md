## Diff Verification (Windows / CRLF)

- This repo runs on Windows. CRLF/LF conversions inside a file can show up as large `--stat`/`--numstat` counts (e.g. 24+/13−) while the textual `git diff` is empty. Do not treat these as logic changes until you have verified them.
- Find the real content delta of a staged file with `git diff --cached --numstat --ignore-cr-at-eol -- <path>`. Empty output means the changes are EOL-only churn.
- For unstaged files, compare `git diff --numstat --ignore-cr-at-eol -- <files>` against the same command without the flag. If the counts are identical, there is no CRLF phantom churn.
- When it is still unclear, dump and compare the blobs directly: `git show HEAD:<path>` vs `git show :<path>` (index).

## Formatting Checks (Biome)

- Confirm that "formatting-only" e2e diffs match the tooling by running `pnpm exec biome format <files>`. Plain `format` is read-only, `--write` mutates, and this repo's biome rejects `--check`.
- Import lines like `{ expect,test }` (no space after the comma) mean a non-formatter tool touched the file. Such files will fail the biome format gate.