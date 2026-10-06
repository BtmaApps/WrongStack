/**
 * Dead Code panel — the user-controlled cleanup loop over the dead-code engine.
 *
 *   scan → filter & select → preview (exact diff, nothing written) → confirm →
 *   apply (server re-scans, writes, typechecks, rolls back on failure) → undo.
 *
 * Findings without a mechanical fix (test-only code, destructured exports…)
 * cannot be applied; "Send to agent" hands any selection to the chat instead.
 */

import type {
  DeadCodeApplyResult,
  DeadCodeCategory,
  DeadCodeConfidence,
  DeadCodeFinding,
  DeadCodePlan,
  DeadCodeScanResult,
} from '@wrongstack/tools/dead-code';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/Toaster';
import { Button } from '@/components/ui/button';
import { useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import { getWSClient } from '@/lib/ws-client';
import { useChatStore, useUIStore } from '@/stores';

type ScanReport = Omit<DeadCodeScanResult, 'fileHashes'>;
type ConfidenceFilter = 'high' | 'medium' | 'low';

interface BackupInfo {
  id: string;
  createdAt: string;
  files: number;
  findingIds: string[];
}

interface UndoResult {
  restored: string[];
  conflicts: string[];
}

const CATEGORY_ORDER: readonly DeadCodeCategory[] = [
  'unreachable-file',
  'dead-export',
  'unused-reexport',
  'unused-export',
  'unused-local',
  'unused-dependency',
  'test-only-file',
  'test-only-export',
  'unused-public-export',
];

const CATEGORY_KEY: Record<DeadCodeCategory, string> = {
  'unreachable-file': 'unreachableFile',
  'test-only-file': 'testOnlyFile',
  'dead-export': 'deadExport',
  'unused-export': 'unusedExport',
  'unused-reexport': 'unusedReexport',
  'test-only-export': 'testOnlyExport',
  'unused-local': 'unusedLocal',
  'unused-dependency': 'unusedDependency',
  'unused-public-export': 'unusedPublicExport',
};

const CONFIDENCE_RANK: Record<DeadCodeConfidence, number> = { high: 0, medium: 1, low: 2 };

const CONFIDENCE_CLASS: Record<DeadCodeConfidence, string> = {
  high: 'border-destructive/40 text-destructive',
  medium: 'border-warning/50 text-warning',
  low: 'border-border text-muted-foreground',
};

const PAGE = 300;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<T>(res);
}

