import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryCompileArgs, buildAssetPack } from '../../../scripts/build-binaries.mjs';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(appDir, '../..');
const stageDir = join(appDir, '.engine-stage');
const outputDir = join(appDir, 'binaries');

export function createEngineEntry(source) {
  const cliImport = "await import('../../packages/cli/dist/index.js');";
  const packImport = "'../../dist-bin/.stage/assets.pack'";
  if (source.split(cliImport).length !== 2 || source.split(packImport).length !== 2) {
    throw new Error('Standalone bootstrap contract changed; review the desktop engine adapter.');
  }
  return source
    .replace(cliImport, "await import('../engine/main.ts');")
    .replace(packImport, "'./assets.pack'")
    .replaceAll("'../../packages/", "'../../../packages/");
}

function run(args) {
  const child = spawnSync(process.execPath, args, {
    cwd: repoDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Desktop engine build failed (${child.status}).`);
}

export function buildEngine({ skipBuild = false } = {}) {
  if (process.platform !== 'win32' || !['x64', 'arm64'].includes(process.arch)) {
    throw new Error('Desktop engine packaging currently targets Windows x64/arm64 only.');
  }
  if (!skipBuild) run(['scripts/build.mjs', '--target', '@wrongstack/webui-server']);
  mkdirSync(stageDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  const packId = buildAssetPack({
    destination: stageDir,
    assets: {
      core: ['package.json', 'skills', 'design-kits', 'instructions', 'data'],
      'agent-catalog': ['package.json', 'instructions'],
      cli: ['package.json', 'data'],
      tools: ['package.json', 'dist/wasm'],
      bench: ['package.json', 'fixtures', 'subsets'],
    },
  });
  const entry = join(stageDir, 'entry.mjs');
  writeFileSync(
    entry,
    createEngineEntry(readFileSync(join(repoDir, 'scripts/binary/entry.mjs'), 'utf8')),
  );
  const version = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).version;
  const apiVersion =
    JSON.parse(readFileSync(join(repoDir, 'packages/core/package.json'), 'utf8'))
      .wrongstackApiVersion ?? '0.0.0';
  const target = `bun-windows-${process.arch}`;
  const outfile = join(outputDir, 'wrongstack-engine.exe');
  run(binaryCompileArgs(target, { version, apiVersion, packId }, entry, outfile));
  return outfile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      `Desktop engine: ${buildEngine({ skipBuild: process.argv.includes('--skip-build') })}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
