/**
 * ContrastBadges — WCAG AA gate readout for design kits.
 *
 * The gate itself runs server-side (`kitContrastIssues` in @wrongstack/core)
 * on the override-applied tokens; `design.use` / `design.materialize` replies
 * carry the result. This component only renders it — nothing when clean.
 *
 * Per the design brief, sub-12px status text uses neutral foreground on a
 * warning tint; the hue rides on the icon, never on small text.
 */

import { AlertTriangle } from 'lucide-react';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/** Mirrors the server payload field on design.use / design.materialize. */
export interface ContrastIssue {
  theme: 'light' | 'dark';
  /** e.g. 'fg/bg' (body text) or 'primary/bg' (primary action). */
  pair: string;
  ratio: number;
}

export function ContrastBadges({
  issues,
  className,
}: {
  issues: ContrastIssue[];
  className?: string;
}) {
  const { t } = useAppTranslation();
  if (issues.length === 0) return null;
  return (
    <div className={cn('mt-2 flex flex-wrap items-center gap-1', className)}>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-foreground">
        <AlertTriangle className="h-3 w-3 text-warning" aria-hidden />
        {t('activity:designStudio.contrastWarn')}
      </span>
      {issues.map((issue) => (
        <span
          key={`${issue.theme}-${issue.pair}`}
          className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground"
        >
          {issue.theme} {issue.pair} {issue.ratio.toFixed(2)}:1
        </span>
      ))}
    </div>
  );
}
