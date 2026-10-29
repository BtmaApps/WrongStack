import { useCallback, useEffect, useState } from 'react';
import type { EngineCommand } from './engine-operations';
import { record } from './engine-values';

export interface ModelProfileIdentity {
  id: string;
  name: string;
}
export function readModelProfile(value: unknown): ModelProfileIdentity {
  const profile = record(value);
  if (
    typeof profile['id'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(profile['id']) ||
    typeof profile['name'] !== 'string' ||
    !profile['name'].trim() ||
    profile['name'].length > 256
  )
    throw Error(
      'The profile engine did not report a verified profile identity. Update or reconnect its runtime before editing model definitions.',
    );
  return { id: profile['id'], name: profile['name'] };
}
export async function verifyModelProfile(command: EngineCommand, expected?: ModelProfileIdentity) {
  const reply = await command('prefs.get', {}, ['prefs.updated', 'key.operation_result']);
  const profile = readModelProfile(reply['profileIdentity']);
  if (expected && profile.id !== expected.id)
    throw Error(
      'The profile runtime changed. Your draft remains with its original profile. Reopen model settings before applying it.',
    );
  return profile;
}
export function useModelProfile(command: EngineCommand) {
  const [profile, setProfile] = useState<ModelProfileIdentity | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError('');
    void verifyModelProfile(command)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [command, attempt]);
  return { profile, error, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}
