## Conventions

- Write BOM-stripping regexes as the explicit escape `/^\uFEFF/`, never as a raw U+FEFF or another invisible codepoint such as U+200B or U+2060. Follow the established pattern in `packages/core/src`: `utils/config-json.ts`, `hq/alerts-config.ts`, `skills/manifest-store.ts`, and `core/system-prompt-variants.ts` (`[applied 22×, 22 ok]`).

## Review checks

- Before approving, detect raw BOM characters with `rg -n '\uFEFF' <file>` and inspect the source escape; do not trust rendered diffs or grep output alone. An inert raw or lookalike codepoint may compile and pass tests while stripping nothing.
- In `packages/core/src/security/secret-vault.ts`, treat a failed BOM strip as a security defect, not a style issue, because plaintext secrets may remain on disk.
