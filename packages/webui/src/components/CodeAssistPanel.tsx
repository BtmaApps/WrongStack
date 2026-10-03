/**
 * Code Assist — the shared "Ask AI" panel mounted on BOTH the File Manager and
 * the Code Atlas.
 *
 * One component, two mount points, deliberately: the run contract, the preset
 * set, the streaming behaviour and the read-only/mutating distinction must not
 * be able to drift between the two screens. Each mount supplies its own
 * `target` (the file the user is looking at, and in Code Atlas the selected
 * symbol) and the panel does the rest.
 *
 * Streaming + lifecycle rules this component owns:
 *  - Deltas are matched on `requestId`, never on "the latest run", so two
 *    panels on one socket (File Manager and Code Atlas can both be mounted)
 *    can never cross-contaminate each other's output.
 *  - Every listener is torn down on unmount AND on a superseded run. A panel
 *    that unmounts mid-run aborts the run rather than leaving an agent burning
 *    tokens against a socket nobody is reading.
 */
import { AlertTriangle, Loader2, Send, Sparkles, Square, X } from 'lucide-react';
import type { CodeAssistPreset, CodeAssistResult } from '@wrongstack/webui-protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWSClient } from '@/lib/ws-client';
import { cn } from '@/lib/utils';

/** What the host screen knows about what the user is currently looking at. */
export interface CodeAssistTarget {
  filePath: string;
  symbol?: string | undefined;
  line?: number | undefined;
}

interface CodeAssistPanelProps {
  target: CodeAssistTarget | null;
  /** Extra classes for the host's layout (a Code Atlas aside vs a file drawer). */
  className?: string | undefined;
}

/**
 * Preset order is deliberate: the two general reads first, the focused
 * diagnoses next, tests, then the single mutating action last so it is never
 * one stray click away from `overview`.
 */
const PRESETS: ReadonlyArray<{ id: CodeAssistPreset; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'What this code is and how it fits' },
  { id: 'explain', label: 'Explain', hint: 'Walk through the focused symbol' },
  { id: 'quality', label: 'Quality', hint: 'Readability, duplication, conventions' },
  { id: 'bugs', label: 'Bugs', hint: 'Hunt real defects, traced to call sites' },
  { id: 'security', label: 'Security', hint: 'Injection, traversal, secrets' },
  { id: 'tests', label: 'Tests', hint: 'What is covered and what is missing' },
  { id: 'impact', label: 'Impact', hint: 'Blast radius of changing this' },
  { id: 'fix', label: 'Fix', hint: 'Implement the best improvement (edits files)' },
];

type RunPhase = 'idle' | 'running' | 'done' | 'error' | 'aborted';

interface RunState {
  requestId: string;
  preset: CodeAssistPreset;
  phase: RunPhase;
  text: string;
  error?: string | undefined;
  appliedEdits?: boolean | undefined;
}

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `code-assist-${Date.now()}-${requestCounter}`;
}

/**
 * Watchdog. A host that predates the Code Assist family swallows
 * `code.assist.run` (see the inert fallback in `embedded-message-router.ts`),
 * so NO terminal frame ever arrives. Without this the spinner would run
 * forever with no way out. Generous, because a legitimate deep analysis with
 * the full tool set can legitimately take many minutes.
 */
const RUN_TIMEOUT_MS = 10 * 60_000;

