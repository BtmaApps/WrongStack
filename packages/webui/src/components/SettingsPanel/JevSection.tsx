import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppTranslation } from '@/i18n';
import type { JevSettings, JevState } from '@/types/jev';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function JevSection() {
  const { client } = useWebSocket();
  const { t } = useAppTranslation();
  const [state, setState] = useState<JevState>({});
  const [form, setForm] = useState<JevSettings>();
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const prefix = useRef(crypto.randomUUID());
  const pending = useRef<string | undefined>(undefined);
  const initialRoute = useRef('');
  const saving = useRef(false);
  useEffect(() => {
    const off = client.on('jev.state', (msg) => {
      const next = msg.payload as JevState;
      if (!next.requestId?.startsWith(prefix.current)) return;
      const completed = next.requestId === pending.current;
      const saved = completed && saving.current && !next.error;
      setState((old) => ({
        ...next,
        message: completed ? next.message : old.message,
        error: completed ? next.error : (next.error ?? old.error),
      }));
      if (next.settings) {
        const settings = next.settings;
        setForm((old) => {
          if (old && !saved) return old;
          initialRoute.current = settings.route;
          return settings;
        });
      }
      if (next.requestId === pending.current) {
        pending.current = undefined;
        setBusy(false);
        if (saved) {
          setKey('');
          setRemoveKey(false);
        }
      }
    });
    const refresh = () =>
      client.send({ type: 'jev.get', payload: { requestId: `${prefix.current}:poll` } });
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [client]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => {
      pending.current = undefined;
      setBusy(false);
      setState((old) => ({ ...old, error: t('settings:jev.timeout') }));
    }, 15000);
    return () => clearTimeout(timer);
  }, [busy, t]);
  const send = (type: 'jev.set' | 'jev.test') => {
    if (!form) return;
    const requestId = `${prefix.current}:${crypto.randomUUID()}`;
    pending.current = requestId;
    saving.current = type === 'jev.set';
    setBusy(true);
    if (type === 'jev.test') client.send({ type, payload: { requestId } });
    else
      client.send({
        type,
        payload: {
          requestId,
          patch: {
            route: form.route,
            endpoint: form.endpoint.trim() || null,
            model: form.model.trim() || null,
            requestTimeoutMs: form.requestTimeoutMs,
            features: form.features,
            ...(key.trim() ? { apiKey: key.trim() } : removeKey ? { apiKey: null } : {}),
          },
        },
      });
  };
  const entries =
    state.activity?.entries.filter((entry) => !filter || entry.feature === filter) ?? [];
  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h3 className="font-semibold">TypeSafe / Jev</h3>
        <p className="text-sm text-muted-foreground">{t('settings:jev.description')}</p>
      </div>
      <p role="status" className="text-sm break-words">
        {state.settings
          ? `${state.settings.status} · ${state.settings.keySource}`
          : t('settings:jev.loading')}{' '}
        {state.settings?.reason}
      </p>
      {(state.error || state.message) && (
        <p role="status" className="text-sm break-words">
          {state.error ?? state.message}
        </p>
      )}
      {form && (
        <fieldset disabled={busy} className="space-y-3 min-w-0">
          <label className="block text-sm">
            {t('settings:jev.route')}
            <select
              className="mt-1 block w-full rounded border bg-background p-2"
              value={form.route}
              onChange={(e) => {
                setForm({ ...form, route: e.target.value, endpoint: '', model: '' });
                setKey('');
              }}
            >
              <option value="typesafe">TypeSafe</option>
              <option value="openrouter">OpenRouter Decisions</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {form.route !== initialRoute.current && (
            <p className="text-xs text-muted-foreground">{t('settings:jev.routeChange')}</p>
          )}
          <label htmlFor="jev-key" className="block text-sm">
            {t('settings:jev.key')}
            <Input
              id="jev-key"
              type="password"
              autoComplete="new-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t('settings:jev.keyHint')}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={removeKey}
              onChange={(e) => setRemoveKey(e.target.checked)}
            />
            {t('settings:jev.removeKey')}
          </label>
          <label htmlFor="jev-endpoint" className="block text-sm">
            {t('settings:jev.endpoint')}
            <Input
              id="jev-endpoint"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder={t('settings:jev.defaultHint')}
            />
          </label>
          <label htmlFor="jev-model" className="block text-sm">
            {t('settings:jev.model')}
            <Input
              id="jev-model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder={t('settings:jev.defaultHint')}
            />
          </label>
          <label htmlFor="jev-requestTimeout" className="block text-sm">
            {t('settings:jev.requestTimeout')}
            <Input
              id="jev-requestTimeout"
              type="number"
              min={100}
              max={120000}
              value={form.requestTimeoutMs}
              onChange={(e) => setForm({ ...form, requestTimeoutMs: Number(e.target.value) })}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t('settings:jev.featureHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(form.features).map(([feature, enabled]) => (
              <label key={feature} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      features: { ...form.features, [feature]: e.target.checked },
                    })
                  }
                />
                {t(`settings:jev.features.${feature}`)}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => send('jev.set')}>{t('settings:jev.save')}</Button>
            <Button variant="outline" onClick={() => send('jev.test')}>
              {t('settings:jev.test')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings:jev.testHint')}</p>
        </fieldset>
      )}
      <div className="space-y-3 border-t pt-4">
        <h4 className="font-semibold">{t('settings:jev.activity')}</h4>
        <p className="text-xs text-muted-foreground">{t('settings:jev.activityHint')}</p>
        {state.activity?.path && (
          <p className="break-all text-xs font-mono">{state.activity.path}</p>
        )}
        {state.activity?.writeError && <p role="alert">{state.activity.writeError}</p>}
        <label className="block text-sm">
          {t('settings:jev.filter')}
          <select
            className="ml-2 rounded border bg-background p-1"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">{t('settings:jev.all')}</option>
            {Object.keys(form?.features ?? {})
              .concat('connectionTest', 'evaluation')
              .map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
          </select>
        </label>
        {!entries.length && (
          <p className="text-sm text-muted-foreground">{t('settings:jev.empty')}</p>
        )}
        {entries.map((entry) => (
          <details key={entry.id} className="rounded border p-2 text-xs break-words">
            <summary className="cursor-pointer">
              {new Date(entry.at).toLocaleTimeString()} · {entry.feature} · {entry.outcome} ·{' '}
              {entry.durationMs} ms
            </summary>
            <p className="mt-2">
              {entry.route} / {entry.model} · {entry.inputTokens ?? 0} in /{' '}
              {entry.outputTokens ?? 0} out
            </p>
            <p>{entry.project}</p>
            <p>{entry.reason}</p>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(entry.answers ?? {}, null, 2)}
            </pre>
            <p>{entry.id}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
