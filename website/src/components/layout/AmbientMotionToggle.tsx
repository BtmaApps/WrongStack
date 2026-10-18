'use client';

import { Mouse, MouseOff } from 'lucide-react';
import { useAmbientMotion } from '@/components/site/AmbientMotionProvider';
import { cn } from '@/lib/utils';

export function AmbientMotionToggle() {
  const { enabled, ready, toggle } = useAmbientMotion();
  const label = enabled ? 'Fare efektlerini kapat' : 'Fare efektlerini aç';
  const Icon = enabled ? Mouse : MouseOff;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!ready}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl border transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40',
        enabled
          ? 'border-brand/20 bg-brand/5 text-brand'
          : 'border-transparent text-muted/60 hover:text-fg',
      )}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}
