## Pitfalls

- When changing a store default, grep the entire relevant package test tree for consumers of the changed key, not just files named in the task.
- Treat `packages/webui/tests/components/chimera-settings-panel.test.tsx` toggle assertions as implicit default-pinning tests: `fireEvent.click(getAllByRole('switch')[n])` may break when a seeded store default changes, even if the test does not mention the default constant.
