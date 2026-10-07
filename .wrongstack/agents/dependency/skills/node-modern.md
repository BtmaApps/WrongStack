## Conventions

- Every `exports` subpath added to a `packages/*/package.json` needs a matching entry in `scripts/build-package.mjs` in the same task: subpaths of `packages/core/package.json` go in `coreEntries`, tool-package subpaths go in `toolEntries`. Add the entry together with the `exports` change; never defer it to a follow-up. `[applied 6×, 6 ok]`
- After wiring the entry, run the build and confirm the emitted file for the new subpath actually exists under `dist/` before calling the task done.

## Pitfalls

- The build emits only the paths listed in `coreEntries`/`toolEntries`. An unwired `exports` subpath passes the build and CI, then fails at import time with `ERR_PACKAGE_PATH_NOT_EXPORTED` — a green build is not verification for `exports` changes.
- A subpath resolving to a `dist/` file that does not exist is the signature of a missing `scripts/build-package.mjs` entry; diagnose it there, not in the consuming code.
