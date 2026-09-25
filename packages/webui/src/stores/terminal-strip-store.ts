/**
 * This browser's integrated terminals, as the composer strip shows them while
 * the terminal dock is hidden: name, state, when output last arrived, and its
 * last lines. The dock owns the terminals; it reports them here.
 */
import { create } from 'zustand';

/** Lines kept for the strip's peek. */
export const TERMINAL_PEEK_LINES = 12;

export interface TerminalSummary {
  id: string;
  name: string;
  status: 'starting' | 'running' | 'exited';
  exitCode?: number | undefined;
  lastOutputAt: number;
  tail: string[];
}

interface TerminalStripState {
  terminals: TerminalSummary[];
  /** A terminal the strip asked the dock to bring to the front. */
  focusRequest: { id: string; nonce: number } | null;
  syncTabs(tabs: ReadonlyArray<Pick<TerminalSummary, 'id' | 'name' | 'status' | 'exitCode'>>): void;
  appendOutput(id: string, lines: string[], at: number): void;
  requestFocus(id: string): void;
  clear(): void;
}

// Escape sequences and carriage-return redraws are terminal drawing, not text.
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
/**
 * Moving the cursor to a position (`CSI row;col H`) is how Windows' ConPTY
 * often starts a new line; read it as one, unless the line is still empty.
 */
const CURSOR_TO = /\x1b\[[0-9;]*[Hf]/g;
const SOFT_BREAK = '\u0000';

/** `tail` with `chunk` appended, as plain lines; the last line may still be growing. */
function appendTail(tail: readonly string[], chunk: string, keep = TERMINAL_PEEK_LINES): string[] {
  const text = chunk.replace(CURSOR_TO, SOFT_BREAK).replace(ANSI, '');
  const lines = [...tail];
  let current = lines.pop() ?? '';
  for (const part of text.split(/(\r\n|\n|\r|\u0000)/)) {
    if (part === '\n' || part === '\r\n') {
      lines.push(current);
      current = '';
    } else if (part === SOFT_BREAK) {
      if (current.trim()) {
        lines.push(current);
        current = '';
      }
    } else if (part === '\r') {
      current = '';
    } else {
      current += part;
    }
  }
  lines.push(current);
  return lines.slice(-keep);
}

export const useTerminalStripStore = create<TerminalStripState>()((set) => ({
  terminals: [],
  focusRequest: null,
  syncTabs: (tabs) =>
    set((state) => ({
      terminals: tabs.map((tab) => {
        const known = state.terminals.find((t) => t.id === tab.id);
        return {
          id: tab.id,
          name: tab.name,
          status: tab.status,
          exitCode: tab.exitCode,
          lastOutputAt: known?.lastOutputAt ?? 0,
          tail: known?.tail ?? [],
        };
      }),
    })),
  appendOutput: (id, lines, at) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, lastOutputAt: at, tail: lines } : t,
      ),
    })),
  requestFocus: (id) =>
    set((state) => ({ focusRequest: { id, nonce: (state.focusRequest?.nonce ?? 0) + 1 } })),
  clear: () => set({ terminals: [], focusRequest: null }),
}));

/**
 * Output arrives in many small frames; the strip only needs it a few times a
 * second, so frames are folded per terminal and published together.
 */
const pending = new Map<string, string>();
let flushScheduled = false;
const FLUSH_MS = 250;

export function noteTerminalOutput(id: string, data: string): void {
  pending.set(id, (pending.get(id) ?? '') + data);
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    const store = useTerminalStripStore.getState();
    const at = Date.now();
    for (const [terminalId, chunk] of pending) {
      const known = store.terminals.find((t) => t.id === terminalId);
      if (known) store.appendOutput(terminalId, appendTail(known.tail, chunk), at);
    }
    pending.clear();
  }, FLUSH_MS);
}
