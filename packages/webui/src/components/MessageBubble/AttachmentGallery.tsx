import { FileText, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatMessageAttachment } from '@/stores/types.js';

/**
 * Thumbnail strip for images attached to a user message. Click toggles a
 * thumbnail between compact and full-size. Attachments rehydrated from
 * localStorage arrive without `dataUrl` (stripped to protect the quota) and
 * degrade to a name/size placeholder chip. A PDF is always a name chip.
 */
export function AttachmentGallery({
  attachments,
  notRetainedLabel,
}: {
  attachments: readonly ChatMessageAttachment[];
  notRetainedLabel: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att) =>
        att.mediaType === 'application/pdf' ? (
          <span
            key={att.id}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/20 px-2 py-1.5 text-xs"
            title={att.name ?? att.mediaType}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[180px] truncate">{att.name ?? 'PDF'}</span>
            {att.bytes > 0 && (
              <span className="tabular-nums opacity-70">
                {Math.max(1, Math.round(att.bytes / 1024))} KB
              </span>
            )}
          </span>
        ) : att.dataUrl ? (
          <button
            key={att.id}
            type="button"
            onClick={() => setExpandedId((cur) => (cur === att.id ? null : att.id))}
            className="group relative overflow-hidden rounded-lg border border-border/40 bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={att.name ?? att.mediaType}
          >
            <img
              src={att.dataUrl}
              alt={att.name ?? att.mediaType}
              className={cn(
                'block object-contain transition-[max-height,max-width]',
                expandedId === att.id ? 'max-h-[32rem] max-w-full' : 'max-h-36 max-w-[16rem]',
              )}
            />
          </button>
        ) : (
          <span
            key={att.id}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/20 px-2 py-1.5 text-xs opacity-80"
            title={notRetainedLabel}
          >
            <ImageOff className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[140px] truncate">{att.name ?? att.mediaType}</span>
            <span className="tabular-nums opacity-70">
              {Math.max(1, Math.round(att.bytes / 1024))} KB
            </span>
          </span>
        ),
      )}
    </div>
  );
}
