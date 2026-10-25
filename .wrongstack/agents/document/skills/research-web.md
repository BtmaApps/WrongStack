## Path verification

- Before editing `docs/slash/**` or `docs/cli/**`, sweep every quoted `packages/...` path against the working tree; do not assume documented paths exist. After the Bun package extraction, treat `core/src/types` → `contracts/src/types`, `core/src/plugins` → `builtin-plugins/src`, `core/src/hq` → `hq/src`, and `core/src/sdd` → `sdd/src` as stale unless existence and owning-code checks confirm otherwise.

## Runtime-only references

- Rewrite pnpm/npm text only when it is presented as a command to run. Preserve `/init`’s pnpm/yarn rows defined by `packages/cli/src/services/project-facts.ts`, the `pnpm deploy` exemption in `yolo.md` defined by `packages/core/src/security/yolo-vcs-risk.ts`, and ACP `npx -y` entries defined by `packages/acp/src/registry/agents.catalog.ts`; these describe runtime behavior, not runnable commands.
