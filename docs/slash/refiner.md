# `/refiner` — Goal-refinement model

View or change the dedicated provider/model used to refine goals before execution.

| Command | Effect |
|---|---|
| `/refiner` or `/refiner show` | Show the effective refiner provider and model. |
| `/refiner set provider <id>` | Persist the refiner provider. |
| `/refiner set model <id>` | Persist the refiner model. |
| `/refiner set fallback-profile <name>` | Persist a named refiner fallback chain. |
| `/refiner clear` | Clear provider, model and fallback profile. |
| `/refiner help` | Show built-in command help. |

Prompt and goal refinement share the same target ordering: parseable entries
from `autonomy.refinerFallbackProfile`, then the explicit provider/model target.
Omitted provider or model fields use the current session value. Goal refinement
can skip providers that cannot be built; prompt refinement uses the first
candidate and exposes its recovery flow if the request fails. Configured models
do not have to appear in `favoriteModels`.

These settings share the active-profile persistence path with
`/settings refiner-provider`, `refiner-model` and `refiner-fallback-profile`.
Use [`/enhance`](enhance.md) to enable or disable prompt refinement; `/refiner`
selects its target rather than a refinement intensity.

## Code reference

- `packages/cli/src/slash-commands/refiner.ts`
- `packages/cli/src/settings-menu.ts` — `persistAutonomySetting()`
