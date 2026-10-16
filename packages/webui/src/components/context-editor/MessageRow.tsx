import { AlertTriangle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { useContextEditorStore } from '@/stores/context-editor-store';
import type { ContextEditorContentBlock } from '@/types/runtime';

export function fmtTok(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface MessageRowProps {
  index: number;
  role: string;
  tokens: number;
  content: ReturnType<typeof useContextEditorStore.getState>['messages'][number]['content'];
  blockCount: number | null;
  warnings: { code: string; severity: string; message: string }[];
  markedForRemoval: boolean;
  markedRanges: Array<{
    blockIndex?: number | undefined;
    start?: number | undefined;
    end?: number | undefined;
  }>;
  disabled: boolean;
  onToggle: () => void;
  onMarkRange: (blockIndex: number | undefined, start: number, end: number) => void;
}

function selectedOffsets(element: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  return end > start ? { start, end } : null;
}

function blockSummary(block: ContextEditorContentBlock): string {
  if (block.type === 'image') {
    return block.source?.type === 'base64'
      ? `${block.source.media_type ?? 'image'} · ${block.source.data?.length ?? 0} base64 chars`
      : 'URL image source';
  }
  if (block.type === 'tool_use') return `${block.name ?? 'tool'} · ${block.id ?? 'unknown id'}`;
  if (block.type === 'tool_result') return `tool result · ${block.tool_use_id ?? 'unknown id'}`;
  if (block.type === 'thinking') return `thinking · ${block.thinking?.length ?? 0} chars`;
  return block.type;
}

function SelectableContent({
  text,
  blockIndex,
  marked,
  disabled,
  onMarkRange,
}: {
  text: string;
  blockIndex?: number | undefined;
  marked: boolean;
  disabled: boolean;
  onMarkRange: (blockIndex: number | undefined, start: number, end: number) => void;
}): React.ReactElement {
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const contentRef = useRef<HTMLParagraphElement>(null);

  const captureSelection = useCallback(() => {
    if (disabled) return;
    const element = contentRef.current;
    if (element) setSelection(selectedOffsets(element));
  }, [disabled]);

  useEffect(() => {
    setSelection(null);
  }, [text]);

  return (
    <div
      className={cn(
        'rounded-md border bg-background p-3',
        marked && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <p
        ref={contentRef}
        className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground select-text"
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        tabIndex={disabled ? -1 : 0}
      >
        {text || '(empty)'}
      </p>
      {selection && (
        <button
          type="button"
          disabled={disabled}
          className="mt-2 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onMarkRange(blockIndex, selection.start, selection.end);
            window.getSelection()?.removeAllRanges();
            setSelection(null);
          }}
        >
          Mark for removal
        </button>
      )}
    </div>
  );
}

export function MessageRow({
  index,
  role,
  tokens,
  content,
  blockCount,
  warnings,
  markedForRemoval,
  markedRanges,
  disabled,
  onToggle,
  onMarkRange,
}: MessageRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const roleColor =
    role === 'user'
      ? 'text-primary'
      : role === 'assistant'
        ? 'text-success'
        : 'text-muted-foreground';
  const hasWarnings = warnings.length > 0;

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors',
        markedForRemoval && 'border-destructive/40 bg-destructive/5 opacity-70',
        !markedForRemoval && 'hover:border-primary/30',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="mt-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={markedForRemoval ? 'Undo removal' : 'Mark for removal'}
      >
        {markedForRemoval ? (
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <div className="h-3.5 w-3.5 rounded-sm border border-border/60 group-hover:border-primary/50 transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px]">
          {blockCount !== null && blockCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground/60 hover:text-foreground shrink-0"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          <span className={cn('font-mono font-medium', roleColor)}>{role}</span>
          <span className="text-muted-foreground/60 tabular-nums">{fmtTok(tokens)} tok</span>
          {blockCount !== null && blockCount > 0 && (
            <span className="text-muted-foreground/50 tabular-nums">{blockCount} blk</span>
          )}
          {hasWarnings && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
        </div>
        <div className="mt-3 space-y-2">
          {typeof content === 'string' ? (
            <SelectableContent
              text={content}
              marked={markedRanges.some((range) => range.blockIndex === undefined)}
              disabled={disabled}
              onMarkRange={onMarkRange}
            />
          ) : (
            content.map((block, blockIndex) => (
              <div key={`${index}-${blockIndex}`} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">{block.type}</span>
                  {typeof block.text === 'string' && (
                    <span>{fmtTok(Math.ceil(block.text.length / 4))} tok</span>
                  )}
                </div>
                {block.type === 'text' && typeof block.text === 'string' ? (
                  <SelectableContent
                    text={block.text}
                    blockIndex={blockIndex}
                    marked={markedRanges.some((range) => range.blockIndex === blockIndex)}
                    disabled={disabled}
                    onMarkRange={onMarkRange}
                  />
                ) : (
                  <div className="rounded-md border bg-muted/20 p-3 font-mono text-[11px] text-muted-foreground">
                    {blockSummary(block)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {expanded && hasWarnings && (
          <div className="mt-2 space-y-1">
            {warnings.map((w, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-1 text-[10px] rounded px-1.5 py-0.5',
                  w.severity === 'danger'
                    ? 'bg-destructive/10 text-destructive'
                    : w.severity === 'warning'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                <span className="font-mono">{w.code}</span>
                <span className="opacity-80">{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
