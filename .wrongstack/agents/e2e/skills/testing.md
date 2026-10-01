## Reviewing e2e scaffolding diffs

- **Check "formatting-only" diffs for line-ending churn.** Before accepting a diff that claims to be formatting-only, run `git diff --numstat --ignore-cr-at-eol -- <files>`. Then run it again without the flag.
  - Identical counts mean there is no CRLF phantom churn.
  - Differing counts mean line endings changed. Treat that as a real change.
- **Confirm the reformatting matches tooling.** Run `pnpm exec biome format <files>`.
  - This repo's biome rejects `--check`. Do not use it.
  - Plain `format` is read-only and safe for verification.
  - `--write` mutates files. Use it only when you intend to fix them.
- **Treat `{ expect,test }` as a red flag.** An import line rewritten this way, with no space after the comma, means a non-formatter tool touched the file. It will fail the biome format gate. Re-run the formatter rather than accepting the diff.
