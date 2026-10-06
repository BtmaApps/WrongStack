# `wstack config-export` / `config-import` — Portable settings

Export behavior settings to `wstack-config.json` in the current directory,
then import them into the active profile on another installation or profile.
Both commands use that exact filename; they do not take a destination argument.

```bash
wstack config-export
# Transfer wstack-config.json to the destination working directory.
wstack config-import
```

The envelope contains `kind: "wstack-config"`, version, export timestamp,
source profile label and a `settings` object. The label records provenance;
import targets the currently active destination profile.

Included behavior sections are defined by `BEHAVIOR_SECTION_KEYS`, including
context, tools, features, session, model runtime, SAGE, skills, system prompt,
autonomy, concurrency and YOLO. Import can therefore change approval and runtime
behavior as well as appearance. Provider credentials, saved provider identities,
fallback/model routing, MCP/plugin configuration and profile identity are
outside the portable section set.

Import merges recognized sections over the persisted profile while holding its
file lock, makes a backup, atomically writes with `0600` mode, and records
best-effort history. Object sections use a shallow merge: a supplied nested
object replaces that nested value rather than recursively merging its fields.
Unknown sections are ignored. Export overwrites an existing working-directory
file; import refuses unreadable JSON, a wrong `kind`, or a missing settings object.

Restart hosts whose services were configured at startup. Use `/profile copy`
when you need a full local profile copy instead of a portable behavior export.

Sources: [`config-transfer.ts`](../../packages/cli/src/subcommands/handlers/config-transfer.ts),
[`section list`](../../packages/cli/src/settings-behavior-sections.ts).
See [profiles](../slash/profile.md), [config history](sessions-config.md) and
[configuration](../configuration.md).
