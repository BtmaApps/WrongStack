# FluidFlow prompt collection

Source: https://github.com/ersinkoc/FluidFlow

Revision: `6c623ae4b10217d3542a904747c776f58baef268`

This import preserves all 588 category entries and 12 quick actions, including
their 1,800 original simple/detailed/advanced texts. It also includes all five
default user templates from `services/promptTemplateStorage.ts` and the ten
Markdown templates under `prompts/`. No original entries are removed for
duplicate titles. Slugs include the upstream category and ID to disambiguate
them. The default `content` is the original detailed text.

`upstream.json` records source paths, original IDs, revision, and SHA-256 hashes
for every imported text. `LICENSE.md` preserves the upstream license notice.
The imported templates are user-selected library data; internal workflow
templates keep their original FluidFlow-specific output contracts.

To refresh from a reviewed local checkout, run from the WrongStack root:

```powershell
bun packages/core/scripts/import-fluidflow-prompts.mjs D:\Codebox\PROJECTS\FluidFlow
bun packages/core/scripts/build-prompts.mjs
bun --bun run vitest run packages/core/tests/data/fluidflow-prompts.test.ts packages/core/tests/data/builtin-prompts.test.ts
```

The importer writes the 16 FluidFlow seed categories and provenance; the
dataset builder emits the normal bundled prompt files and index. A refresh is
explicit and does not happen during installation or runtime.
