import { Boxes, Loader2, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { TechStackSnapshot } from '@/stores';
import { COVERAGE_META, ECOSYSTEM_META, EcosystemIcon, ecosystemLabel } from './shared';

// ── Workspaces ────────────────────────────────────────────────────────────

export function WorkspaceList({ snapshot }: { snapshot: TechStackSnapshot }) {
  const { t } = useAppTranslation();
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const dep of snapshot.dependencies) {
      map.set(dep.workspaceId, (map.get(dep.workspaceId) ?? 0) + 1);
    }
    return map;
  }, [snapshot]);
  // Workspaces are bounded (per project), show all without pagination.

  if (snapshot.workspaces.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-xs text-muted-foreground">
          {t('activity:techStack.noWorkspacesDetected')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="flex flex-col gap-1.5">
        {snapshot.workspaces.map((workspace) => {
          const coverage = COVERAGE_META[workspace.coverage];
          return (
            <div key={workspace.id} className="border border-border/70 bg-card/40 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-foreground">
                    {workspace.relativeRoot}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                    <EcosystemIcon ecosystem={workspace.ecosystem} />
                    <span>{ecosystemLabel(workspace.ecosystem, t)}</span>
                    {workspace.packageManager ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{workspace.packageManager}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>{counts.get(workspace.id) ?? 0} deps</span>
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 border px-1.5 py-0.5 text-[10px] font-medium',
                    coverage.badge,
                  )}
                >
                  {t(coverage.labelKey)}
                </span>
              </div>
              {workspace.manifests.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {workspace.manifests.map((manifest) => (
                    <span
                      key={manifest}
                      className="border border-border/70 bg-background/45 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                    >
                      {manifest.split(/[/\\]/).pop()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────

export function LoadingState() {
  const { t } = useAppTranslation();
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {t('activity:techStack.loadingSnapshot')}
        </span>
      </div>
    </div>
  );
}

export function EmptyState({ onScan, disabled }: { onScan: () => void; disabled: boolean }) {
  const { t } = useAppTranslation();
  const ecosystemList = useMemo(
    () =>
      Object.values(ECOSYSTEM_META)
        .map((meta) => meta.label ?? '')
        .filter(Boolean)
        .join(', '),
    [],
  );

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center border border-info/25 bg-info/5 text-info">
          <Boxes className="size-6" />
        </div>
        <h2 className="text-sm font-semibold">{t('activity:techStack.noInventoryYet')}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          TechStack reads every manifest and lockfile in the open project — {ecosystemList} — and
          compares what you have against the upstream registries.
        </p>
        <Button size="sm" onClick={onScan} disabled={disabled}>
          <RefreshCw className={cn('size-3.5', disabled && 'animate-spin')} />
          {t('activity:techStack.scanThisProject')}
        </Button>
      </div>
    </div>
  );
}
