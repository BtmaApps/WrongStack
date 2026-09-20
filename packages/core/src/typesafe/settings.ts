import { readFile } from 'node:fs/promises';
import { encryptConfigSecrets } from '../security/config-secrets.js';
import type { Config, ConfigStore } from '../types/config/root.js';
import type { SecretVault } from '../types/secret-vault.js';
import { atomicWrite, withFileLock } from '../utils/index.js';
import { TYPESAFE_JUDGMENT_FEATURES } from './judgments.js';
import { resolveTypeSafeAccount, resolveTypeSafeRoute } from './resolve.js';
import { isTypeSafeRoute, TYPESAFE_ROUTES } from './route.js';

export const JEV_FEATURES = [
  ...TYPESAFE_JUDGMENT_FEATURES,
  'skillSuggestion',
  'fleetDispatch',
] as const;
export type JevFeature = (typeof JEV_FEATURES)[number];
export interface JevSettingsPatch {
  route?: 'typesafe' | 'openrouter' | 'custom';
  apiKey?: string | null;
  endpoint?: string | null;
  model?: string | null;
  requestTimeoutMs?: number;
  features?: Partial<Record<JevFeature, boolean>>;
}

export function validateJevSettingsPatch(value: unknown): JevSettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a Jev settings object');
  const patch = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(patch)) {
    if (key === 'route') {
      if (!isTypeSafeRoute(val)) throw new Error('Invalid Jev route');
    } else if (['apiKey', 'endpoint', 'model'].includes(key)) {
      if (val !== null && (typeof val !== 'string' || !val.trim() || val.length > 4096))
        throw new Error(`Invalid Jev ${key}`);
    } else if (key === 'requestTimeoutMs') {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 100 || val > 120000)
        throw new Error('Timeout must be 100–120000 ms');
    } else if (key === 'features') {
      if (!val || typeof val !== 'object' || Array.isArray(val))
        throw new Error('Invalid Jev features');
      for (const [feature, enabled] of Object.entries(val)) {
        if (!(JEV_FEATURES as readonly string[]).includes(feature) || typeof enabled !== 'boolean')
          throw new Error('Invalid Jev feature');
      }
    } else throw new Error('Unknown Jev setting');
  }
  if (typeof patch['endpoint'] === 'string') {
    let url: URL;
    try {
      url = new URL(patch['endpoint']);
    } catch {
      throw new Error('Invalid endpoint URL');
    }
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    )
      throw new Error('Endpoint must be HTTP(S), without credentials, query or fragment');
  }
  return patch as JevSettingsPatch;
}

function apply(config: Partial<Config>, patch: JevSettingsPatch): Partial<Config> {
  const typesafe = { ...config.typesafe };
  if (patch.route && patch.route !== resolveTypeSafeRoute(config, {})) {
    delete typesafe.apiKey;
    delete typesafe.endpoint;
    delete typesafe.model;
  }
  for (const key of ['route', 'apiKey', 'endpoint', 'model', 'requestTimeoutMs'] as const) {
    if (!(key in patch)) continue;
    const val = patch[key];
    if (val === null) delete typesafe[key];
    else Object.assign(typesafe, { [key]: val });
  }
  const next: Partial<Config> = { typesafe };
  if (patch.features) {
    typesafe.judgments = { ...typesafe.judgments };
    for (const feature of TYPESAFE_JUDGMENT_FEATURES) {
      if (patch.features[feature] !== undefined)
        typesafe.judgments[feature] = patch.features[feature];
    }
    if (patch.features.skillSuggestion !== undefined)
      next.skills = {
        ...config.skills,
        suggest: { ...config.skills?.suggest, enabled: patch.features.skillSuggestion },
      };
    if (patch.features.fleetDispatch !== undefined)
      next.fleet = {
        ...config.fleet,
        dispatch: { ...config.fleet?.dispatch, typesafeClassifier: patch.features.fleetDispatch },
      };
  }
  if (typesafe.route === 'custom' && !typesafe.endpoint)
    throw new Error('Custom route requires an endpoint');
  return next;
}

export function jevSettingsSnapshot(config: Readonly<Config>) {
  const account = resolveTypeSafeAccount({ config });
  const route = resolveTypeSafeRoute(config, process.env);
  const spec = route === 'custom' ? undefined : TYPESAFE_ROUTES[route];
  let endpoint = '';
  try {
    const url = new URL(config.typesafe?.endpoint ?? spec?.url ?? '');
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    endpoint = url.href;
  } catch {
    /* Invalid legacy endpoints are not echoed to clients. */
  }
  return {
    status: account.status,
    reason: account.status === 'ready' ? undefined : account.reason,
    route,
    model: config.typesafe?.model ?? spec?.model ?? '',
    endpoint,
    requestTimeoutMs: config.typesafe?.requestTimeoutMs ?? 4000,
    keySource: account.status === 'ready' ? account.keySource : 'none',
    features: Object.fromEntries(
      JEV_FEATURES.map((key) => [
        key,
        key === 'skillSuggestion'
          ? config.skills?.suggest?.enabled === true
          : key === 'fleetDispatch'
            ? config.fleet?.dispatch?.typesafeClassifier === true
            : config.typesafe?.judgments?.[key] !== false,
      ]),
    ) as Record<JevFeature, boolean>,
  };
}

/** Patch disk under its shared lock, preserve unrelated fields and ciphertext, then publish live. */
export async function saveJevSettings(
  store: ConfigStore,
  file: string,
  vault: SecretVault | undefined,
  value: unknown,
): Promise<void> {
  const patch = validateJevSettingsPatch(value);
  if (patch.apiKey && !vault) throw new Error('Secret vault unavailable');
  // Validate before opening the write transaction.
  apply(store.get(), patch);
  await withFileLock(file, async () => {
    let raw: Partial<Config>;
    try {
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Cannot read profile configuration');
      raw = {};
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Invalid profile configuration');
    const next = apply(raw, patch);
    const safe = vault ? encryptConfigSecrets(next, vault) : next;
    await atomicWrite(file, JSON.stringify({ ...raw, ...safe }, null, 2), { mode: 0o600 });
    store.update(apply(store.get(), patch));
  });
}

export async function testJevConnection(config: Readonly<Config>): Promise<string> {
  const account = resolveTypeSafeAccount({ config, restGate: null });
  if (account.status !== 'ready') throw new Error(account.reason);
  const result = await account.client.systemOne(
    {
      activityFeature: 'connectionTest',
      state: { value: 2 },
      questions: { check: { type: 'noul', instructions: 'Is value equal to 2?' } },
    },
    AbortSignal.timeout(10000),
  );
  if (result.answers['check']?.type !== 'noul')
    throw new Error('Jev returned no valid test answer');
  return `Connected · ${result.model ?? account.model} · ${result.usage.inputTokens} input tokens`;
}
