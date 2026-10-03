import type {
  Capabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  ProviderError,
  ReasoningEffort,
  Request,
  StreamEvent,
} from '@wrongstack/core/types';
import { type HeadersLike, parseProviderHttpError } from './error-parse.js';
import { capabilitiesForFamily } from './family-capabilities.js';
import { openAIImagesBody, openAIImagesUrl, parseOpenAIImages } from './image-generation.js';
import { type BuildBodyContext, resolveMaxOutputTokens } from './model-output-limits.js';
import { parseOpenAIResponsesStream } from './openai-codex.js';
import { applyPromptCacheKey } from './prompt-cache-key.js';
import { messagesToResponsesInput, toolsToResponses } from './tool-format/to-responses.js';
import { WireAdapter, type WireAdapterStreamOptions } from './wire-adapter.js';

export interface OpenAIResponsesProviderOptions {
  id: string;
  apiKey: string;
  baseUrl: string;
  headers?: Record<string, string> | undefined;
  fetchImpl?: typeof fetch | undefined;
  capabilities?: Partial<Capabilities> | undefined;
  streamOpts?: WireAdapterStreamOptions | undefined;
  /** Explicit state retention policy for public subscription Responses requests. */
  store?: boolean | undefined;
  /** Retain encrypted reasoning for stateless ChatGPT plan requests. */
  replayReasoning?: boolean | undefined;
  /** Apply the public ChatGPT plan route's supported fields and tool namespace contract. */
  chatGPTPlan?: boolean | undefined;
}

/**
 * API-key authenticated OpenAI Responses transport for compatible gateways.
 * Unlike OpenAICodexProvider, this uses a normal Bearer key and a conventional
 * `/v1/responses` endpoint; it has no ChatGPT OAuth headers or token refresh.
 */
export class OpenAIResponsesProvider extends WireAdapter {
  override readonly id: string;
  override readonly capabilities: Capabilities;

  private readonly extraHeaders?: Record<string, string> | undefined;
  private readonly responseOptions: Pick<
    OpenAIResponsesProviderOptions,
    'store' | 'replayReasoning' | 'chatGPTPlan'
  >;

  constructor(opts: OpenAIResponsesProviderOptions) {
    super(opts.apiKey, opts.baseUrl, opts.fetchImpl, opts.streamOpts);
    this.id = opts.id;
    this.extraHeaders = opts.headers;
    this.responseOptions = opts;
    this.capabilities = capabilitiesForFamily('openai', opts.capabilities);
  }

  /** Text-to-image through the images API beside the Responses endpoint. */
  async generateImage(
    req: ImageGenerationRequest,
    opts: { signal: AbortSignal },
  ): Promise<ImageGenerationResult> {
    const headers = this.buildHeaders({ model: req.model, messages: [] });
    const json = await this.postJson(
      openAIImagesUrl(this.baseUrl),
      openAIImagesBody(req),
      headers,
      opts.signal,
    );
    return parseOpenAIImages(json);
  }

