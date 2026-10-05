import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Regenerate the ChatGPT account entries (`openai-codex`, `openai-chatgpt`) of
 * the curated overlay `packages/cli/data/providers.json` from the LIVE account
 * catalog, so the guarantee layer is never hand-typed.
 *
 * Why the overlay carries these models at all: account discovery is the
 * authority, but it can hide models (a stale `client_version`, a failed or
 * empty snapshot, an older WrongStack binary). Installed binaries read this
 * overlay from GitHub `main`, so a model listed here stays visible -- with real
 * limits -- even where discovery cannot see it. A hand-maintained copy drifts,
 * so it is generated:
 *
 *   node scripts/sync-chatgpt-overlay.mjs            (report what would change; exit 1 if stale)
 *   node scripts/sync-chatgpt-overlay.mjs --write    (rewrite the two entries)
 *   node scripts/sync-chatgpt-overlay.mjs --catalog saved.json   (use a saved /codex/models body)
 *
 * Sources, field by field:
 *   - model set, name, description, context (max_context_window), input
 *     modalities, reasoning efforts: the account catalog (`/codex/models`,
 *     read with the signed-in `openai-codex` credential of the local profile);
 *   - output ceiling, knowledge cutoff, release date: models.dev `openai` for
 *     the same model id (the account catalog never states them);
 *   - never: per-token pricing (subscription usage is not billed per token).
 * Models the backend marks as retiring (`upgrade`) or hidden are left out: the
 * overlay guarantees visibility, and a retiring model must not outlive its
 * retirement here. Run after a Codex rollout, together with a
 * `CODEX_CLIENT_VERSION` check.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const OVERLAY_PATH = resolve(repoRoot, 'packages/cli/data/providers.json');
const ACCOUNT_PROVIDERS = ['openai-codex', 'openai-chatgpt'];
const KNOWN_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Pure mapping, exported for tests: live catalog entries + models.dev `openai`
 * models → overlay model entries, in the catalog's own (priority) order.
 */
export function buildChatGPTOverlayModels(catalogModels, openaiModels = {}) {
  const out = {};
  for (const entry of catalogModels) {
    if (!entry || typeof entry.slug !== 'string') continue;
    if (entry.visibility !== undefined && entry.visibility !== 'list') continue;
    if (entry.upgrade && typeof entry.upgrade.model === 'string') continue;
    const context = entry.max_context_window ?? entry.context_window;
    if (typeof context !== 'number' || context <= 0) continue;
    const ref = openaiModels[entry.slug] ?? {};
    const efforts = (entry.supported_reasoning_levels ?? [])
      .map((level) => level?.effort)
      .filter((effort) => KNOWN_EFFORTS.includes(effort));
    out[entry.slug] = {
      id: entry.slug,
      name: typeof entry.display_name === 'string' ? entry.display_name : entry.slug,
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      ...(ref.release_date ? { release_date: ref.release_date } : {}),
      ...(ref.knowledge ? { knowledge: ref.knowledge } : {}),
      reasoning: true,
      ...(efforts.length > 0 ? { reasoning_options: [{ type: 'effort', values: efforts }] } : {}),
      tool_call: true,
      modalities: {
        input: Array.isArray(entry.input_modalities) ? entry.input_modalities : ['text'],
        output: ['text'],
      },
      limit: {
        context,
        ...(typeof ref.limit?.output === 'number' ? { output: ref.limit.output } : {}),
      },
    };
  }
  return out;
}

async function liveCatalog() {
  const { DefaultSecretVault } = await import(
    pathToFileURL(resolve(repoRoot, 'packages/core/dist/security/index.js')).href
  );
  const { codexClientVersion } = await import(
    pathToFileURL(resolve(repoRoot, 'packages/providers/dist/oauth/index.js')).href
  );
  const home = join(homedir(), '.wrongstack');
  const active = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).activeProfile;
  const cfg = JSON.parse(
    readFileSync(join(home, 'profiles', active ?? 'default', 'config.json'), 'utf8'),
  );
  const provider = cfg.providers?.['openai-codex'];
  const key =
    provider?.apiKeys?.find((k) => k.label === provider.activeKey) ?? provider?.apiKeys?.[0];
  if (!key?.apiKey)
    throw new Error('No signed-in openai-codex account: run `wstack auth login chatgpt`.');
  const vault = new DefaultSecretVault({ keyFile: join(home, '.key') });
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${vault.decrypt(key.apiKey)}`,
    originator: 'wrongstack',
  };
  if (key.accountId) headers['chatgpt-account-id'] = vault.decrypt(key.accountId);
  const res = await fetch(
    `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(codexClientVersion())}`,
    { headers },
  );
  if (!res.ok)
    throw new Error(`Account catalog request failed: HTTP ${res.status} (sign in again if 401).`);
  return (await res.json()).models ?? [];
}

function openaiCatalog() {
  const file = join(homedir(), '.wrongstack', 'cache', 'models.dev.json');
  if (!existsSync(file)) return {};
  const cached = JSON.parse(readFileSync(file, 'utf8'));
  return (cached.payload ?? cached).openai?.models ?? {};
}

async function main(argv) {
  const write = argv.includes('--write');
  const catalogIndex = argv.indexOf('--catalog');
  const catalog =
    catalogIndex >= 0
      ? (JSON.parse(readFileSync(argv[catalogIndex + 1], 'utf8')).models ?? [])
      : await liveCatalog();
  const models = buildChatGPTOverlayModels(catalog, openaiCatalog());
  if (Object.keys(models).length === 0)
    throw new Error('Catalog produced no models; refusing to empty the overlay.');
  const overlay = JSON.parse(readFileSync(OVERLAY_PATH, 'utf8'));
  let changed = false;
  for (const id of ACCOUNT_PROVIDERS) {
    const before = JSON.stringify(overlay[id]?.models ?? {});
    const after = JSON.stringify(models);
    if (before !== after) {
      changed = true;
      const was = Object.keys(overlay[id]?.models ?? {});
      const now = Object.keys(models);
      console.log(
        `${id}: ${was.length} -> ${now.length} models` +
          `; +[${now.filter((m) => !was.includes(m)).join(', ')}]` +
          ` -[${was.filter((m) => !now.includes(m)).join(', ')}]`,
      );
    }
    overlay[id] = { ...overlay[id], models };
  }
  if (!changed) {
    console.log('ChatGPT overlay entries are current.');
    return 0;
  }
  if (!write) {
    console.log('Run with --write to update packages/cli/data/providers.json.');
    return 1;
  }
  writeFileSync(OVERLAY_PATH, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log('Wrote packages/cli/data/providers.json; run biome format on it before committing.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
