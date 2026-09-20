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
   * The selected route's environment variable is used only when this field
   * is absent. A configured profile key takes precedence.
   */
  apiKey?: string | undefined;
  /**
   * Which host answers System One requests.
   *
   * - `typesafe`   — `api.typesafe.ai`, model `jev-latest`, key `TYPESAFE_API_KEY`
   * - `openrouter` — OpenRouter's Decisions endpoint, model `~typesafe/jev-latest`,
   *   key `OPENROUTER_API_KEY`. Same request body; billed to OpenRouter.
   * - `custom`     — whatever `endpoint` names. Implied when `endpoint` is set.
   *
   * Left unset, the route is inferred: an explicit `endpoint` means `custom`,
   * otherwise the native route is used. OpenRouter always requires an
   * explicit route; its chat credential alone cannot reroute or re-bill
   * this account.
   */
  route?: 'typesafe' | 'openrouter' | 'custom' | undefined;
  /**
   * Evaluation endpoint. Overrides the route's built-in URL, and selects the
   * `custom` route when `route` is unset. Point this at a self-hosted or
   * proxied deployment to keep prompts inside your own network.
   */
  endpoint?: string | undefined;
  /** Model id. Defaults to the route's own name for Jev. */
  model?: string | undefined;
  /** Per-HTTP-attempt timeout, in ms. Default 4000. */
  requestTimeoutMs?: number | undefined;
  /**
   * Consecutive 401/403 responses that disable this TypeSafe client instance.
   * Default 3. Rate limits and network errors never count toward this — only
   * a credential the host has actually rejected.
   */
  authFailureLimit?: number | undefined;
  /**
   * Per-feature switches for the System One judgments that sit in front of
   * (never instead of) an existing path. Each one runs ONLY while this account
   * resolves `ready` and the host is not resting; otherwise the feature takes
   * the path it always had. Unset means ON when an account is configured —
   * a TypeSafe key exists for nothing else — and `false` turns one off.
   */
  judgments?: TypeSafeJudgmentsConfig | undefined;
}

/** See {@link TypeSafeConfig.judgments}. `false` disables; unset = on with an account. */
export interface TypeSafeJudgmentsConfig {
  /** Agent-callable structured decision tool. Unset = on with an account. */
  tool?: boolean | undefined;
  /** Brain decisions: a Choice over the options before the LLM tier. */
  brain?: boolean | undefined;
  /** `/memory triage` phase 3 value rating and merge decisions. */
  memoryTriage?: boolean | undefined;
  /** Topic-shift advice on a new prompt (new vs same context). */
  topicShift?: boolean | undefined;
  /** SAGE recall: drop recalled memories that do not help the current turn. */
  memoryRecall?: boolean | undefined;
  /** Compaction selector: which history ranges the current goal still needs. */
  compaction?: boolean | undefined;
  /** Kanban completion check: does the evidence support "done"? */
  kanbanVerify?: boolean | undefined;
  /** Subagent model tier: task difficulty/risk before picking a lane. */
  modelTier?: boolean | undefined;
  /** Semantic lint: judge grep-found candidates against project conventions. */
  semanticLint?: boolean | undefined;
}
