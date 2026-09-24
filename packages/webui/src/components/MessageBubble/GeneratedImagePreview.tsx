/**
 * The pictures an `image_generate` call saved, shown on its tool card without
 * opening it. The tool's result names the files; each one is loaded from the
 * project (`files.image`). Click a picture to see it at full size.
 */

import { ImageOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { formatImageBytes, useProjectImage } from '@/lib/project-image';
import { cn } from '@/lib/utils';

/** The saved files an `image_generate` result lists, or none when it is not one. */
function generatedImagePaths(result: string | undefined): string[] {
  if (!result) return [];
  try {
    const parsed = JSON.parse(result) as { files?: Array<{ path?: unknown }> };
    return (parsed.files ?? [])
      .map((f) => f.path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0);
  } catch {
    return [];
  }
}

function PreviewTile({ path, cacheKey }: { path: string; cacheKey: string }) {
  const { t } = useAppTranslation();
  const image = useProjectImage(path, cacheKey);
  const [large, setLarge] = useState(false);
  if (image.status === 'loading') {
    return (
      <div className="flex h-24 w-24 items-center justify-center border border-border/50 bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (image.status === 'unavailable') {
    return (
      <div
        className="flex h-24 max-w-48 flex-col items-center justify-center gap-1 border border-border/50 bg-muted/30 px-2 text-center font-mono text-[10px] text-muted-foreground"
        title={path}
      >
        <ImageOff className="h-4 w-4" />
        {t(`activity:message.imagePreview.${image.reason}`)}
      </div>
    );
  }
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={() => setLarge((v) => !v)}
        title={t('activity:message.imagePreview.toggleSize')}
        className="ws-checkerboard block border border-border/50"
      >
        <img
          src={image.dataUrl}
          alt={path}
          className={cn('block object-contain', large ? 'max-h-[70vh] max-w-full' : 'max-h-44')}
        />
      </button>
      <figcaption className="truncate font-mono text-[10px] text-muted-foreground" title={path}>
        {path} · {formatImageBytes(image.bytes)}
      </figcaption>
    </figure>
  );
}

export function GeneratedImagePreview({
  result,
  messageId,
}: {
  result?: string;
  messageId: string;
}) {
  const paths = generatedImagePaths(result);
  if (paths.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2 border-t border-border/40 px-2.5 py-2">
      {paths.map((path) => (
        <PreviewTile key={path} path={path} cacheKey={`${messageId}:${path}`} />
      ))}
    </div>
  );
}
