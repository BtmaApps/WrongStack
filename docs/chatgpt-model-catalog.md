# ChatGPT model catalog maintenance

## Scope and verification plan

- Add the requested `gpt-6.1-sol` identifier to the existing refreshable CLI overlay for `openai-codex` and `openai-chatgpt`; do not invent limits, prices, or release dates.
- Preserve provider-specific curated entries when account discovery replaces a model snapshot, and expose those entries alongside saved account IDs in the shared picker resolver.
- Keep generic OpenAI sibling models and unrelated account providers out of this exception.
- Ensure Codex startup discovery uses its canonical endpoint when a saved configuration omits `baseUrl` or `family`.
- Verify with red/green overlay-to-registry-to-picker tests, discovery tests, neighbouring model suites, scoped typechecks, and diff review.

Risk: curated catalog suggestions are not proof of account entitlement. A listed model can still be rejected by the upstream account API. No authentication or transport behavior is changed.

## Why the model was missing

The Codex overlay had an empty `models` object; the ChatGPT plan provider had no overlay entry. The legacy core Codex list is deliberately empty. Account discovery replaces registry membership with its live/cache snapshot, while the shared WebUI resolver previously returned only saved account IDs. Consequently a stale snapshot hid newly released models, and adding an overlay entry alone could not fix the picker.

## Sources and precedence

`packages/cli/data/providers.json` is the curated model overlay, not a full mirror of models.dev. CLI and WebUI server load it through `DefaultModelsRegistry`, using the repository-hosted overlay, disk cache, and bundled file as fallback sources. `packages/webui/public/providers.json` is a provider presentation list, not this model overlay.

Authenticated discovery remains the source of automatically discovered rollout IDs, with no hardcoded allowlist. For the two canonical ChatGPT providers, entries explicitly supplied by the WrongStack overlay also remain catalog suggestions through live, cached, empty, or failed account discovery. Generic models.dev entries and sibling OpenAI models cannot expand account membership through this exception. Other account providers keep exact snapshot membership.

Maintain new curated models in `packages/cli/data/providers.json` for each applicable provider. Use `node scripts/sync-models.mjs --validate` to check the overlay and `--diff` / `--extract` to inspect public upstream metadata. These commands do not regenerate the overlay or establish account entitlement. Do not copy API-key pricing or context limits to subscription models without evidence.

The `gpt-6.1-sol` entry records the requested identifier and display name only. Its actual availability, limits, and pricing must come from the selected account/backend; no authenticated live invocation was used to establish them here.
