import { BookText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { useConfigStore } from '@/stores/config-store';
import type { WSUserInstructions } from '@/types/server-message-system';
import { Button } from '../ui/button';

/**
 * Editor for `~/.wrongstack/AGENTS.md`: the user's own rules, put into the
 * system prompt of every project ahead of the project's AGENTS.md. The prompt
 * builder re-reads the file on change, so a save applies from the next turn.
 */
export function UserInstructionsSection(): React.ReactElement {
  const { t } = useAppTranslation();
  const wsUrl = useConfigStore((state) => state.wsUrl);
  const client = getWSClient(wsUrl);
  const [doc, setDoc] = useState<WSUserInstructions | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = doc !== null && draft !== (doc.text ?? '');

  useEffect(() => {
    const off = client.on('user_instructions', (message) => {
      const next = message.payload as WSUserInstructions;
      setBusy(false);
      if (next.error) {
        setError(next.error);
        return;
      }
      setError('');
      setDoc(next);
      setDraft(next.text ?? '');
      setSaved(next.saved === true);
    });
    client.send({ type: 'user_instructions.get' });
    return off;
  }, [client]);

  const reload = () => {
    if (dirty && !window.confirm(t('settings:context.userInstructions.discard'))) return;
    setBusy(true);
    setSaved(false);
    client.send({ type: 'user_instructions.get' });
  };
  const save = () => {
    if (!doc) return;
    setBusy(true);
    setSaved(false);
    client.send({
      type: 'user_instructions.save',
      payload: { text: draft, baseMtimeMs: doc.mtimeMs ?? null },
    });
  };

  return (
    <div
      className="rounded-xl border border-border/70 bg-card/80 p-5 shadow-sm"
      data-testid="user-instructions-section"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <BookText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {t('settings:context.userInstructions.heading')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('settings:context.userInstructions.hint')}
          </p>
          {doc?.displayPath && (
            <code className="mt-1 block break-all text-[11px] text-muted-foreground">
              {doc.displayPath}
              {doc.exists === false && ` — ${t('settings:context.userInstructions.missing')}`}
            </code>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <textarea
        aria-label={t('settings:context.userInstructions.heading')}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
        }}
        disabled={doc === null}
        spellCheck={false}
        placeholder={t('settings:context.userInstructions.placeholder')}
        className="min-h-64 max-h-[60dvh] w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"
        data-testid="user-instructions-text"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          {t('settings:context.userInstructions.save')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={reload}>
          {t('settings:context.userInstructions.reload')}
        </Button>
        {saved && !dirty && (
          <span className="text-xs text-muted-foreground" role="status">
            {t('settings:context.userInstructions.saved')}
          </span>
        )}
      </div>
    </div>
  );
}
