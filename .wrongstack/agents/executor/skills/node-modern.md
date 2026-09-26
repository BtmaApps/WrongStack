## Generated data

- Never hand-edit the `pluginCatalog` block in `website/src/data/runtime-catalog.ts`; regenerate it with `pnpm run plugins:manifest:generate`.
- Ensure `packages/plugins/dist` reflects current source before regenerating, because `scripts/generate-plugin-projections.mjs` reads `packages/plugins/dist`.
- Run the generator through `pnpm run <script-name>`, not `pnpm exec`. `pnpm exec node <script>` does NOT set `npm_execpath`, which that script requires.

## Hand-maintained data

- Treat `website/src/data/plugin-details-part-*.ts` as hand-maintained. No script writes them; their headers document the sources.