  protected override buildUrl(_req: Request): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    if (base.endsWith('/responses')) return base;
    if (/\/v\d+$/i.test(base)) return `${base}/responses`;
    return `${base}/v1/responses`;
  }

  protected override buildHeaders(req: Request): Record<string, string> {
    // Forward caller-supplied headers (proxy auth, tenant ids, routing keys),
    // strip any caller keys whose lowercase form matches a protected OpenAI
    // Responses header (`authorization`, `content-type`, `accept`) — HTTP
    // header names are case-insensitive, so a literal spread order would let
    // caller `Authorization` / `Content-Type` / `Accept` override the
    // provider's. Then write the provider-controlled headers last so the
    // provider's own `authorization: Bearer ${apiKey}` wins over any caller
    // override.
    const PROTECTED = new Set(['authorization', 'content-type', 'accept']);
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.extraHeaders ?? {})) {
      if (!PROTECTED.has(key.toLowerCase())) filtered[key] = value;
    }
    return {
      ...filtered,
      ...super.buildHeaders(req),
      authorization: `Bearer ${this.apiKey}`,
    };
  }

  protected override buildBody(req: Request, ctx: BuildBodyContext): Record<string, unknown> {
    const instructions =
      req.system && req.system.length > 0
        ? req.system.map((block) => block.text).join('\n\n')
        : undefined;
    const body: Record<string, unknown> = {
      model: req.model,
      stream: true,
      input: messagesToResponsesInput(req.messages, {
        includeReasoning: this.responseOptions.replayReasoning,
      }),
    };
    if (this.responseOptions.store !== undefined) body['store'] = this.responseOptions.store;
    if (this.responseOptions.replayReasoning) body['include'] = ['reasoning.encrypted_content'];
    if (instructions) body['instructions'] = instructions;
    if (req.tools && req.tools.length > 0) {
      body['tools'] = toolsToResponses(req.tools);
      body['tool_choice'] = mapToolChoice(req.toolChoice);
      body['parallel_tool_calls'] = true;
    }
    const maxOutput = resolveMaxOutputTokens(req, ctx);
    if (maxOutput !== undefined) {
      body['max_output_tokens'] = maxOutput;
    }
    if (req.temperature !== undefined) body['temperature'] = req.temperature;
    if (req.topP !== undefined) body['top_p'] = req.topP;
    const effort = supportedResponsesEffort(req.reasoning?.effort);
    if (req.reasoning?.enabled !== false && effort) {
      body['reasoning'] = { effort, summary: 'auto' };
    }
    applyPromptCacheKey(body, req, ctx.capabilities);
    if (this.responseOptions.chatGPTPlan) {
      // https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
      // The plan route does not accept sampling or output-cap parameters.
      delete body['max_output_tokens'];
      delete body['temperature'];
      delete body['top_p'];
      if (Array.isArray(body['tools'])) {
        body['tools'] = [
          {
            type: 'namespace',
            name: 'wrongstack',
            description: 'WrongStack tools executed by the local agent.',
            tools: body['tools'],
          },
        ];
      }
      const choice = body['tool_choice'];
      if (choice && typeof choice === 'object')
        body['tool_choice'] = { ...choice, namespace: 'wrongstack' };
      for (const item of body['input'] as Record<string, unknown>[]) {
        if (item['type'] === 'function_call') item['namespace'] = 'wrongstack';
      }
    }
    return body;
  }

  protected override parseStream(
    body: ReadableStream<Uint8Array> | NodeJS.ReadableStream | null,
    fallbackModel: string,
  ): AsyncIterable<StreamEvent> {
    return parseOpenAIResponsesStream(body, fallbackModel, this.id, undefined, undefined, {
      requireTerminalEnvelope: this.responseOptions.chatGPTPlan === true,
    });
  }

  protected override translateError(
    status: number,
    text: string,
    headers?: HeadersLike,
  ): ProviderError {
    return parseProviderHttpError(this.id, status, text, headers);
  }
}

function supportedResponsesEffort(
  effort: ReasoningEffort | undefined,
): ReasoningEffort | undefined {
  if (effort === undefined) return undefined;
  // The Responses API's documented effort set is model-dependent and spans
  // the full ReasoningEffort union (none|minimal|low|medium|high|xhigh|max per
  // the 2026-08 reasoning guide). Accept every canonical value verbatim: the
  // model rejects an unsupported one with an actionable 400, whereas silently
  // dropping it here (the old behavior for minimal/max) made the user's
  // setting a quiet no-op.
  return effort;
}

function mapToolChoice(
  choice: Request['toolChoice'],
): 'auto' | 'required' | 'none' | { type: 'function'; name: string } {
  if (choice === undefined) return 'auto';
  if (choice === 'auto' || choice === 'required' || choice === 'none') return choice;
  return { type: 'function', name: choice.name };
}
