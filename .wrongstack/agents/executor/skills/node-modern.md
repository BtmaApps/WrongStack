## Generated data

- Never hand-edit the `pluginCatalog` block in `website/src/data/runtime-catalog.ts`; regenerate it with `bun run plugins:manifest:generate`.
- Ensure `packages/plugins/dist` reflects current source before regenerating, because `scripts/generate-plugin-projections.mjs` reads `packages/plugins/dist`.
- Run the generator through `bun run <script-name>`, not bare `node <script>`, when scripts depend on workspace environment setup.

## Hand-maintained data

- Treat `website/src/data/plugin-details-part-*.ts` as hand-maintained. No script writes them; their headers document the sources.
