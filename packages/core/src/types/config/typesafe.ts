/**
 * Shared TypeSafe account settings.
 *
 * Two subsystems now talk to TypeSafe's System One endpoint — the skill
 * suggester (`skills.suggest`) and the agent dispatcher's classifier
 * (`fleet.dispatch`) — with different questions but the same account, the same
 * host and the same egress decision. Keeping the credential and endpoint here
 * rather than duplicated inside each feature means there is one place to put a
 * key, one place to point at a self-hosted deployment, and one thing to deny a
 * repo-committed config.
 *
 * Each feature keeps its OWN `enabled` switch, because sharing a credential is
 * not the same as wanting both behaviours: configuring an account must not
 * silently turn anything on.
 */
export interface TypeSafeConfig {
  /**
   * API key. This is the normal place to put it.
   *
   * The field name is what matters: `isSecretField('apiKey')` is true, so the
   * config walker encrypts it with the profile's `SecretVault` on write
   * (`enc:v1:…` on disk) and decrypts it on load. Renaming this field to
   * something the pattern does not match would silently store it in plaintext.
   * `config-secrets.test.ts` pins that.
   *
   * `TYPESAFE_API_KEY` overrides it and is the right choice for CI or any
   * ephemeral environment where no profile exists.
   */
  apiKey?: string | undefined;
  /**
   * Evaluation endpoint. Default `https://api.typesafe.ai/v1/systemone`.
   * Point this at a self-hosted or proxied deployment to keep prompts inside
   * your own network.
   */
  endpoint?: string | undefined;
  /** Model id. Default `jev-latest`. */
  model?: string | undefined;
  /** Per-HTTP-attempt timeout, in ms. Default 4000. */
  requestTimeoutMs?: number | undefined;
}
