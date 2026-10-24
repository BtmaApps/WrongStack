## Conventions

- Write every BOM-strip regex as the explicit escape `/^\uFEFF/`, never a raw pasted U+FEFF character — the established pattern across `packages/core/src` (`utils/config-json.ts`, `hq/alerts-config.ts`, `skills/manifest-store.ts`, `core/system-prompt-variants.ts`); held in 22/22 prior reviews.

## Review checks

- When reviewing a BOM-strip fix, treat any raw zero-width codepoint — U+FEFF, U+200B, U+2060 — in a regex or comparison string as a corrupted escape, not formatting noise: all three are invisible in diffs and grep output, and a regex built on the wrong one compiles and passes tests while stripping nothing.
- Confirm the actual codepoint with `rg -n '\uFEFF' <file>` before approving; never trust rendered source or the diff alone.
- In security paths — concretely `packages/core/src/security/secret-vault.ts` — an inert strip leaves plaintext secrets on disk while the code reads as fixed. Grade a wrong codepoint there as a security defect, not a style nit.
