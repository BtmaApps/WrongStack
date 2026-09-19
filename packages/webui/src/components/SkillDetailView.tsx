/**
 * SkillDetailView — displays the selected skill's content in the main content area.
 * Shown when currentView === 'skill'.
 */

import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Loader2,
  PanelRight,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import rehypeHighlight from 'rehype-highlight';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppTranslation } from '@/i18n';
import { scaledPx } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { LazyMarkdown as ReactMarkdown } from './MessageBubble/LazyMarkdown.js';
import { markdownComponents } from './MessageBubble/utils';
import { EmptyState } from './ui/empty-state';
import { useSkillDetail } from './use-skill-detail.js';

/** Lazy-loaded code editor — only needed when the user enters edit mode. */
const TextareaCodeEditor = lazy(() => import('@uiw/react-textarea-code-editor'));

/**
 * WrongStack-managed (writable) skill sources: project + user. Bundled and
 * foreign (.claude/*, extra) sources are read-only — no edit/uninstall/update.
 */
function isWritableSkillSource(source: string | undefined): boolean {
  return source === 'project' || source === 'user';
}

/** Derive a skill name from a related filename like "api-design/SKILL.save.md" → "api-design" */
function skillNameFromFile(fileName: string): string | null {
  const match = fileName.match(/^(.+?)\/SKILL(?:\.save)?\.md$/);
  return match ? match[1] : null;
}

function ScopeBadge({ source }: { source: string }) {
  const { t } = useAppTranslation();
  const scope = source === 'project' ? 'project' : source === 'user' ? 'user' : 'bundled';
  const labelKeys: Record<string, string> = {
    project: 'scopeProject',
    user: 'scopeGlobal',
    bundled: 'scopeBundled',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        scope === 'project' && 'border-success/25 bg-success/8 text-success',
        scope === 'user' && 'border-primary/25 bg-primary/10 text-primary',
        scope === 'bundled' && 'border-border/70 bg-muted/60 text-muted-foreground',
      )}
    >
      {t(`activity:skillDetail.${labelKeys[scope]}`)}
    </span>
  );
}

