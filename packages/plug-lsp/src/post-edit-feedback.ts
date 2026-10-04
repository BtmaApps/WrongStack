import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { InProcessHook } from '@wrongstack/core/types';
import { formatDiagnostics } from './formatters/diagnostics.js';
import { supportsPullDiagnostics } from './server/capabilities.js';
import {
  createLineTextReader,
  requireServer,
  resolveInputPath,
  type ToolDeps,
} from './tools/shared.js';
import { pathToUri } from './utils/uri.js';

async function stillMatches(file: string, text: string, signal: AbortSignal): Promise<boolean> {
  const expected = Buffer.from(text, 'utf8');
  let offset = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: 65_536, signal })) {
    const bytes = chunk as Buffer;
    if (
      offset + bytes.length > expected.length ||
      !bytes.equals(expected.subarray(offset, offset + bytes.length))
    )
      return false;
    offset += bytes.length;
  }
  return offset === expected.length;
}

/** Same-call feedback; freshness failures never become a clean-file claim. */
export function createPostEditFeedback(
  deps: ToolDeps,
  captureCurrent: (cwd: string) => () => boolean,
): InProcessHook {
  return async (input, runtime) => {
    if (deps.cfg.diagnosticsAfterEdit !== 'background' || input.toolResult?.isError) return;
    const args = input.toolInput as { path?: unknown; file?: unknown } | undefined;
    const target = args?.path ?? args?.file;
    if (typeof target !== 'string') return;
    const current = captureCurrent(input.cwd);
    if (!current()) return;
    const file = resolveInputPath(target, { cwd: input.cwd });
    const fileLabel = JSON.stringify(file.length > 512 ? `${file.slice(0, 512)}…` : file);
    const language = deps.registry.languageIdForPath(file);
    if (!language || !deps.registry.list().some((s) => s.config.languages.includes(language)))
      return;
    const deadline = new AbortController();
    const waitMs = Math.min(deps.cfg.diagnosticsWaitMs, 5000);
    const timer = setTimeout(
      () => deadline.abort(new Error('LSP feedback deadline exceeded')),
      waitMs,
    );
    const signal = AbortSignal.any([runtime.signal, deadline.signal]);
    try {
      const server = await requireServer(deps.registry, file, signal);
      if (!current() || !(await deps.tracker.open(file))) throw new Error('Document unavailable');
      const doc = deps.tracker.get(file);
      if (!doc) throw new Error('Document unavailable');
      const { version, text } = doc;
      const uri = pathToUri(file);
      const diagnostics =
        server.capabilities && supportsPullDiagnostics(server.capabilities)
          ? await server.pullDiagnostics(uri, waitMs, signal)
          : await server.waitForDiagnostics(uri, waitMs, signal, true);
      signal.throwIfAborted();
      if (!current()) return;
      const matches = await stillMatches(file, text, signal);
      signal.throwIfAborted();
      if (
        deps.registry.get(server.name) !== server ||
        server.state !== 'ready' ||
        deps.tracker.get(file)?.version !== version ||
        !matches
      ) {
        throw new Error('Document or server changed during analysis');
      }
      if (!current()) return;
      const hash = createHash('sha256').update(text).digest('hex');
      const output = formatDiagnostics(new Map([[file, diagnostics]]), {
        cwd: input.cwd,
        severityFilter: deps.cfg.severityFilter,
        maxPerFile: deps.cfg.maxDiagnosticsPerFile,
        maxTotal: deps.cfg.maxDiagnosticsTotal,
        lineText: createLineTextReader(deps.tracker),
      });
      const body =
        output.length > 7000 ? `${output.slice(0, 7000)}\n[diagnostics truncated]` : output;
      return {
        additionalContext:
          `[Post-edit LSP feedback] ${fileLabel}; version=${version}; sha256=${hash}; server=${JSON.stringify(server.name.slice(0, 128))}.\n` +
          `Received ${diagnostics.length} diagnostics; displayed severities: ${deps.cfg.severityFilter.join(', ')}.\n` +
          `${body}\nFile-scoped LSP analysis only; diagnostics may predate this edit. Tests/typecheck remain required.`,
        contextAs: 'inline',
      };
    } catch {
      if (!current() || runtime.signal.aborted) return;
      return {
        additionalContext: `[Post-edit LSP feedback] ${fileLabel}: current diagnostics unavailable; file not verified. Use lsp_diagnostics or tests/typecheck before claiming verification.`,
        contextAs: 'inline',
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