async function readJson<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`HTTP ${res.status}: the server returned a non-JSON response`);
  }
  if (!res.ok) {
    const err = parsed as { error?: string; detail?: string };
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return parsed as T;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function agentPrompt(findings: readonly DeadCodeFinding[]): string {
  const lines = findings.slice(0, 200).map((f) => {
    const at = f.line ? `${f.file}:${f.line}` : f.file;
    const what = f.name ? ` \`${f.name}\`` : '';
    const how = f.fix ? `fix: ${f.fix}` : `manual: ${f.manualReason ?? 'review'}`;
    return `- [${f.id}] ${f.category} (${f.confidence})${what} at ${at} — ${f.reason} (${how})`;
  });
  return [
    'Review these dead-code findings from the Dead Code panel and clean them up with me.',
    'Verify each one before removing anything (dead-code-scan with previewIds shows the exact diff).',
    'Use dead-code-fix for findings that have a fix; for manual ones (e.g. test-only code) propose the change and wait for my go-ahead.',
    '',
    ...lines,
    findings.length > 200 ? `… and ${findings.length - 200} more (re-run dead-code-scan).` : '',
  ]
    .filter((l, i, a) => l !== '' || i < a.length - 1)
    .join('\n');
}

export function DeadCodeScanPanel() {
  const { t } = useAppTranslation();
  const [scope, setScope] = useState('');
  const [includePublicApi, setIncludePublicApi] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<DeadCodeCategory | 'all'>('all');
  const [minConfidence, setMinConfidence] = useState<ConfidenceFilter>('medium');
  const [query, setQuery] = useState('');
  const [onlyFixable, setOnlyFixable] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [plan, setPlan] = useState<DeadCodePlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [verify, setVerify] = useState(true);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<DeadCodeApplyResult | null>(null);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [undoState, setUndoState] = useState<{ id: string; conflicts: string[] } | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/deadcode/backups');
      setBackups((await readJson<{ backups: BackupInfo[] }>(res)).backups);
    } catch {
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setPlan(null);
    setConfirming(false);
    try {
      const paths = scope
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const next = await postJson<ScanReport>('/api/deadcode/scan', { paths, includePublicApi });
      setReport(next);
      setVisible(PAGE);
      // Keep only selections that still exist.
      setSelected((prev) => new Set(next.findings.filter((f) => prev.has(f.id)).map((f) => f.id)));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setScanning(false);
    }
  }, [scope, includePublicApi]);

  const findings = report?.findings ?? [];
  const byId = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const max = CONFIDENCE_RANK[minConfidence];
    return findings.filter(
      (f) =>
        (category === 'all' || f.category === category) &&
        CONFIDENCE_RANK[f.confidence] <= max &&
        (!onlyFixable || f.fix !== undefined) &&
        (!q || f.file.toLowerCase().includes(q) || (f.name ?? '').toLowerCase().includes(q)),
    );
  }, [findings, category, minConfidence, onlyFixable, query]);

  const groups = useMemo(() => {
    const out: Array<{ file: string; items: DeadCodeFinding[] }> = [];
    const index = new Map<string, number>();
    for (const f of filtered.slice(0, visible)) {
      let i = index.get(f.file);
      if (i === undefined) {
        i = out.length;
        index.set(f.file, i);
        out.push({ file: f.file, items: [] });
      }
      out[i]!.items.push(f);
    }
    return out;
  }, [filtered, visible]);

  const categoryCounts = useMemo(() => {
    const max = CONFIDENCE_RANK[minConfidence];
    const counts = new Map<DeadCodeCategory, number>();
    for (const f of findings) {
      if (CONFIDENCE_RANK[f.confidence] > max) continue;
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    return counts;
  }, [findings, minConfidence]);

  const selectedFindings = useMemo(
    () =>
      [...selected].map((id) => byId.get(id)).filter((f): f is DeadCodeFinding => f !== undefined),
    [selected, byId],
  );
  const selectedFixable = selectedFindings.filter((f) => f.fix);

  const toggle = (ids: string[], on: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setPlan(null);
    setConfirming(false);
  };

  const runPreview = useCallback(async () => {
    if (selectedFixable.length === 0) return;
    setPreviewing(true);
    setError(null);
    try {
      setPlan(
        await postJson<DeadCodePlan>('/api/deadcode/preview', {
          ids: selectedFixable.map((f) => f.id),
        }),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPreviewing(false);
    }
  }, [selectedFixable]);

  const runApply = useCallback(async () => {
    setApplying(true);
    setConfirming(false);
    setError(null);
    try {
      const res = await postJson<DeadCodeApplyResult>('/api/deadcode/apply', {
        ids: selectedFixable.map((f) => f.id),
        verify: verify ? 'typecheck' : 'none',
      });
      setResult(res);
      setPlan(null);
      if (res.ok) {
        toast.success(
          t('activity:deadCode.applied', {
            changed: res.changed.length,
            deleted: res.deleted.length,
          }),
        );
        setSelected(new Set());
        await runScan();
      } else {
        toast.error(t('activity:deadCode.verifyFailed'));
      }
      await loadBackups();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setApplying(false);
    }
  }, [selectedFixable, verify, t, runScan, loadBackups]);

  const runUndo = useCallback(
    async (backupId: string, force = false) => {
      setError(null);
      try {
        const res = await postJson<UndoResult>('/api/deadcode/undo', { backupId, force });
        if (res.restored.length === 0 && res.conflicts.length > 0) {
          setUndoState({ id: backupId, conflicts: res.conflicts });
          return;
        }
        setUndoState(null);
        toast.success(t('activity:deadCode.undone', { count: res.restored.length }));
        if (result?.backupId === backupId) setResult(null);
        await loadBackups();
        if (report) await runScan();
      } catch (err) {
        setError(errorText(err));
      }
    },
    [t, result, report, runScan, loadBackups],
  );

  const sendToAgent = (): void => {
    if (selectedFindings.length === 0) return;
    const prompt = agentPrompt(selectedFindings);
    const chat = useChatStore.getState();
    chat.addMessage({ role: 'user', content: prompt });
    chat.setLoading(true);
    getWSClient().sendMessage(prompt);
    useUIStore.getState().setCurrentView('chat');
  };

  const planEdits = plan?.changes.filter((c) => c.action === 'edit').length ?? 0;
  const planDeletes = plan?.changes.filter((c) => c.action === 'delete').length ?? 0;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground [overflow-wrap:anywhere]">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t('activity:deadCode.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('activity:deadCode.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !scanning) void runScan();
              }}
              placeholder={t('activity:deadCode.scopePlaceholder')}
              aria-label={t('activity:deadCode.scopePlaceholder')}
              className="h-9 w-56 border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includePublicApi}
                onChange={(e) => setIncludePublicApi(e.target.checked)}
              />
              {t('activity:deadCode.includePublicApi')}
            </label>
            <Button size="sm" onClick={() => void runScan()} disabled={scanning}>
              {scanning
                ? t('activity:deadCode.scanning')
                : report
                  ? t('activity:deadCode.rescan')
                  : t('activity:deadCode.scan')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-start justify-between gap-3 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-6"
        >
          <span className="whitespace-pre-wrap">{error}</span>
          <button
            type="button"
            className="font-semibold"
            onClick={() => setError(null)}
            aria-label={t('activity:deadCode.close')}
          >
            ✕
          </button>
        </div>
      )}

      {!report && !scanning && (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
          {t('activity:deadCode.empty')}
        </div>
      )}

      {report && (
        <div className="flex flex-1 flex-col gap-3 px-4 py-3 sm:px-6">
          {/* Stats */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('activity:deadCode.statFiles')}:{' '}
              <b className="text-foreground">{report.stats.files}</b>
            </span>
            <span>
              {t('activity:deadCode.statEntries')}:{' '}
              <b className="text-foreground">{report.stats.entryFiles}</b>
            </span>
            <span>
              {t('activity:deadCode.statReachable')}:{' '}
              <b className="text-foreground">{report.stats.reachableFiles}</b>
            </span>
            <span>
              {t('activity:deadCode.statFindings')}:{' '}
              <b className="text-foreground">{findings.length}</b>
            </span>
            <span>
              {t('activity:deadCode.statFixable')}:{' '}
              <b className="text-foreground">{findings.filter((f) => f.fix).length}</b>
            </span>
            <span>
              {(report.stats.durationMs / 1000).toFixed(1)}s ·{' '}
              {t('activity:deadCode.cachedNote', { count: report.stats.cachedFiles })}
            </span>
          </div>

          {report.warnings.length > 0 && (
            <ul className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              {report.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}

          {/* Result of the last apply */}
          {result && (
            <div
              className={cn(
                'border px-3 py-2 text-sm',
                result.ok
                  ? 'border-success/40 bg-success/10'
                  : 'border-destructive/40 bg-destructive/10',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>
                  {result.ok
                    ? t('activity:deadCode.applied', {
                        changed: result.changed.length,
                        deleted: result.deleted.length,
                      })
                    : t('activity:deadCode.rolledBack')}
                </b>
                <div className="flex gap-2">
                  {result.ok && result.backupId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void runUndo(result.backupId!)}
                    >
                      {t('activity:deadCode.undo')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                    {t('activity:deadCode.close')}
                  </Button>
                </div>
              </div>
              {result.excluded.length > 0 && (
                <div className="mt-1 text-xs">
                  {t('activity:deadCode.excluded', { count: result.excluded.length })}
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {result.excluded.slice(0, 20).map((x) => (
                      <li key={x.id}>
                        {byId.get(x.id)?.name ?? x.id}: {x.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.verify.map((v) => (
                <div key={`${v.package}-${v.command}`} className="mt-1 text-xs">
                  {v.ok ? '✓' : '✗'} {v.package} · <code>{v.command}</code> ·{' '}
                  {(v.durationMs / 1000).toFixed(1)}s
                  {!v.ok && (
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap bg-card p-2 font-mono text-[11px]">
                      {v.output.slice(-3000)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
              {t('activity:deadCode.filterAll')} (
              {[...categoryCounts.values()].reduce((a, b) => a + b, 0)})
            </FilterChip>
            {CATEGORY_ORDER.filter((c) => categoryCounts.has(c)).map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {t(`activity:deadCode.categories.${CATEGORY_KEY[c]}`)} ({categoryCounts.get(c)})
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <select
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value as ConfidenceFilter)}
              aria-label={t('activity:deadCode.confidenceLabel')}
              className="h-8 border border-input bg-card px-2"
            >
              <option value="high">{t('activity:deadCode.confidenceHigh')}</option>
              <option value="medium">{t('activity:deadCode.confidenceMediumUp')}</option>
              <option value="low">{t('activity:deadCode.confidenceAll')}</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('activity:deadCode.searchPlaceholder')}
              aria-label={t('activity:deadCode.searchPlaceholder')}
              className="h-8 w-56 border border-input bg-card px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyFixable}
                onChange={(e) => setOnlyFixable(e.target.checked)}
              />
              {t('activity:deadCode.onlyFixable')}
            </label>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() =>
                toggle(
                  filtered.filter((f) => f.fix).map((f) => f.id),
                  true,
                )
              }
            >
              {t('activity:deadCode.selectVisible', {
                count: filtered.filter((f) => f.fix).length,
              })}
            </button>
          </div>

          {/* Findings */}
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('activity:deadCode.noFindings')}
            </div>
          ) : (
            <div className="flex flex-col border border-border">
              {groups.map((g) => {
                const fixable = g.items.filter((f) => f.fix).map((f) => f.id);
                const allOn = fixable.length > 0 && fixable.every((id) => selected.has(id));
                return (
                  <div key={g.file} className="border-b border-border last:border-b-0">
                    <label className="flex items-center gap-2 bg-card/60 px-3 py-1.5 font-mono text-xs">
                      <input
                        type="checkbox"
                        checked={allOn}
                        disabled={fixable.length === 0}
                        onChange={(e) => toggle(fixable, e.target.checked)}
                        aria-label={g.file}
                      />
                      <span className="truncate">{g.file}</span>
                      <span className="ml-auto text-muted-foreground">{g.items.length}</span>
                    </label>
                    {g.items.map((f) => (
                      <label
                        key={f.id}
                        className={cn(
                          'flex items-start gap-2 px-3 py-1.5 text-xs hover:bg-accent/40',
                          !f.fix && 'cursor-default',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected.has(f.id)}
                          onChange={(e) => toggle([f.id], e.target.checked)}
                          aria-label={`${f.category} ${f.name ?? f.file}`}
                        />
                        <span
                          className={cn(
                            'shrink-0 border px-1 text-[10px] uppercase',
                            CONFIDENCE_CLASS[f.confidence],
                          )}
                        >
                          {t(`activity:deadCode.confidence.${f.confidence}`)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">
                            {t(`activity:deadCode.categories.${CATEGORY_KEY[f.category]}`)}
                          </span>
                          {f.name && (
                            <code className="ml-1.5 text-foreground">
                              {f.name}
                              {f.kind && <span className="text-muted-foreground"> · {f.kind}</span>}
                            </code>
                          )}
                          {f.line !== undefined && (
                            <span className="ml-1.5 text-muted-foreground">:{f.line}</span>
                          )}
                          <span className="block text-muted-foreground">{f.reason}</span>
                          {!f.fix && f.manualReason && (
                            <span className="block text-warning">
                              {t('activity:deadCode.manual')}: {f.manualReason}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
              {filtered.length > visible && (
                <button
                  type="button"
                  className="px-3 py-2 text-xs text-primary hover:bg-accent/40"
                  onClick={() => setVisible((v) => v + PAGE)}
                >
                  {t('activity:deadCode.showMore', { count: filtered.length - visible })}
                </button>
              )}
            </div>
          )}

          {/* Preview */}
          {plan && (
            <div className="border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 text-sm">
                <b>
                  {t('activity:deadCode.previewTitle', { edits: planEdits, deletes: planDeletes })}
                </b>
                <Button size="sm" variant="ghost" onClick={() => setPlan(null)}>
                  {t('activity:deadCode.close')}
                </Button>
              </div>
              {plan.changes.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  {t('activity:deadCode.previewEmpty')}
                </div>
              )}
              {plan.changes.map((c) => (
                <details
                  key={c.file}
                  className="border-b border-border last:border-b-0"
                  open={plan.changes.length <= 8}
                >
                  <summary className="cursor-pointer px-3 py-1.5 font-mono text-xs">
                    {c.action === 'delete' ? '🗑 ' : '✎ '}
                    {c.file}
                  </summary>
                  <DiffView diff={c.diff} />
                </details>
              ))}
              {(plan.skipped.length > 0 || plan.notes.length > 0) && (
                <div className="space-y-1 px-3 py-2 text-xs">
                  {plan.skipped.length > 0 && (
                    <div>
                      <b>{t('activity:deadCode.skipped', { count: plan.skipped.length })}</b>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        {plan.skipped.slice(0, 30).map((s) => (
                          <li key={s.id}>
                            {byId.get(s.id)?.name ?? byId.get(s.id)?.file ?? s.id}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {plan.notes.length > 0 && (
                    <div>
                      <b>{t('activity:deadCode.notes')}</b>
                      <ul className="ml-4 list-disc text-muted-foreground">
                        {plan.notes.slice(0, 30).map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Backups */}
          {backups.length > 0 && (
            <details className="border border-border text-xs">
              <summary className="cursor-pointer bg-card/60 px-3 py-1.5">
                {t('activity:deadCode.backups', { count: backups.length })}
              </summary>
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-1.5"
                >
                  <span className="font-mono">{new Date(b.createdAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">
                    {t('activity:deadCode.backupFiles', {
                      files: b.files,
                      findings: b.findingIds.length,
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7"
                    onClick={() => void runUndo(b.id)}
                  >
                    {t('activity:deadCode.undo')}
                  </Button>
                </div>
              ))}
            </details>
          )}
          {undoState && (
            <div className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              {t('activity:deadCode.undoConflicts', { count: undoState.conflicts.length })}
              <ul className="ml-4 list-disc font-mono">
                {undoState.conflicts.slice(0, 20).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void runUndo(undoState.id, true)}
                >
                  {t('activity:deadCode.forceUndo')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setUndoState(null)}>
                  {t('activity:deadCode.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
          {confirming && plan ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                {t('activity:deadCode.confirmBody', { edits: planEdits, deletes: planDeletes })}{' '}
                {verify
                  ? t('activity:deadCode.confirmVerify')
                  : t('activity:deadCode.confirmNoVerify')}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void runApply()}
                  disabled={applying}
                >
                  {t('activity:deadCode.confirmApply')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  {t('activity:deadCode.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {t('activity:deadCode.selected', {
                  count: selected.size,
                  fixable: selectedFixable.length,
                })}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={verify}
                  onChange={(e) => setVerify(e.target.checked)}
                />
                {t('activity:deadCode.verifyTypecheck')}
              </label>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void runPreview()}
                  disabled={previewing || applying || selectedFixable.length === 0}
                >
                  {previewing ? t('activity:deadCode.previewing') : t('activity:deadCode.preview')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (plan) setConfirming(true);
                    else void runPreview().then(() => setConfirming(true));
                  }}
                  disabled={applying || selectedFixable.length === 0}
                >
                  {applying ? t('activity:deadCode.applying') : t('activity:deadCode.apply')}
                </Button>
                <Button size="sm" variant="secondary" onClick={sendToAgent} disabled={applying}>
                  {t('activity:deadCode.sendToAgent')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggle([...selected], false)}
                  disabled={applying}
                >
                  {t('activity:deadCode.clearSelection')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'border px-2 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/40',
      )}
    >
      {children}
    </button>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="max-h-96 overflow-auto bg-card px-3 py-2 font-mono text-[11px] leading-snug">
      {diff.split('\n').map((line, i) => (
        <div
          key={i}
          className={cn(
            line.startsWith('+') && !line.startsWith('+++') && 'bg-success/10 text-success',
            line.startsWith('-') && !line.startsWith('---') && 'bg-destructive/10 text-destructive',
            line.startsWith('@@') && 'text-info',
          )}
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  );
}
