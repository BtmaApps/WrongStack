## Regression Assertions

- Confirm regression tests assert the actual contract rather than relying on pass counts. In `packages/webui/tests/components/quick-model-switcher.test.tsx`, verify event-emission assertions involving `providers.saved` and `ConfigStore`; these assertions prove cache invalidation behavior.
