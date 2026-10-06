import { Download, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { i18n, useAppTranslation } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ListenOnce, SkillsWsClient } from './use-skills-one-shot.js';

/** Install-skill modal state + the `skills.install` request. */
export function useSkillInstallForm(client: SkillsWsClient, listenOnce: ListenOnce) {
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installRef, setInstallRef] = useState('');
  const [installGlobal, setInstallGlobal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  // Handle install
  const handleInstallSkill = useCallback(() => {
    if (!client || !installRef.trim()) return;
    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(null);

    listenOnce(
      'skills.installed',
      (msg) => {
        const m = msg as {
          payload: { success: boolean; error: string | null; results?: Array<{ name: string }> };
        };
        setInstalling(false);
        if (m.payload.success) {
          const names = m.payload.results?.map((r) => r.name).join(', ') ?? installRef;
          setInstallSuccess(i18n.t('activity:skillsList.installedMsg', { names }));
          client.send({ type: 'skills.list' }, { echoToChat: false });
        } else {
          setInstallError(m.payload.error ?? i18n.t('activity:skillsList.installFailed'));
        }
      },
      () => {
        setInstalling(false);
        setInstallError(i18n.t('activity:skillsList.installFailed'));
      },
    );
    client.installSkill(installRef.trim(), installGlobal);
  }, [client, installRef, installGlobal, listenOnce]);

  /** Reset the form and open the modal (the rail's "+" button). */
  const openInstallModal = useCallback(() => {
    setInstallRef('');
    setInstallError(null);
    setInstallSuccess(null);
    setInstallGlobal(false);
    setInstallModalOpen(true);
  }, []);

  return {
    installModalOpen,
    setInstallModalOpen,
    installRef,
    setInstallRef,
    installGlobal,
    setInstallGlobal,
    installing,
    installError,
    setInstallError,
    installSuccess,
    setInstallSuccess,
    handleInstallSkill,
    openInstallModal,
  };
}

/** Modal: install a skill from a git/URL reference into the project or global scope. */
export function SkillInstallDialog({ form }: { form: ReturnType<typeof useSkillInstallForm> }) {
  const { t } = useAppTranslation();
  const {
    installModalOpen,
    setInstallModalOpen,
    installRef,
    setInstallRef,
    installGlobal,
    setInstallGlobal,
    installing,
    installError,
    setInstallError,
    installSuccess,
    setInstallSuccess,
    handleInstallSkill,
  } = form;
  return (
    <Dialog open={installModalOpen} onOpenChange={setInstallModalOpen}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[420px] max-w-[90vw] flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="flex shrink-0 items-center justify-between border-b border-border/70 p-4 sm:flex-row sm:justify-between sm:space-y-0">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <DialogTitle className="font-semibold text-sm">
              {t('activity:skillsList.installHeading')}
            </DialogTitle>
          </div>
          <button
            type="button"
            onClick={() => setInstallModalOpen(false)}
            aria-label={t('common:action.close')}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t('activity:skillsList.installHint')}</p>
          <input
            type="text"
            value={installRef}
            onChange={(e) => {
              setInstallRef(e.target.value);
              setInstallError(null);
              setInstallSuccess(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !installing) handleInstallSkill();
            }}
            placeholder={t('activity:skillsList.installPlaceholder')}
            className="w-full rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Scope toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('activity:skillsList.installScope')}
            </span>
            <div className="flex overflow-hidden rounded-md border border-border/70">
              <button
                type="button"
                onClick={() => setInstallGlobal(false)}
                className={cn(
                  'px-2 py-1 text-[10px] transition-colors',
                  !installGlobal
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                {t('activity:skillDetail.scopeProject')}
              </button>
              <button
                type="button"
                onClick={() => setInstallGlobal(true)}
                className={cn(
                  'px-2 py-1 text-[10px] transition-colors border-l border-border',
                  installGlobal
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                {t('activity:skillDetail.scopeGlobal')}
              </button>
            </div>
          </div>

          {installError && (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {installError}
            </p>
          )}
          {installSuccess && (
            <p className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">
              {installSuccess}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 bg-muted/20 p-4">
          <button
            type="button"
            onClick={() => setInstallModalOpen(false)}
            className="rounded-md border border-border/70 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            {installSuccess ? t('common:action.close') : t('common:action.cancel')}
          </button>
          {!installSuccess && (
            <button
              type="button"
              onClick={handleInstallSkill}
              disabled={installing || !installRef.trim()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {installing && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('activity:skillsList.installBtn')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
