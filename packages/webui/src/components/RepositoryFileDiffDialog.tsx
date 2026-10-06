import { FileCode2, Loader2 } from 'lucide-react';
import type { RefObject } from 'react';
import { DiffView } from './DiffView';
import { type FileDiffPayload, shortHash } from './repository-history-model';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

/** Modal side-by-side diff of one file at one commit; returns focus to its trigger. */
export function RepositoryFileDiffDialog({
  open,
  onOpenChange,
  fileDiff,
  loading,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileDiff: FileDiffPayload | null;
  loading: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(86dvh,860px)] max-w-[min(94vw,1180px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:p-0"
        onCloseAutoFocus={(event) => {
          if (triggerRef.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader className="border-b border-border/70 bg-card/80 px-5 py-4 pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <FileCode2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate font-mono text-sm">
                {fileDiff?.path ?? 'Commit file diff'}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 text-[11px]">
                <span className="font-mono">{fileDiff ? shortHash(fileDiff.hash) : '—'}</span>
                {fileDiff?.previousPath && fileDiff.previousPath !== fileDiff.path && (
                  <span className="truncate">renamed from {fileDiff.previousPath}</span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden bg-[hsl(var(--surface-2)/0.45)] p-3">
          <div className="flex h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background/70">
            {loading || !fileDiff ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading revision diff…
              </div>
            ) : fileDiff.error ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-destructive">
                {fileDiff.error}
              </div>
            ) : fileDiff.binary ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Binary files cannot be displayed as text.
              </div>
            ) : fileDiff.tooLarge ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                This revision is too large for the inline diff viewer.
              </div>
            ) : (
              <DiffView
                oldText={fileDiff.oldText ?? ''}
                newText={fileDiff.newText ?? ''}
                caption={fileDiff.path}
                fill
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