export function SkillDetailView(props0: { className?: string }) {
  const {
    selectedSkill,
    t,
    handleClose,
    className,
    handleCopySourceUrl,
    copiedSourceUrl,
    updateResult,
    handleCheckForUpdates,
    checkingForUpdates,
    editMode,
    handleExportSkill,
    handleStartEdit,
    setUninstallConfirmSkill,
    navHistory,
    handleBreadcrumbBack,
    historyIndex,
    handleBreadcrumbForward,
    isNavigatingBack,
    setSkillsState,
    skillsStateRef,
    setEditMode,
    setEditContent,
    setUpdateResult,
    skillContent,
    findSkillByName,
    handleNavigateToSkill,
    contentLoading,
    editStats,
    charsWarning,
    draftSavedAt,
    draftRestored,
    editError,
    handleDiscardDraft,
    handleCancelEdit,
    setSplitPreview,
    splitPreview,
    handleSaveEdit,
    editSaving,
    editContent,
    skillScrollRef,
    contentError,
    client,
    setContentLoading,
    setContentError,
    uninstallConfirmSkill,
    uninstalling,
    handleUninstallSkill,
  } = useSkillDetail(props0);

  if (!selectedSkill) {
    return (
      <EmptyState
        icon={<BookOpen className="h-6 w-6" />}
        title={t('activity:skillDetail.noSkillSelected')}
        description={t('activity:skillDetail.selectSkillHint')}
        action={{ label: t('activity:skillDetail.goToChat'), onClick: handleClose }}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden bg-[hsl(var(--surface-2)/0.45)] p-3',
        className,
      )}
    >
      {/* Header */}
      <div className="shrink-0 rounded-xl border border-border/70 bg-card/75 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <h1 className="min-w-0 truncate text-base font-semibold">{selectedSkill.name}</h1>
              {selectedSkill.version && (
                <span className="text-xs text-muted-foreground">v{selectedSkill.version}</span>
              )}
              <ScopeBadge source={selectedSkill.source} />
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {selectedSkill.description || selectedSkill.trigger}
            </p>

            {/* Source URL */}
            {selectedSkill.sourceUrl && (
              <div className="mt-2 flex min-w-0 items-center gap-1">
                <a
                  href={`https://${selectedSkill.sourceUrl.replace('github:', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  title={t('activity:skillDetail.openSourceRepo')}
                >
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{selectedSkill.sourceUrl}</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopySourceUrl}
                  className="flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
                  title={t('activity:skillDetail.copySourceUrl')}
                >
                  {copiedSourceUrl ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            )}

            {/* Trigger keywords */}
            {selectedSkill.scope.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedSkill.scope.map((s) => (
                  <span
                    key={s}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}

            {/* Update result */}
            {updateResult && (
              <div className="mt-2 text-xs space-y-1">
                {updateResult.updated.length > 0 && (
                  <div className="text-success">
                    {t('activity:skillDetail.updatedLabel', {
                      list: updateResult.updated
                        .map((u) => `${u.name} (${u.oldRef} → ${u.newRef})`)
                        .join(', '),
                    })}
                  </div>
                )}
                {updateResult.unchanged.length > 0 && (
                  <div className="text-muted-foreground">
                    {t('activity:skillDetail.upToDateLabel', {
                      list: updateResult.unchanged.join(', '),
                    })}
                  </div>
                )}
                {updateResult.errors.length > 0 && (
                  <div className="text-destructive">
                    {t('activity:skillDetail.errorsLabel', {
                      list: updateResult.errors
                        .map((e) => `${e.name ? `${e.name}: ` : ''}${e.error}`)
                        .join('; '),
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-1 lg:ml-auto lg:shrink-0 lg:justify-end">
            {/* Check for updates (WrongStack-managed installed skills only) */}
            {isWritableSkillSource(selectedSkill.source) && selectedSkill.sourceUrl && (
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={checkingForUpdates}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                title={t('activity:skillDetail.checkUpdatesTitle')}
              >
                {checkingForUpdates ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* Export (any non-bundled skill) */}
            {selectedSkill.source !== 'bundled' && !editMode && (
              <button
                type="button"
                onClick={handleExportSkill}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t('activity:skillDetail.exportTitle')}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Edit (WrongStack-managed only — foreign/bundled are read-only) */}
            {isWritableSkillSource(selectedSkill.source) && !editMode && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t('activity:skillDetail.editTitle')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Uninstall (WrongStack-managed only) */}
            {isWritableSkillSource(selectedSkill.source) && (
              <button
                type="button"
                onClick={() => setUninstallConfirmSkill(selectedSkill)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title={t('activity:skillDetail.uninstallTitle')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('activity:skillDetail.closeTitle')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Breadcrumb navigation */}
        {navHistory.length > 1 && (
          <div className="mt-3 flex min-w-0 items-center gap-1 rounded-lg border border-border/60 bg-muted/35 px-2 py-1">
            <button
              type="button"
              onClick={handleBreadcrumbBack}
              disabled={historyIndex <= 0}
              className={cn(
                'rounded p-1 transition-colors',
                historyIndex <= 0
                  ? 'text-muted-foreground/65 cursor-not-allowed'
                  : 'hover:bg-accent text-muted-foreground cursor-pointer',
              )}
              title={t('activity:skillDetail.backTitle')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleBreadcrumbForward}
              disabled={historyIndex >= navHistory.length - 1}
              className={cn(
                'rounded p-1 transition-colors',
                historyIndex >= navHistory.length - 1
                  ? 'text-muted-foreground/65 cursor-not-allowed'
                  : 'hover:bg-accent text-muted-foreground cursor-pointer',
              )}
              title={t('activity:skillDetail.forwardTitle')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-0.5 overflow-x-auto text-xs">
              {navHistory.map((skill, idx) => (
                <span key={skill.name + idx} className="flex items-center shrink-0">
                  {idx > 0 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/65 mx-0.5 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (idx < historyIndex) {
                        isNavigatingBack.current = true;
                        setSkillsState({
                          ...skillsStateRef.current,
                          selectedSkill: skill,
                          historyIndex: idx,
                        });
                        setEditMode(false);
                        setEditContent('');
                        setUpdateResult(null);
                      }
                    }}
                    className={cn(
                      'hover:text-primary cursor-pointer transition-colors',
                      idx === historyIndex ? 'text-primary font-medium' : 'text-muted-foreground',
                    )}
                  >
                    {skill.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Related files + References bar */}
      {skillContent &&
        (skillContent.relatedFiles.length > 0 || skillContent.references.length > 0) && (
          <div className="shrink-0 space-y-2 rounded-xl border border-border/70 bg-card/70 px-4 py-3 shadow-sm">
            {skillContent.relatedFiles.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <FolderOpen className="h-3 w-3" />
                  <span className="font-medium uppercase tracking-wide">
                    {t('activity:skillDetail.relatedFiles')}
                  </span>
                </div>
                {skillContent.relatedFiles.map((file) => {
                  const derivedName = skillNameFromFile(file);
                  const linkedSkill = derivedName ? findSkillByName(derivedName) : undefined;
                  return linkedSkill ? (
                    <button
                      key={file}
                      type="button"
                      onClick={() => handleNavigateToSkill(derivedName!)}
                      className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] transition-colors hover:border-primary/40 hover:text-primary"
                      title={t('activity:skillDetail.goToSkillTitle', { name: derivedName! })}
                    >
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      {file}
                    </button>
                  ) : (
                    <span
                      key={file}
                      className="rounded-md border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {file}
                    </span>
                  );
                })}
              </div>
            )}

            {skillContent.references.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span className="font-medium uppercase tracking-wide">
                    {t('activity:skillDetail.references')}
                  </span>
                </div>
                {skillContent.references.map((ref) => {
                  const derivedName = skillNameFromFile(ref) ?? ref.replace(/\.md$/, '');
                  const linkedSkill = findSkillByName(derivedName);
                  return linkedSkill ? (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => handleNavigateToSkill(derivedName)}
                      className="inline-flex min-w-0 items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary transition-colors hover:border-primary/30 hover:bg-primary/10"
                      title={t('activity:skillDetail.goToSkillTitle', { name: derivedName })}
                    >
                      <ArrowUpRight className="h-2.5 w-2.5" />
                      {derivedName}
                    </button>
                  ) : (
                    <span
                      key={ref}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {derivedName}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

      {/* Content */}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm">
        {contentLoading ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
            <p>{t('activity:skillDetail.loadingContent')}</p>
          </div>
        ) : editMode ? (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            {/* Edit toolbar */}
            <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 bg-muted/30 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  {t('activity:skillDetail.editingLabel', { name: selectedSkill.name })}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('activity:skillDetail.editStats', {
                    lines: editStats.lines,
                    words: editStats.words,
                    chars: editStats.chars,
                  })}
                </span>
                {charsWarning && (
                  <span
                    className={`text-xs tabular-nums ${
                      charsWarning.level === 'critical'
                        ? 'font-medium text-destructive'
                        : 'text-warning'
                    }`}
                  >
                    {t('activity:skillDetail.charsWarningFmt', {
                      used: (charsWarning.used / (1024 * 1024)).toFixed(1),
                      limit: (charsWarning.limit / (1024 * 1024)).toFixed(0),
                    })}
                  </span>
                )}
                {draftSavedAt && (
                  <span className="text-xs text-success animate-pulse">
                    {t('activity:skillDetail.draftSaved')}
                  </span>
                )}
                {draftRestored && (
                  <span className="animate-pulse text-xs text-warning">
                    {t('activity:skillDetail.draftRestored')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {editError && <span className="text-xs text-destructive">{editError}</span>}
                {draftRestored && (
                  <button
                    type="button"
                    onClick={handleDiscardDraft}
                    className="rounded-md border border-warning/35 px-2 py-1 text-[10px] text-warning transition-colors hover:bg-warning/10"
                  >
                    {t('activity:skillDetail.discardDraft')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-md border border-border/70 px-2 py-1 text-xs transition-colors hover:bg-accent"
                >
                  {t('common:action.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => setSplitPreview((v) => !v)}
                  title={
                    splitPreview
                      ? t('activity:skillDetail.hidePreviewTitle')
                      : t('activity:skillDetail.splitViewTitle')
                  }
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    splitPreview
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/70 text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <PanelRight className="h-3 w-3 inline" />
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editSaving || !editContent.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground shadow-sm shadow-primary/15 transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {editSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : (
                    t('common:action.save')
                  )}
                </button>
              </div>
            </div>

            {/* Edit textarea */}
            {splitPreview ? (
              <div className="flex flex-1 min-h-0 gap-0.5">
                <div className="flex-1 min-w-0 flex flex-col min-h-0">
                  <Suspense fallback={null}>
                    <TextareaCodeEditor
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value ?? '')}
                      language="markdown"
                      className="flex-1"
                      style={{
                        fontSize: scaledPx(12),
                        fontFamily: 'var(--font-editor)',
                        backgroundColor: 'transparent',
                        minHeight: 0,
                      }}
                      placeholder={t('activity:skillDetail.contentPlaceholder')}
                    />
                  </Suspense>
                </div>
                <div className="w-px bg-border flex-shrink-0" />
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-background/45 p-4 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
                    {editContent}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <Suspense fallback={null}>
                <TextareaCodeEditor
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value ?? '')}
                  language="markdown"
                  className="flex-1"
                  style={{
                    fontSize: scaledPx(12),
                    fontFamily: 'var(--font-editor)',
                    backgroundColor: 'transparent',
                    minHeight: 0,
                  }}
                  placeholder={t('activity:skillDetail.contentPlaceholder')}
                />
              </Suspense>
            )}
          </div>
        ) : skillContent ? (
          <div
            ref={skillScrollRef}
            className="h-full min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 prose prose-sm dark:prose-invert max-w-none"
          >
            <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
              {skillContent.body}
            </ReactMarkdown>
          </div>
        ) : contentError ? (
          <div className="flex h-full min-h-[16rem] flex-col items-center justify-center p-8 text-center">
            <p className="text-destructive mb-2">{t('activity:skillDetail.loadFailed')}</p>
            <p className="text-xs text-muted-foreground">{contentError}</p>
            <button
              type="button"
              onClick={() => {
                if (client && selectedSkill) {
                  setContentLoading(true);
                  setContentError(null);
                  client.send({
                    type: 'skills.content',
                    payload: { name: selectedSkill.name, source: selectedSkill.source },
                  });
                }
              }}
              className="mt-4 rounded-md border border-border/70 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            >
              {t('common:action.retry')}
            </button>
          </div>
        ) : (
          <div className="flex h-full min-h-[16rem] items-center justify-center p-8 text-center text-muted-foreground">
            {t('activity:skillDetail.noContent')}
          </div>
        )}
      </div>

      {/* Uninstall confirmation modal */}
      <Dialog
        open={!!uninstallConfirmSkill}
        onOpenChange={(v) => {
          if (!v) setUninstallConfirmSkill(null);
        }}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] w-[380px] max-w-[90vw] flex-col gap-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          <DialogHeader className="flex shrink-0 items-center justify-between border-b border-border/70 p-4 sm:flex-row sm:justify-between sm:space-y-0">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              <DialogTitle className="font-semibold text-sm">
                {t('activity:skillDetail.uninstallSkillHeading')}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => setUninstallConfirmSkill(null)}
              aria-label={t('common:action.close')}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
            <p className="text-sm">
              {uninstallConfirmSkill &&
                t('activity:skillDetail.uninstallConfirm', { name: uninstallConfirmSkill.name })}
            </p>
            <p className="text-xs text-muted-foreground">
              {uninstallConfirmSkill &&
                t('activity:skillDetail.uninstallRemovePath', {
                  path: uninstallConfirmSkill.path,
                })}
            </p>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 bg-muted/20 p-4">
            <button
              type="button"
              onClick={() => setUninstallConfirmSkill(null)}
              disabled={uninstalling}
              className="rounded-md border border-border/70 px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              {t('common:action.cancel')}
            </button>
            <button
              type="button"
              onClick={() => uninstallConfirmSkill && handleUninstallSkill(uninstallConfirmSkill)}
              disabled={uninstalling}
              className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uninstalling && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('activity:skillDetail.uninstallAction')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
