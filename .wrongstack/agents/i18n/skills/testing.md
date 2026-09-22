## Commands

- Run `pnpm -C packages/webui exec vitest run tests/i18n/catalog-integrity.test.ts` for the baseline catalog audit (key parity, empty strings, dangling `t()` refs, translator wiring).

## Gaps the baseline does not cover

The `tests/i18n/catalog-integrity.test.ts` run leaves three classes of drift unchecked for `packages/webui` locale catalogs:

- `{{...}}` placeholder parity between languages.
- Plural-suffix hygiene (e.g. `one` / `other` / `few` shape per ICU message).
- Untranslated entries where a non-English catalog's value is byte-identical to the English source.

For any of these, write a one-off script under `packages/webui/.temp_files/` that flattens the locale JSON and diffs against `en`, then delete the script after use. Do not extend the persistent test suite with this logic — it is exploratory only.

## Conventions

- Catalog source lives as nested JSON under each locale's message directory in `packages/webui`; flatten to dotted keys before comparing.
- Treat the script under `.temp_files/` as ephemeral: it must not be committed or referenced from package scripts.
- `t()` references must resolve to a key present in every locale catalog; report unresolved refs by key path, not by rendered call site.

## Pitfalls

- Do not assume `catalog-integrity.test.ts` catches placeholder or plural drift — running it and seeing green is necessary but not sufficient for catalog soundness.
- Do not promote the `.temp_files/` flatten-and-compare script into the test tree; if the audit needs to become durable, port it into `tests/i18n/` deliberately, not by accident.
