/**
 * A changed image in the Changes view: the version at HEAD next to the one in
 * the working tree, or the two stacked with a slider that fades between them
 * (onion skin). Each side says its pixel size and file size; an added or
 * deleted image shows its one side.
 */

import { Columns2, Layers } from 'lucide-react';
import { useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { formatImageBytes } from '@/lib/project-image';
import { cn } from '@/lib/utils';
import type { GitImageDiff } from '@/types/server-message';

type Mode = 'side' | 'onion';

function useNaturalSize(): [
  { w: number; h: number } | undefined,
  (e: React.SyntheticEvent<HTMLImageElement>) => void,
] {
  const [size, setSize] = useState<{ w: number; h: number }>();
  return [
    size,
    (e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }),
  ];
}

function Caption({
  label,
  size,
  bytes,
}: {
  label: string;
  size: { w: number; h: number } | undefined;
  bytes: number | undefined;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground/80">{label}</span>
      {size && (
        <span>
          {size.w}×{size.h}
        </span>
      )}
      {bytes !== undefined && <span>{formatImageBytes(bytes)}</span>}
    </div>
  );
}

export function ImageDiffView({ image, path }: { image: GitImageDiff; path: string }) {
  const { t } = useAppTranslation();
  const both = Boolean(image.old && image.new);
  const [mode, setMode] = useState<Mode>('side');
  const [opacity, setOpacity] = useState(50);
  const [oldSize, onOldLoad] = useNaturalSize();
  const [newSize, onNewLoad] = useNaturalSize();
  const before = t('activity:changes.image.before');
  const after = t('activity:changes.image.after');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {!image.old
            ? t('activity:changes.image.added')
            : !image.new
              ? t('activity:changes.image.deleted')
              : t('activity:changes.image.changed')}
        </span>
        <span className="flex-1" />
        {both && (
          <div className="flex items-center gap-1">
            {(
              [
                ['side', Columns2, t('activity:changes.image.side')],
                ['onion', Layers, t('activity:changes.image.onion')],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                  mode === m
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {mode === 'onion' && both ? (
          <div className="flex flex-col items-center gap-3">
            {/* One grid cell holds both, each at its own size and centred, so
                images of different sizes line up instead of one stretching. */}
            <div className="ws-checkerboard grid max-w-full border border-border/60">
              <img
                src={image.old}
                alt={`${path} (${before})`}
                onLoad={onOldLoad}
                style={{ gridArea: '1 / 1' }}
                className="block max-h-[60vh] max-w-full place-self-center"
              />
              <img
                src={image.new}
                alt={`${path} (${after})`}
                onLoad={onNewLoad}
                style={{ gridArea: '1 / 1', opacity: opacity / 100 }}
                className="block max-h-[60vh] max-w-full place-self-center"
              />
            </div>
            <label className="flex w-full max-w-md items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">{before}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                aria-label={t('activity:changes.image.opacity')}
                className="flex-1"
              />
              <span className="shrink-0">{after}</span>
            </label>
            <div className="flex flex-wrap justify-center gap-4">
              <Caption label={before} size={oldSize} bytes={image.oldBytes} />
              <Caption label={after} size={newSize} bytes={image.newBytes} />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
            {image.old && (
              <figure className="m-0 flex min-w-0 flex-col gap-1.5">
                <Caption label={before} size={oldSize} bytes={image.oldBytes} />
                <div className="ws-checkerboard flex justify-center border border-border/60">
                  <img
                    src={image.old}
                    alt={`${path} (${before})`}
                    onLoad={onOldLoad}
                    className="block max-h-[60vh] max-w-full object-contain"
                  />
                </div>
              </figure>
            )}
            {image.new && (
              <figure className="m-0 flex min-w-0 flex-col gap-1.5">
                <Caption label={after} size={newSize} bytes={image.newBytes} />
                <div className="ws-checkerboard flex justify-center border border-border/60">
                  <img
                    src={image.new}
                    alt={`${path} (${after})`}
                    onLoad={onNewLoad}
                    className="block max-h-[60vh] max-w-full object-contain"
                  />
                </div>
              </figure>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
