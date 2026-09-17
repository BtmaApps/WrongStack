import { type Tool, ToolValidationError } from '@wrongstack/core/types';
import { guardedFetch } from './_fetch-guard.js';
import { getTurndown } from './_turndown.js';

export interface ReadUrlContentInput {
  /** Target web page URL to read. */
  url?: string | undefined;
  /** Antigravity parameter alias. */
  Url?: string | undefined;
  /** Maximum bytes to retrieve and return (default: 131,072 bytes). */
  maxBytes?: number | undefined;
}

export interface ReadUrlContentOutput {
  url: string;
  status: number;
  content_type: string;
  content: string;
}

const DEFAULT_MAX_BYTES = 131_072;

/**
 * Hard ceiling on `maxBytes` (WS-2026-09-17-02).
 *
 * `maxBytes` is model-supplied and its schema declared `minimum` but no
 * `maximum`; the shared validator enforces numeric bounds only where they are
 * declared, so any magnitude passed. It then set the read limit below
 * (`maxBytes * 4`), which is the only bound on the `chunks[]` buffer — so the
 * very allocation `readBounded` was introduced to cap became attacker-chosen.
 * The tool's own 25s timeout bounded it in practice; this bounds it on purpose.
 *
 * 1 MiB is 8x the default and far above anything a model can usefully consume
 * in one tool result (`maxOutputBytes` is DEFAULT_MAX_BYTES), so the clamp is
 * invisible to legitimate use.
 */
export const MAX_READ_URL_BYTES = 1_048_576;

/**
 * Read at most `limit` bytes of the body, then cancel the stream. `res.text()`
 * buffered the entire response before the maxBytes cut, so a multi-GB body
 * was held in memory for a 128KB answer (audit 2026-09-15). Responses without
 * a readable stream (test doubles) fall back to `text()`.
 */
async function readBounded(
  res: Response,
  limit: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { text: await res.text(), truncated: false };
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      if (received > limit) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks).subarray(0, limit).toString('utf8'), truncated };
}
const TIMEOUT_MS = 25_000;

export const readUrlContentTool: Tool<ReadUrlContentInput, ReadUrlContentOutput> = {
  name: 'read_url_content',
  category: 'Network',
  icon: 'web',
  permission: 'auto',
  mutating: false,
  capabilities: ['net.outbound'],
  subjectKey: 'url',
  timeoutMs: TIMEOUT_MS,
  maxOutputBytes: DEFAULT_MAX_BYTES,
  description:
    'Fetch content from a URL via HTTP request (invisible to USER). Use when: ' +
    '(1) extracting text from public pages, (2) reading static content/documentation, ' +
    '(3) batch processing multiple URLs, (4) speed is important, or (5) no visual interaction needed. ' +
    'Converts HTML to clean markdown. No JavaScript execution, no authentication.',
  usageHint:
    'Provide `url` (e.g. "https://example.com/docs"). Converts HTML to readable markdown, stripping ' +
    'scripts, styles, navigation bars, headers, and footers to conserve token budget. ' +
    'For pages requiring interactive login, JavaScript rendering, or visual inspection, use browser tools instead.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to read content from.',
      },
      Url: {
        type: 'string',
        description: 'Case-tolerant alias for URL.',
      },
      maxBytes: {
        type: 'number',
        minimum: 1,
        maximum: MAX_READ_URL_BYTES,
        description: 'Maximum bytes to retrieve (default: 128KB, max 1MB).',
      },
    },
    additionalProperties: false,
  },
  async execute(input, ctx, opts) {
    const rawUrl = (input.url ?? input.Url)?.trim();
    if (!rawUrl) {
      throw new Error('read_url_content requires a valid `url` parameter.');
    }

    // Clamped here as well as bounded by the schema: the schema stops a model
    // call at the executor, but this tool is also called directly (other hosts,
    // tests), and that path never sees the validator. A non-finite value falls
    // back to the default rather than poisoning the arithmetic below.
    const requestedMaxBytes =
      typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)
        ? Math.trunc(input.maxBytes)
        : DEFAULT_MAX_BYTES;
    const maxBytes = Math.min(Math.max(1, requestedMaxBytes), MAX_READ_URL_BYTES);
    const signal = opts?.signal ?? ctx?.signal ?? new AbortController().signal;

    const res = await guardedFetch(rawUrl, 5, signal, {
      'user-agent': 'Mozilla/5.0 (compatible; WrongStackReader/1.0; +https://wrongstack.dev)',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.5,*/*;q=0.1',
    });

    const contentType = res.headers.get('content-type') ?? 'text/plain';
    if (/^image\/|^audio\/|^video\/|application\/octet-stream/.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new ToolValidationError({
        message: `read_url_content: refusing to read binary content-type "${contentType}"`,
        field: 'url',
      });
    }
    const { text: rawBody, truncated: readTruncated } = await readBounded(
      res,
      Math.max(maxBytes, DEFAULT_MAX_BYTES) * 4,
    );

    let content: string;
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      content = (await getTurndown()).turndown(rawBody).trim();
    } else if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(rawBody);
        content = JSON.stringify(parsed, null, 2);
      } catch {
        content = rawBody;
      }
    } else {
      content = rawBody;
    }

    if (Buffer.byteLength(content, 'utf8') > maxBytes) {
      const buf = Buffer.from(content, 'utf8');
      content = `${buf.subarray(0, maxBytes).toString('utf8')}\n\n[Content truncated at ${maxBytes} bytes]`;
    } else if (readTruncated) {
      content = `${content}

[Content truncated: response body exceeded the read limit]`;
    }

    return {
      url: res.url || rawUrl,
      status: res.status,
      content_type: contentType,
      content,
    };
  },
};
