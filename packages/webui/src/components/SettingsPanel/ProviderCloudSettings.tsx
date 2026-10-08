import {
  cloudFieldsForProvider,
  type NativeCloudSettings,
  parseNativeCloudSettings,
} from '@wrongstack/core/cloud-provider';
import { useEffect, useRef, useState } from 'react';
import { useAppTranslation } from '@/i18n';
import { requestAuthOperation } from '@/lib/auth-operation';
import type { WrongStackWebSocketClient } from '@/lib/ws-client';

export function ProviderCloudSettings({
  id,
  type,
  cloud,
  ws,
}: {
  id: string;
  type: string;
  cloud?: NativeCloudSettings | undefined;
  ws: WrongStackWebSocketClient;
}) {
  const [draft, setDraft] = useState<NativeCloudSettings>(cloud ?? {});
  const { t } = useAppTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = useRef(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!dirty.current) setDraft(cloud ?? {});
  }, [cloud]);
  useEffect(() => () => pending.current?.abort(), []);
  const fields = cloudFieldsForProvider(type);
  if (!fields.length) return null;
  return (
    <details className="rounded-lg border border-border p-3">
      <summary>
        {t('activity:providerCloud.heading', { defaultValue: 'Cloud routing settings' })}
      </summary>
      <p className="text-xs text-muted-foreground">
        Profile values override environment defaults. Empty values use the environment. Credentials
        are managed separately.
      </p>
      {fields.map((field) => (
        <label key={field} className="block text-sm">
          {field}
          <input
            className="block w-full border bg-background p-1"
            maxLength={128}
            value={draft[field] ?? ''}
            onChange={(event) => {
              dirty.current = true;
              setDraft((value) => ({ ...value, [field]: event.target.value }));
            }}
          />
        </label>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          try {
            const value = parseNativeCloudSettings(draft);
            const controller = new AbortController();
            pending.current?.abort();
            pending.current = controller;
            setBusy(true);
            setMessage('');
            const success = await requestAuthOperation(
              ws,
              { type: 'provider.update', payload: { id, cloud: value } },
              controller.signal,
              () => {},
            );
            if (controller.signal.aborted) return;
            if (success) {
              dirty.current = false;
              ws.send({ type: 'providers.saved' });
            }
            setMessage(
              success
                ? 'Saved. Re-select the provider or restart to use the new settings.'
                : 'Cloud settings could not be saved.',
            );
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Invalid cloud settings');
          } finally {
            if (!pending.current?.signal.aborted) setBusy(false);
          }
        }}
      >
        Save cloud settings
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
