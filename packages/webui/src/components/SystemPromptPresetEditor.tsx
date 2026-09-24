import { useEffect, useRef, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { getWSClient } from '@/lib/ws-client';
import { useConfigStore } from '@/stores/config-store';
import { useActiveSessionId } from '@/stores/session-lanes';
import type { WSSystemPromptPreset } from '@/types/server-message-system';
import { Button } from './ui/button';

type Variant = 'lite' | 'default' | 'pro';
type Library = {
  presets?: WSSystemPromptPreset[];
  active?: Partial<Record<Variant, string>>;
  projectActive?: Partial<Record<Variant, string>>;
  selectedId?: string;
  error?: string;
};
type Issue = { severity: 'error' | 'warning'; line: number; message: string };

/** Profile-wide prompt copies. The runtime still owns tool and environment layers. */
export function SystemPromptPresetEditor({
  currentVariant,
  onBusyChange,
  onDirtyChange,
}: {
  currentVariant: Variant;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useAppTranslation();
  const wsUrl = useConfigStore((state) => state.wsUrl);
  const sessionId = useActiveSessionId();
  const [library, setLibrary] = useState<Library>({});
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<{
    rendered: string;
    toolNames: string[];
    tier: string;
  } | null>(null);
  const requestId = useRef(0);
  const client = getWSClient(wsUrl);
  const presets = library.presets ?? [];
  const selected = presets.find((preset) => preset.id === selectedId);
  const dirty = !!selected && (name !== selected.name || text !== selected.text || reviewed);

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    const offLibrary = client.on('system_prompt.presets', (message) => {
      const next = message.payload as Library;
      setBusy(false);
      if (next.error) {
        setError(next.error);
        return;
      }
      setError('');
      setLibrary(next);
      if (next.selectedId) setSelectedId(next.selectedId);
    });
    const offValidation = client.on('system_prompt.preset_validation', (message) => {
      setIssues((message.payload as { issues: Issue[] }).issues);
    });
    const offPreview = client.on('system_prompt.preset_preview', (message) => {
      const result = message.payload as {
        rendered: string;
        toolNames: string[];
        tier: string;
        requestId: number;
      };
      if (result.requestId === requestId.current) setPreview(result);
    });
    client.send({
      type: 'system_prompt.presets.get',
      payload: { sessionId: sessionId ?? undefined },
    });
    return () => {
      offLibrary();
      offValidation();
      offPreview();
    };
  }, [client, sessionId]);

  useEffect(() => {
    setName(selected?.name ?? '');
    setText(selected?.text ?? '');
    setReviewed(false);
    setIssues([]);
    setPreview(null);
  }, [selected?.id, selected?.revision]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      client.send({ type: 'system_prompt.presets.validate', payload: { text } });
      const currentRequestId = ++requestId.current;
      client.send({
        type: 'system_prompt.presets.preview',
        payload: {
          text,
          sessionId: sessionId ?? undefined,
          requestId: currentRequestId,
        },
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [client, selected, sessionId, text]);

  const create = () => {
    const suggested = t('activity:systemPrompt.presets.suggestedName', {
      variant:
        currentVariant === 'default' ? 'Standard' : currentVariant === 'pro' ? 'Pro' : 'Lite',
    });
    setBusy(true);
    client.send({
      type: 'system_prompt.presets.create',
      payload: { name: suggested, baseVariant: currentVariant },
    });
  };
  const save = () => {
    if (!selected) return;
    setBusy(true);
    client.send({
      type: 'system_prompt.presets.save',
      payload: {
        id: selected.id,
        revision: selected.revision,
        name,
        text,
        reviewedCurrentSource: reviewed,
      },
    });
  };
  const activate = (scope: 'profile' | 'project') => {
    if (!selected) return;
    setBusy(true);
    const current = scope === 'profile' ? library.active : library.projectActive;
    client.send({
      type: 'system_prompt.presets.activate',
      payload: {
        id: current?.[selected.baseVariant] === selected.id ? undefined : selected.id,
        baseVariant: selected.baseVariant,
        sessionId: sessionId ?? undefined,
        scope,
      },
    });
  };
  const remove = () => {
    if (
      !selected ||
      !window.confirm(t('activity:systemPrompt.presets.confirmDelete', { name: selected.name }))
    )
      return;
    setBusy(true);
    client.send({ type: 'system_prompt.presets.delete', payload: { id: selected.id } });
    setSelectedId('');
  };
  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-label={t('activity:systemPrompt.presets.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('activity:systemPrompt.presets.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('activity:systemPrompt.presets.description')}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={create}>
          {t('activity:systemPrompt.presets.copy', {
            variant:
              currentVariant === 'default' ? 'Standard' : currentVariant === 'pro' ? 'Pro' : 'Lite',
          })}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <label className="block text-xs font-medium" htmlFor="system-preset-select">
        {t('activity:systemPrompt.presets.select')}
      </label>
      <select
        id="system-preset-select"
        value={selectedId}
        onChange={(event) => {
          if (dirty && !window.confirm(t('activity:systemPrompt.presets.discardChanges'))) return;
          setSelectedId(event.target.value);
        }}
        className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">{t('activity:systemPrompt.presets.selectPlaceholder')}</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} ({preset.baseVariant})
            {library.projectActive?.[preset.baseVariant] === preset.id
              ? ` — ${t('activity:systemPrompt.presets.activeProject')}`
              : library.active?.[preset.baseVariant] === preset.id
                ? ` — ${t('activity:systemPrompt.presets.activeProfile')}`
                : ''}
          </option>
        ))}
      </select>
      {selected && (
        <>
          <label className="block text-xs font-medium" htmlFor="system-preset-name">
            {t('activity:systemPrompt.presets.name')}
          </label>
          <input
            id="system-preset-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
          />
          {selected.sourceChanged && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              {t('activity:systemPrompt.presets.sourceChanged', { variant: selected.baseVariant })}
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                {t('activity:systemPrompt.presets.reviewed')}
              </label>
            </div>
          )}
          <label className="block text-xs font-medium" htmlFor="system-preset-text">
            {t('activity:systemPrompt.presets.template')}
          </label>
          <textarea
            id="system-preset-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            className="min-h-64 max-h-[40dvh] w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            <code>&lt;!--ws:if tool=read--&gt;</code> … <code>&lt;!--ws:end--&gt;</code> ·{' '}
            <code>{'{{tools:read,write}}'}</code>. {t('activity:systemPrompt.presets.syntax')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('activity:systemPrompt.presets.validationScope')}
          </p>
          {issues.length > 0 && (
            <ul
              className="space-y-1 text-xs"
              aria-label={t('activity:systemPrompt.presets.validation')}
            >
              {issues.map((issue, index) => (
                <li
                  key={`${issue.line}-${index}`}
                  className={issue.severity === 'error' ? 'text-destructive' : 'text-warning'}
                >
                  {t('activity:systemPrompt.presets.line', {
                    line: issue.line,
                    message: issue.message,
                  })}
                </li>
              ))}
            </ul>
          )}
          {preview && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                {t('activity:systemPrompt.presets.preview', {
                  count: preview.toolNames.length,
                  tier: preview.tier,
                })}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2">
                {preview.rendered || t('activity:systemPrompt.presets.previewEmpty')}
              </pre>
              <p className="mt-1 text-muted-foreground">
                {t('activity:systemPrompt.presets.previewNote')}
              </p>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !dirty || hasErrors} onClick={save}>
              {t('activity:systemPrompt.presets.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || dirty}
              onClick={() => activate('project')}
            >
              {library.projectActive?.[selected.baseVariant] === selected.id
                ? t('activity:systemPrompt.presets.deactivateProject')
                : t('activity:systemPrompt.presets.activateProject')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || dirty}
              onClick={() => activate('profile')}
            >
              {library.active?.[selected.baseVariant] === selected.id
                ? t('activity:systemPrompt.presets.deactivateProfile')
                : t('activity:systemPrompt.presets.activateProfile')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={
                busy ||
                library.active?.[selected.baseVariant] === selected.id ||
                library.projectActive?.[selected.baseVariant] === selected.id
              }
              onClick={remove}
            >
              {t('activity:systemPrompt.presets.delete')}
            </Button>
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer">
              {t('activity:systemPrompt.presets.compare')}
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-medium">
                  {t('activity:systemPrompt.presets.copiedSource')}
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border p-2">
                  {selected.baseText}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium">
                  {t('activity:systemPrompt.presets.currentSource')}
                </p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border p-2">
                  {selected.currentBaseText}
                </pre>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
