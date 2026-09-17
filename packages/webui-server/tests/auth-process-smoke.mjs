import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultSecretVault } from '@wrongstack/core/security';
import { loadSavedProviders, saveProviders } from '../dist/index.js';

if (process.argv[2] === '--worker') {
  const [configPath, keyFile, id, variant] = process.argv.slice(3);
  const vault = new DefaultSecretVault({ keyFile });
  const providers = await loadSavedProviders(configPath, vault);
  process.send({ ready: true });
  await new Promise((resolve) => process.once('message', resolve));
  providers[id].models = [variant];
  providers[id].apiKey = `fixture-${variant}`;
  try {
    await saveProviders(configPath, vault, providers);
    process.send({ result: 'saved', id, variant });
  } catch (error) {
    if (!error.message.includes('Refresh and try again')) throw error;
    process.send({ result: 'conflict', id, variant });
  }
  process.disconnect();
} else {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auth-process-smoke-'));
  const configPath = path.join(dir, 'config.json');
  const keyFile = path.join(dir, '.key');
  const vault = new DefaultSecretVault({ keyFile });
  const children = [];
  try {
    const providers = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `account-${i}`,
        {
          type: 'openai',
          family: 'openai',
          apiKey: `fixture-original-${i}`,
          models: ['original'],
        },
      ]),
    );
    await fs.writeFile(configPath, JSON.stringify({ unrelated: { retained: true } }));
    await saveProviders(configPath, vault, providers);
    const run = async (targets) => {
      const pending = targets.map(([id, variant]) => {
        const child = fork(
          fileURLToPath(import.meta.url),
          ['--worker', configPath, keyFile, id, variant],
          {
            stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            windowsHide: true,
          },
        );
        children.push(child);
        let fail;
        const failure = new Promise((_, reject) => {
          fail = reject;
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', fail);
        child.on('exit', (code) => {
          if (code) fail(new Error(`Worker exited ${code}: ${stderr}`));
        });
        const message = (accept) =>
          Promise.race([
            failure,
            new Promise((resolve) => {
              const receive = (value) => {
                if (accept(value)) {
                  child.off('message', receive);
                  resolve(value);
                }
              };
              child.on('message', receive);
            }),
          ]);
        return {
          child,
          ready: message((value) => value.ready),
          result: message((value) => value.result),
        };
      });
      await Promise.all(pending.map((item) => item.ready));
      for (const item of pending) item.child.send({ go: true });
      return Promise.all(pending.map((item) => item.result));
    };
    const independent = await run(Object.keys(providers).map((id, i) => [id, `updated-${i}`]));
    assert.ok(independent.every((result) => result.result === 'saved'));
    const saved = await loadSavedProviders(configPath, vault);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(saved[`account-${i}`].models, [`updated-${i}`]);
      assert.equal(saved[`account-${i}`].apiKey, `fixture-updated-${i}`);
    }
    const contested = await run([
      ['account-0', 'winner-a'],
      ['account-0', 'winner-b'],
    ]);
    assert.deepEqual(contested.map((result) => result.result).sort(), ['conflict', 'saved']);
    const winner = contested.find((result) => result.result === 'saved');
    assert.deepEqual((await loadSavedProviders(configPath, vault))['account-0'].models, [
      winner.variant,
    ]);
    const raw = await fs.readFile(configPath, 'utf8');
    assert.ok(!raw.includes('fixture-'));
    assert.deepEqual(JSON.parse(raw).unrelated, { retained: true });
    console.log(
      'Separate-process auth persistence passed: 8 independent writers, same-account conflict, encryption.',
    );
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      }
    }
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
