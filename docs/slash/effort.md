# `/effort` — Reasoning effort

Inspect or set reasoning effort for the active leader model's next request.
This edits `modelRuntime.reasoning.effort` in the active profile and updates
the live config; it is not a per-worker model-matrix setting.

| Command | Effect |
|---|---|
| `/effort` | Current setting and the active model's supported vocabulary |
| `/effort <level>` | Set a canonical effort level supported by that model |
| `/effort auto` | Remove the explicit pin; use the inherited/provider default |
| `/effort clear` | Remove the explicit setting |
| `/effort matrix` | Read the role/phase effort overrides |
| `/effort help` | Full syntax and canonical level list |

Start with `/effort` and select one of the advertised levels. For example, when
`high` is listed, `/effort high` applies it to the next request. `auto` is a UI
selection, not a literal effort value sent to the provider.

When the model explicitly has no effort control, setting a level is refused.
When supported levels are enumerated, an unlisted level is refused. Unknown
capabilities allow canonical values, but the request resolver can omit an
unsupported value; acceptance by the command does not prove wire support.

To pin a worker role instead, use
`/setmodel reasoning-effort <role|phase|*> <level>`. Existing per-role settings
are shown by `/effort matrix`; clearing the leader pin does not remove them.

Source: [`effort.ts`](../../packages/cli/src/slash-commands/effort.ts).
See [model routing](setmodel.md), [tiers](tier.md) and
[configuration](../configuration.md).
