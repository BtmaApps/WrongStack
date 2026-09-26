## Vitest Hangs After Tests Pass

- Compare the affected file with sibling single-file Vitest runs; if siblings exit normally, focus on the affected file’s static import graph rather than Vitest config or harness-wide teardown.
- Trace handles that can outlive per-test `dispose()`, prioritizing module-level connection caches and fire-and-forget async connects.
- Check connect/`dispose()` races where synchronous `dispose()` sets the disposed flag before an in-flight connect succeeds; ensure the late success path closes or avoids caching the socket instead of returning early and leaking it.
