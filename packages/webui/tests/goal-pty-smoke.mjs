import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pty from 'node-pty';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const worker = path.resolve(root, 'packages/tui/tests/phase-monitor-pty-worker.tsx');
const output = await new Promise((resolve, reject) => {
  const terminal = pty.spawn(process.execPath, ['--import', 'tsx', worker], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: root,
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'packages/tui/tsconfig.json') },
  });
  let text = '';
  let resized = false;
  const timeout = setTimeout(() => {
    terminal.kill();
    reject(new Error(`Goal PTY smoke timed out: ${text.slice(-500)}`));
  }, 10_000);
  terminal.onData((chunk) => {
    text += chunk;
    if (!resized && text.includes('Goal PTY proof')) {
      resized = true;
      terminal.resize(62, 12);
    }
  });
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    if (exitCode === 0) resolve(text);
    else reject(new Error(`Goal PTY worker exited ${exitCode}: ${text.slice(-500)}`));
  });
});

assert(output.includes('Goal PTY proof'), `Goal title missing from PTY: ${output.slice(-450)}`);
assert(output.includes('Finish feature'), `Active task missing from PTY: ${output.slice(-450)}`);
assert(output.includes('worker'), `Worker label missing from PTY: ${output.slice(-450)}`);
console.log('PASS real PTY: Goal title, active task and worker survive 80x24 → 62x12 resize');
process.exit(0);
