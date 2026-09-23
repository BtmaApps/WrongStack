## Anthropic provider boundary

- Treat `packages/providers/src/presets/anthropic.ts` as the shared declarative wire format for the Anthropic family in `packages/providers`, not as a standalone provider. Both `AnthropicProvider` (`src/anthropic.ts`) and `AnthropicOAuthProvider` (`src/anthropic-oauth.ts`) call `super(anthropicWireFormat, ...)`.
- Keep authentication differences out of the preset. Handle proxy `Authorization: Bearer` versus `x-api-key` behavior in `AnthropicProvider.buildHeaders`, using `isAnthropicHost`.
