import { FileText, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { i18n, useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ListenOnce, SkillsWsClient } from './use-skills-one-shot.js';

/** Create-skill modal state + the `skills.create` request. */
export function useSkillCreateForm(client: SkillsWsClient, listenOnce: ListenOnce) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createScope, setCreateScope] = useState<'project' | 'global'>('project');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Handle create
  const handleCreateSkill = useCallback(() => {
    if (!client || !createName.trim() || !createDescription.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    listenOnce(
      'skills.created',
      (msg) => {
        const m = msg as {
          payload: {
            success: boolean;
            error: string | null;
            skill?: { name: string; path: string; scope: string };
          };
        };
        setCreating(false);
        if (m.payload.success) {
          setCreateSuccess(
            i18n.t('activity:skillsList.createdMsg', { name: m.payload.skill?.name ?? '' }),
          );
          client.send({ type: 'skills.list' }, { echoToChat: false });
        } else {
          setCreateError(m.payload.error ?? i18n.t('activity:skillsList.createFailed'));
        }
      },
      () => {
        setCreating(false);
        setCreateError(i18n.t('activity:skillsList.createFailed'));
      },
    );
    client.createSkill(createName.trim(), createDescription.trim(), createScope);
  }, [client, createName, createDescription, createScope, listenOnce]);

  /** Reset the form and open the modal (the rail's "new skill" button). */
  const openCreateModal = useCallback(() => {
    setCreateName('');
    setCreateDescription('');
    setCreateScope('project');
    setCreateError(null);
    setCreateSuccess(null);
    setCreateModalOpen(true);
  }, []);

  return {
    createModalOpen,
    setCreateModalOpen,
    createName,
    setCreateName,
    createDescription,
    setCreateDescription,
    createScope,
    setCreateScope,
    creating,
    createError,
    setCreateError,
    createSuccess,
    setCreateSuccess,
    handleCreateSkill,
    openCreateModal,
  };
}

/** Modal: scaffold a new SKILL.md (name, trigger description, scope). */
export function SkillCreateDialog({ form }: { form: ReturnType<typeof useSkillCreateForm> }) {
  const { t } = useAppTranslation();
  const {
    createModalOpen,
    setCreateModalOpen,
    createName,
    setCreateName,
    createDescription,
    setCreateDescription,
    createScope,
    setCreateScope,
    creating,
    createError,
    setCreateError,
    createSuccess,
    setCreateSuccess,
    handleCreateSkill,
  } = form;
  return (
    <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[480px] max-w-[90vw] flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="flex shrink-0 items-center justify-between border-b border-border/70 p-4 sm:flex-row sm:justify-between sm:space-y-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <DialogTitle className="font-semibold text-sm">
              {t('activity:skillsList.createHeading')}
            </DialogTitle>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(false)}
            aria-label={t('common:action.close')}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t('activity:skillsList.createHint')}</p>

          {/* Skill name */}
          <div>
            <span className="block text-xs font-medium mb-1">
              {t('activity:skillsList.nameLabel')} <span className="text-destructive">*</span>
            </span>
            <input
              type="text"
              value={createName}
              onChange={(e) => {
                const val = e.target.value
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, '-')
                  .replace(/[^a-z0-9-]/g, '');
                setCreateName(val);
                setCreateError(null);
                setCreateSuccess(null);
              }}
              placeholder={t('activity:skillsList.namePlaceholder')}
              className="w-full rounded-md border border-border/70 bg-background/70 px-3 py-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description / trigger */}
          <div>
            <span className="block text-xs font-medium mb-1">
              {t('activity:skillsList.descLabel')} <span className="text-destructive">*</span>
            </span>
            <textarea
              value={createDescription}
              onChange={(e) => {
                setCreateDescription(e.target.value);
                setCreateError(null);
                setCreateSuccess(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !creating) handleCreateSkill();
              }}
              placeholder={t('activity:skillsList.descPlaceholder')}
              rows={4}
              className="w-full resize-y rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Scope toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('activity:skillsList.saveIn')}</span>
            <div className="flex overflow-hidden rounded-md border border-border/70">
              <button
                type="button"
                onClick={() => setCreateScope('project')}
                className={cn(
                  'px-2 py-1 text-[10px] transition-colors',
                  createScope === 'project'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                {t('activity:skillDetail.scopeProject')}
              </button>
              <button
                type="button"
                onClick={() => setCreateScope('global')}
                className={cn(
                  'px-2 py-1 text-[10px] transition-colors border-l border-border',
                  createScope === 'global'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                {t('activity:skillDetail.scopeGlobal')}
              </button>
            </div>
          </div>

          {createError && (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {createError}
            </p>
          )}
          {createSuccess && (
            <p className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">
              {createSuccess}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 bg-muted/20 p-4">
          <button
            type="button"
            onClick={() => setCreateModalOpen(false)}
            className="rounded-md border border-border/70 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            {createSuccess ? t('common:action.close') : t('common:action.cancel')}
          </button>
          {!createSuccess && (
            <button
              type="button"
              onClick={handleCreateSkill}
              disabled={creating || !createName.trim() || !createDescription.trim()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('activity:skillsList.createBtn')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
