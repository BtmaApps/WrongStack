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
  DeadCodeFinding,
  DeadCodePlan,
} from '@wrongstack/tools/dead-code';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/Toaster';
import { Button } from '@/components/ui/button';
import { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { useChatStore, useUIStore } from '@/stores';
import { DeadCodeFilters, DeadCodeFindingsList } from './DeadCodeFindingsSection.js';
import {
  DeadCodeApplyResultCard,
  DeadCodeBackupsSection,
  DeadCodePlanPreview,
} from './DeadCodeResultSections.js';
import { DeadCodeSelectionBar } from './DeadCodeSelectionBar.js';
import {
  agentPrompt,
  type BackupInfo,
  CONFIDENCE_RANK,
  type ConfidenceFilter,
  errorText,
  PAGE,
  postJson,
  readJson,
  type ScanReport,
  type UndoResult,
} from './dead-code-panel-model.js';

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
          {/* Result of the last apply */}{' '}
          {result && (
            <DeadCodeApplyResultCard
              result={result}
              byId={byId}
              onUndo={(backupId) => void runUndo(backupId)}
              onClose={() => setResult(null)}
            />
          )}
          {/* Filters */}
          <DeadCodeFilters
            category={category}
            setCategory={setCategory}
            categoryCounts={categoryCounts}
            minConfidence={minConfidence}
            setMinConfidence={setMinConfidence}
            query={query}
            setQuery={setQuery}
            onlyFixable={onlyFixable}
            setOnlyFixable={setOnlyFixable}
            filtered={filtered}
            toggle={toggle}
          />
          {/* Findings */}
          <DeadCodeFindingsList
            filtered={filtered}
            groups={groups}
            visible={visible}
            selected={selected}
            toggle={toggle}
            setVisible={setVisible}
          />
          {/* Preview */}
          {plan && (
            <DeadCodePlanPreview
              plan={plan}
              byId={byId}
              planEdits={planEdits}
              planDeletes={planDeletes}
              onClose={() => setPlan(null)}
            />
          )}
          {/* Backups */}
          <DeadCodeBackupsSection
            backups={backups}
            undoState={undoState}
            onUndo={(backupId, force) => void runUndo(backupId, force)}
            onCancelUndo={() => setUndoState(null)}
          />
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <DeadCodeSelectionBar
          confirming={confirming}
          hasPlan={plan !== null}
          planEdits={planEdits}
          planDeletes={planDeletes}
          verify={verify}
          setVerify={setVerify}
          applying={applying}
          previewing={previewing}
          selectedCount={selected.size}
          fixableCount={selectedFixable.length}
          onApply={() => void runApply()}
          onCancelConfirm={() => setConfirming(false)}
          onPreview={() => void runPreview()}
          onConfirm={() => {
            if (plan) setConfirming(true);
            else void runPreview().then(() => setConfirming(true));
          }}
          onSendToAgent={sendToAgent}
          onClearSelection={() => toggle([...selected], false)}
        />
      )}
    </div>
  );
}
