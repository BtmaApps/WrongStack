## Dependency audits

- Before flagging the `radix-ui` umbrella as dead weight, prove usage first: grep `packages/vibeui` for `from 'radix-ui'` (e.g. `import { Tabs } from 'radix-ui'`) and count the primitives actually imported. The umbrella's large `@radix-ui/*` dependency count — 57 per `packages/vibeui/node_modules/radix-ui/package.json` — is expected, not bloat; siblings import individual `@radix-ui/react-*` packages instead. `[applied 3×, 3 ok]`

## Conventions

- Every `exports` subpath added to a `packages/*/package.json` needs a matching entry in `scripts/build-package.mjs` in the same task: `coreEntries` for `packages/core/package.json` subpaths, `toolEntries` for tool-package subpaths. Add the entry together with the `exports` change; never defer it to a follow-up. `[applied 6×, 6 ok]`
- After wiring the entry, run the build and confirm the emitted file for the new subpath actually exists under `dist/` before calling the task done. A green build is not verification for `exports` changes: the build emits only the paths listed in `coreEntries`/`toolEntries`.

## Pitfalls

- `ERR_PACKAGE_PATH_NOT_EXPORTED` at import time after a green build and CI, or a subpath resolving to a nonexistent `dist/` file — both signatures of a missing `scripts/build-package.mjs` entry. Diagnose and fix there, not in the consuming code.
