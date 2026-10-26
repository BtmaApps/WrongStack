import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagePortable } from './portable';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = fileURLToPath(new URL('../engine/main.ts', import.meta.url));
const backend = fileURLToPath(
  new URL('../../../packages/webui-server/dist/index.js', import.meta.url),
);
const mode = process.argv[2] ?? 'dev';
if (!['dev', 'build'].includes(mode)) throw new Error('Use dev or build');
if (!existsSync(backend)) {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'desktop.engine_missing',
      message: 'Build the WrongStack engine first: bun run build',
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
}
const appDir = fileURLToPath(new URL('../', import.meta.url));
async function prepareEngine(): Promise<void> {
  const builder = spawn(process.execPath, ['scripts/build-engine.mjs'], {
    cwd: appDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    builder.once('error', reject);
    builder.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Engine build exited ${code}`)),
    );
  });
}
if (mode === 'build') await prepareEngine();
const engineId = createHash('sha256')
  .update(readFileSync(mode === 'build' ? join(appDir, 'binaries/wrongstack-engine.exe') : backend))
  .digest('hex');
const child = spawn(process.execPath, ['--bun', 'run', 'tauri', mode, ...process.argv.slice(3)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: {
    ...process.env,
    WRONGSTACK_DESKTOP_ENGINE_ID: engineId,
    WRONGSTACK_DESKTOP_BUN: process.execPath,
    WRONGSTACK_DESKTOP_ENTRY: entry,
    WRONGSTACK_DESKTOP_REPO: root,
  },
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => {
  if (code === 0 && mode === 'build') {
    const portable = stagePortable(appDir);
    console.log(`Portable desktop: ${portable}`);
  }
  process.exit(code ?? 1);
});
