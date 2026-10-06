# `/tier` — Model tiers and budgets

Define named tiers backed by fallback profiles, then route worker roles or
phases to them. Tier names are user-defined; declaration order runs from
cheapest to most expensive. The command persists `modelTiers` in the active
profile and updates live config.

| Command | Effect |
|---|---|
| `/tier` | Show levels, routing, default and leader policy |
| `/tier on`, `/tier off` | Enable or disable tier routing |
| `/tier set <tier> <profile>` | Bind a level to an existing fallback profile |
| `/tier budget <tier> <USD> [iterations] [toolCalls]` | Set non-negative budget limits |
| `/tier remove <tier>` | Remove a level and its routing/default/ceiling references |
| `/tier route <role\|phase\|*> <tier>` | Add a routing rule |
| `/tier unroute <role\|phase\|*>` | Remove a routing rule |
| `/tier default <tier>` | Choose an existing default level |
| `/tier leader off\|propose\|auto` | Set the leader's authority to change its own tier |
| `/tier leader dwell <turns>` | Minimum turn count between switches |
| `/tier leader ceiling <tier\|none>` | Maximum level the leader can choose alone |

Use `/fallback` to inspect or define profiles first. For an existing profile
named `coding`, a minimal setup is:

```text
/tier set standard coding
/tier default standard
/tier route build standard
/tier budget standard 1.50 40 100
/tier on
```

Unknown profile/level names and invalid numbers are refused. Budget limits
govern worker execution; they are not prepaid credit or a provider billing cap.
Deleting a level removes rules that referenced it rather than leaving dangling
routes. Leader `off` still permits tiers to route workers. `auto` permits leader
switches subject to the runtime's dwell, context, ceiling and break-even guards.

Source: [`tier.ts`](../../packages/cli/src/slash-commands/tier.ts).
See [fallback profiles](fallback.md), [model routing](setmodel.md) and
[reasoning effort](effort.md).
