/**
 * TerminalStrip — this browser's integrated terminals, above the composer,
 * while the terminal dock is hidden (hiding it keeps them running). A chip
 * shows a spinner while its terminal is printing; opening it shows the last
 * lines, and "Open" brings the dock back on that terminal.
 */

import { ChevronDown, ChevronUp, SquareTerminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { type TerminalSummary, useTerminalStripStore } from '@/stores/terminal-strip-store';

/** Output within this long counts as "printing now". */
const ACTIVE_MS = 2000;

function isPrinting(terminal: TerminalSummary, now: number): boolean {
  return terminal.status === 'running' && now - terminal.lastOutputAt < ACTIVE_MS;
}

export function TerminalStrip(): React.ReactElement | null {
  const { t } = useAppTranslation();
  const terminals = useTerminalStripStore((s) => s.terminals);
  const dockOpen = useUIStore((s) => s.terminalOpen);
  const setTerminalOpen = useUIStore((s) => s.setTerminalOpen);
  const [openId, setOpenId] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());

  const visible = !dockOpen && terminals.length > 0;
  const anyPrinting = terminals.some((terminal) => isPrinting(terminal, now));
  // Ticks only while something is printing, so a spinner stops by itself.
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    if (!anyPrinting) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [visible, anyPrinting, terminals]);

  if (!visible) return null;
  const open = terminals.find((terminal) => terminal.id === openId);

  const show = (terminal: TerminalSummary) => {
    useTerminalStripStore.getState().requestFocus(terminal.id);
    setTerminalOpen(true);
    setOpenId(undefined);
  };

  return (
    <div className="ws-terminal-strip mb-1.5 flex flex-col gap-1" data-testid="terminal-strip">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-medium uppercase tracking-wide text-muted-foreground/70">
          {t('activity:terminal.stripLabel')}
        </span>
        {terminals.map((terminal) => {
          const active = terminal.id === openId;
          const printing = isPrinting(terminal, now);
          return (
            <button
              key={terminal.id}
              type="button"
              aria-expanded={active}
              title={terminal.name}
              onClick={() => setOpenId(active ? undefined : terminal.id)}
              className={cn(
                'flex max-w-[16rem] items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono transition-colors',
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : terminal.status === 'exited'
                    ? 'border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    : 'border-border/60 bg-muted/20 text-foreground hover:bg-muted/40',
              )}
            >
              <span
                data-state={printing ? 'printing' : terminal.status}
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  printing && 'animate-pulse bg-success',
                  !printing && terminal.status === 'running' && 'bg-success/50',
                  terminal.status === 'starting' && 'bg-primary',
                  terminal.status === 'exited' && 'bg-destructive',
                )}
              />
              <SquareTerminal className="h-3 w-3 shrink-0" />
              <span className="truncate">{terminal.name}</span>
              {terminal.status === 'exited' ? (
                <span className="shrink-0 text-muted-foreground">
                  {t('activity:terminal.stripExited', { code: terminal.exitCode ?? '?' })}
                </span>
              ) : null}
              {active ? (
                <ChevronUp className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="rounded-md border border-border/60 bg-muted/30 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-2 py-1">
            <span className="text-muted-foreground">
              {t('activity:terminal.stripOutputTitle', { name: open.name })}
            </span>
            <button
              type="button"
              onClick={() => show(open)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-primary/10"
            >
              <SquareTerminal className="h-3 w-3" />
              {t('activity:terminal.stripOpen')}
            </button>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all px-2 py-1.5 font-mono text-[11px] leading-snug">
            {open.tail.some((line) => line.trim())
              ? open.tail.join('\n').trimEnd()
              : t('activity:terminal.stripNoOutput')}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