export function CodeAssistPanel({ target, className }: CodeAssistPanelProps): React.ReactElement {
  const [run, setRun] = useState<RunState | null>(null);
  const [question, setQuestion] = useState('');
  const [showInput, setShowInput] = useState(false);
  // Mirrors `run` for the WS callbacks, which are registered once but must
  // never close over a stale run.
  const runRef = useRef<RunState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // Pin to the bottom as tokens stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run?.text]);

  // Watchdog: a host that never answers must not leave the panel spinning.
  useEffect(() => {
    if (run?.phase !== 'running') return;
    const timer = setTimeout(() => {
      setRun((prev) =>
        prev && prev.requestId === run.requestId && prev.phase === 'running'
          ? {
              ...prev,
              phase: 'error',
              error: 'The server did not answer this analysis. It may not support Code Assist.',
            }
          : prev,
      );
    }, RUN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [run?.phase, run?.requestId]);

  // Stop the run if the panel goes away mid-flight.
  const requestIdRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (requestIdRef.current) {
        getWSClient().send({ type: 'code.assist.abort', payload: { requestId: requestIdRef.current } });
        requestIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const client = getWSClient();
    const offStarted = client.on('code.assist.started', (msg) => {
      if (runRef.current?.requestId !== msg.payload.requestId) return;
      setRun((prev) => (prev ? { ...prev, phase: 'running' } : prev));
    });
    const offDelta = client.on('code.assist.delta', (msg) => {
      if (runRef.current?.requestId !== msg.payload.requestId) return;
      setRun((prev) => (prev ? { ...prev, text: prev.text + msg.payload.text } : prev));
    });
    const offResult = client.on('code.assist.result', (msg) => {
      const payload: CodeAssistResult = msg.payload;
      if (runRef.current?.requestId !== payload.requestId) return;
      requestIdRef.current = null;
      setRun((prev) =>
        prev
          ? {
              ...prev,
              phase: payload.status,
              // The streamed text is the same text; only fall back to the
              // terminal copy when streaming produced nothing (a fast run, or
              // a host that buffers instead of streaming).
              text: payload.status === 'done' && payload.text ? payload.text : prev.text,
              error: payload.error,
              appliedEdits: payload.appliedEdits,
            }
          : prev,
      );
    });
    return () => {
      offStarted();
      offDelta();
      offResult();
    };
  }, []);

  const start = useCallback(
    (preset: CodeAssistPreset, customQuestion?: string) => {
      if (!target?.filePath) return;
      // One run per panel: starting a second aborts the first rather than
      // interleaving two transcripts into one box.
      if (requestIdRef.current) {
        getWSClient().send({ type: 'code.assist.abort', payload: { requestId: requestIdRef.current } });
      }
      const requestId = nextRequestId();
      requestIdRef.current = requestId;
      setRun({ requestId, preset, phase: 'running', text: '' });
      getWSClient().send({
        type: 'code.assist.run',
        payload: {
          requestId,
          filePath: target.filePath,
          preset,
          ...(target.symbol ? { symbol: target.symbol } : {}),
          ...(target.line !== undefined ? { line: target.line } : {}),
          ...(customQuestion ? { question: customQuestion } : {}),
        },
      });
    },
    [target],
  );

  const stop = useCallback(() => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    getWSClient().send({ type: 'code.assist.abort', payload: { requestId } });
    requestIdRef.current = null;
    // Settle locally rather than waiting for the terminal frame: a host that
    // never answers would otherwise leave the Stop button spinning forever.
    setRun((prev) => (prev && prev.requestId === requestId ? { ...prev, phase: 'aborted' } : prev));
  }, []);

  const ask = useCallback(() => {
    const text = question.trim();
    if (!text) return;
    setQuestion('');
    start('custom', text);
  }, [question, start]);

  const busy = run?.phase === 'running';
  const focusLabel = useMemo(() => {
    if (!target) return null;
    if (target.symbol) return `${target.symbol} · ${target.filePath}`;
    return target.filePath;
  }, [target]);

  return (
    <section
      className={cn('flex min-h-0 flex-col border-t bg-card/80', className)}
      aria-label="Ask AI"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em]">Ask AI</h2>
        </div>
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            aria-label="Stop analysis"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          run && (
            <button
              type="button"
              onClick={() => setRun(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear analysis"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      {!target ? (
        <p className="px-3 py-3 text-[11px] text-muted-foreground">
          Open a file to run an analysis on it.
        </p>
      ) : (
        <>
          <p className="truncate border-b px-3 py-1.5 text-[10px] text-muted-foreground">
            {focusLabel}
          </p>

          <div className="flex flex-wrap gap-1 border-b p-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                title={preset.hint}
                onClick={() => start(preset.id)}
                className={cn(
                  'border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors',
                  'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
                  run?.preset === preset.id && run.phase !== 'idle'
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground',
                )}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowInput((v) => !v)}
              className="border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask…
            </button>
          </div>

          {showInput && (
            <div className="flex gap-1 border-b p-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ask();
                }}
                placeholder="Ask about this file…"
                aria-label="Ask about this file"
                className="min-w-0 flex-1 border bg-background px-2 py-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={ask}
                disabled={busy || !question.trim()}
                className="border border-border px-2 text-muted-foreground hover:bg-accent disabled:opacity-40"
                aria-label="Send question"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {!run && (
              <p className="text-[11px] text-muted-foreground">
                Pick an analysis above. It runs on a throwaway agent — it does not open or
                replace your current session.
              </p>
            )}
            {run?.phase === 'running' && !run.text && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analysing…
              </div>
            )}
            {run?.error && (
              <div className="flex items-start gap-2 text-[11px] text-destructive">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{run.error}</span>
              </div>
            )}
            {run?.phase === 'aborted' && (
              <p className="text-[11px] text-muted-foreground">Analysis stopped.</p>
            )}
            {run?.text && (
              <div className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                {run.text}
              </div>
            )}
            {run?.appliedEdits && (
              <p className="mt-2 flex items-start gap-2 border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                This run was allowed to edit files. Check your working tree before continuing.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
