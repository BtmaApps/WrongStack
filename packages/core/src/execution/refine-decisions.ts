/**
 * Shared decision helpers for the refiner ("enhance") preview and failure
 * panels, following the pure projection pattern proven by
 * packages/simpleui/src/lib/refine-model.ts: panels stay renderers, and the
 * decision → next-step mapping lives here so every surface applies the same
 * semantics and can be unit-tested without a DOM.
 *
 * Zero imports: browser-safe and bundle-safe. The WebUI imports this via the
 * narrow `@wrongstack/core/execution/refine-decisions` subpath; the TUI via
 * the `@wrongstack/core/execution` barrel.
 */

/** The decision a preview panel ("did you mean this?") resolves to. */
export type RefinePreviewDecision =
  | 'refined'
  | 'english'
  | 'original'
  | 'edit'
  | 'cancel'
  | 'retry';

/** The three texts a preview panel offers. */
export interface RefinePreviewTexts {
  original: string;
  refined: string;
  english: string;
}

export type RefineSendPlan =
  | { action: 'send'; text: string }
  | { action: 'edit'; text: string }
  | { action: 'cancel' }
  | { action: 'retry' };

/**
 * Map a preview decision to what happens next: `send` carries the effective
 * text (refined / english / original), `edit` carries the text to load into
 * the composer, `cancel` closes without sending, `retry` asks for another
 * pass over the original.
 */
export function resolvePreviewAction(
  decision: RefinePreviewDecision,
  texts: RefinePreviewTexts,
): RefineSendPlan {
  switch (decision) {
    case 'refined':
      return { action: 'send', text: texts.refined };
    case 'english':
      return { action: 'send', text: texts.english };
    case 'original':
      return { action: 'send', text: texts.original };
    case 'edit':
      return { action: 'edit', text: texts.refined };
    case 'cancel':
      return { action: 'cancel' };
    case 'retry':
      return { action: 'retry' };
  }
}

/** A failure-panel decision ("refinement failed — what now?"). */
export type RefineFailureDecision =
  | { kind: 'original' }
  | { kind: 'edit' }
  | { kind: 'retry' }
  | { kind: 'fallback' }
  | { kind: 'pick'; providerId?: string | undefined; model?: string | undefined };

export type RefineFailureNextStep =
  | { action: 'send-original' }
  | { action: 'edit-original' }
  | { action: 'retry-same' }
  | { action: 'retry-target'; providerId: string; model: string }
  | { action: 'invalid-target'; providerId: string; model: string };

/**
 * Split a `provider/model` ref on the FIRST slash — a model id may itself
 * contain slashes (`openrouter/anthropic/claude-3`). Mirrors core
 * parseModelRef's tolerance: a bare model gets no provider, an empty ref
 * yields nothing.
 */
function parseModelRef(ref: string): {
  provider?: string | undefined;
  model?: string | undefined;
} {
  const slash = ref.indexOf('/');
  if (slash === -1) {
    const model = ref.trim();
    return model ? { model } : {};
  }
  const provider = ref.slice(0, slash).trim() || undefined;
  const model = ref.slice(slash + 1).trim() || undefined;
  return { provider, model };
}

/**
 * Map a failure-panel decision to the next step. `fallbackRef` is the
 * one-key "retry with another model" offer (provider/model); the active
 * provider is the default when a target names no provider. `invalid-target`
 * means the choice is unusable (no model, unparseable ref) — the surface
 * should warn and re-open the panel rather than attempt a call.
 */
export function resolveFailureNextStep(
  decision: RefineFailureDecision,
  fallbackRef: string | undefined,
  activeProviderId: string,
): RefineFailureNextStep {
  switch (decision.kind) {
    case 'original':
      return { action: 'send-original' };
    case 'edit':
      return { action: 'edit-original' };
    case 'retry':
      return { action: 'retry-same' };
    case 'fallback': {
      const ref = parseModelRef(fallbackRef ?? '');
      if (!ref.model) {
        return { action: 'invalid-target', providerId: activeProviderId, model: '' };
      }
      return {
        action: 'retry-target',
        providerId: ref.provider ?? activeProviderId,
        model: ref.model,
      };
    }
    case 'pick': {
      const model = decision.model ?? '';
      if (!model) {
        return {
          action: 'invalid-target',
          providerId: decision.providerId ?? activeProviderId,
          model: '',
        };
      }
      return {
        action: 'retry-target',
        providerId: decision.providerId ?? activeProviderId,
        model,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Refiner reply projection (model.refine_result) — the SimpleUI
// `refine-model` projection pattern, shared so every surface decides
// identically.
// ---------------------------------------------------------------------------

/** Machine-readable refiner failure kinds (mirrors EnhanceFailureKind). */
export type RefineErrorKind = 'timeout' | 'empty' | 'provider_error';

/** The fields of a `model.refine_result` reply a projection consumes. */
export interface RefineResultPayload {
  refined?: string | undefined;
  english?: string | undefined;
  error?: string | undefined;
  errorKind?: string | undefined;
  retryTimeoutMs?: number | undefined;
  fallbackRef?: string | undefined;
}

/** What a surface must do with a refiner reply. */
export type RefineResultAction =
  | { action: 'retry'; timeoutMs: number }
  | {
      action: 'failed';
      error: string;
      errorKind: RefineErrorKind | undefined;
      fallbackRef: string | undefined;
    }
  | { action: 'noop-send' }
  | { action: 'ready'; refined: string; english: string };

/** Whitespace/case-insensitive comparison — a refinement that only reflows
 * the text is not worth a review round-trip. Local copy: this module must
 * stay import-free so the WebUI can bundle it through the narrow subpath. */
function sameRefinedText(a: string, b: string): boolean {
  return (
    a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()
  );
}

/**
 * Reduce a refiner reply to the action a surface should take, given the
 * panel it would apply to. A timeout failure retries ONCE on the server's
 * longer window; a no-op refinement (absent or only reflowed) sends the
 * original; anything else yields the panel state for the surface to render.
 */
export function projectRefineResult(
  payload: RefineResultPayload,
  current: { original: string; retried?: boolean | undefined },
): RefineResultAction {
  const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
  const error = asText(payload.error);
  if (error) {
    const kind =
      payload.errorKind === 'timeout' ||
      payload.errorKind === 'empty' ||
      payload.errorKind === 'provider_error'
        ? payload.errorKind
        : undefined;
    if (
      kind === 'timeout' &&
      !current.retried &&
      typeof payload.retryTimeoutMs === 'number' &&
      payload.retryTimeoutMs > 0
    ) {
      return { action: 'retry', timeoutMs: payload.retryTimeoutMs };
    }
    return {
      action: 'failed',
      error,
      errorKind: kind,
      fallbackRef: asText(payload.fallbackRef) || undefined,
    };
  }
  const refined = asText(payload.refined);
  if (!refined || sameRefinedText(refined, current.original)) {
    return { action: 'noop-send' };
  }
  return { action: 'ready', refined, english: asText(payload.english) || refined };
}
