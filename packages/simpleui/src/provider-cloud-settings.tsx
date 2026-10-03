import {
  cloudFieldsForProvider,
  type NativeCloudSettings,
  parseNativeCloudSettings,
} from '@wrongstack/core/cloud-provider';
import { useEffect, useRef, useState } from 'react';

export function ProviderCloudSettings({
  type,
  cloud,
  busy,
  onSave,
}: {
  type: string;
  cloud?: NativeCloudSettings | undefined;
  busy: boolean;
  onSave: (cloud: NativeCloudSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NativeCloudSettings>(cloud ?? {});
  const [error, setError] = useState('');
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(cloud ?? {});
  }, [cloud]);
  const fields = cloudFieldsForProvider(type);
  if (!fields.length) return null;
  return (
    <details>
      <summary>Cloud routing settings</summary>
      <p>
        Profile values override environment defaults. Empty fields use the environment. Credentials
        are managed separately.
      </p>
      {fields.map((field) => (
        <label key={field}>
          {field}
          <input
            maxLength={128}
            disabled={busy}
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
            setError('');
            await onSave(value);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Invalid cloud settings');
          }
        }}
      >
        Save cloud settings
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
