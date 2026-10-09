import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Parse a stable npm semver core; release candidates/betas are intentionally excluded. */
export function stableVersionParts(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );
  if (!match) return undefined;
  const parts = match.slice(1, 4).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

/** Pick highest stable, non-deprecated version from published npm metadata. */
export function selectStableVersion(versions) {
  let best;
  let bestParts;
  for (const [version, metadata] of Object.entries(versions)) {
    const parts = stableVersionParts(version);
    if (!parts || metadata?.deprecated) continue;
    if (
      !bestParts ||
      parts[0] > bestParts[0] ||
      (parts[0] === bestParts[0] && parts[1] > bestParts[1]) ||
      (parts[0] === bestParts[0] && parts[1] === bestParts[1] && parts[2] > bestParts[2])
    ) {
      best = version;
      bestParts = parts;
    }
  }
  return best;
}

async function registryJson(url, signal, abbreviated = false) {
  const response = await fetch(url, {
    signal,
    redirect: 'error',
    headers: { Accept: abbreviated ? 'application/vnd.npm.install-v1+json' : 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Registry returned HTTP ' + response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Registry response has no body');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32 * 1024 * 1024) throw new Error('Registry response exceeds 32 MiB limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data = JSON.parse(new TextDecoder().decode(joined));
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Registry returned an invalid metadata object');
  }
  return data;
}

export async function inspectPackage(name) {
  let source = 'https://registry.npmjs.org/';
  const checkedAt = new Date().toISOString();
  try {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
      throw new Error('Invalid npm package name');
    }
    source += encodeURIComponent(name);
    const signal = AbortSignal.timeout(20_000);
    let metadata = await registryJson(source + '/latest', signal);
    if (typeof metadata.version !== 'string')
      throw new Error('Missing version in registry metadata');
    const latestTag = metadata.version;
    let selection = 'latest stable tag';
    if (!stableVersionParts(latestTag) || metadata.deprecated) {
      const packument = await registryJson(source, signal, true);
      if (
        !packument.versions ||
        typeof packument.versions !== 'object' ||
        Array.isArray(packument.versions)
      ) {
        throw new Error('Missing published version metadata');
      }
      const stable = selectStableVersion(packument.versions);
      if (!stable) throw new Error('No published non-deprecated stable release found');
      metadata = packument.versions[stable];
      if (metadata?.version !== stable) throw new Error('Selected stable metadata is inconsistent');
      selection = 'highest published stable; latest tag is preview or deprecated';
    }
    return {
      package: name,
      version: metadata.version,
      latestTag,
      selection,
      engines: metadata.engines ?? {},
      peerDependencies: metadata.peerDependencies ?? {},
      source,
      checkedAt,
    };
  } catch (error) {
    return { package: name, source, checkedAt, error: String(error) };
  }
}

async function main() {
  const names = [...new Set(process.argv.slice(2))];
  if (names.length === 0 || names.includes('--help')) {
    console.log(
      'Usage: bun run packages/core/skills/tech-stack/scripts/check-versions.mjs <npm-package> [package ...]',
    );
    console.log(
      'Read-only. Reports stable versions, preview tags, engines and peers; installs nothing.',
    );
    return;
  }
  if (names.length > 64) throw new Error('Check at most 64 packages per invocation');
  const results = [];
  // Bounded network batches; every result remains visible.
  for (let offset = 0; offset < names.length; offset += 4) {
    results.push(...(await Promise.all(names.slice(offset, offset + 4).map(inspectPackage))));
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.error)) process.exitCode = 1;
}

const entry = process.argv[1] ? resolve(process.argv[1]) : '';
const current = fileURLToPath(import.meta.url);
if (
  process.platform === 'win32' ? entry.toLowerCase() === current.toLowerCase() : entry === current
) {
  await main();
}
