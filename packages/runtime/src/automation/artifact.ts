import { open, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { AutomationStore } from './store.js';

export async function readAutomationArtifact(
  store: AutomationStore,
  id: string,
  name: string,
): Promise<string> {
  if (
    ![
      'changes.patch',
      'output.log',
      'run.json',
      'verification.json',
      'verification.log',
      'pull-request.json',
      'ci.json',
    ].includes(name)
  )
    throw new Error('Artifact not available');
  if (!(await store.snapshot()).runs.some((run) => run.id === id))
    throw new Error('Automation run not found');
  const base = await realpath(path.join(store.directory, 'runs'));
  if (path.dirname(base) !== (await realpath(store.directory)))
    throw new Error('Artifact not available');
  const root = await realpath(path.join(base, id));
  if (path.dirname(root) !== base) throw new Error('Artifact not available');
  const target = await realpath(path.join(root, name));
  if (path.dirname(target) !== root || path.basename(target) !== name)
    throw new Error('Artifact not available');
  const file = await open(target, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Artifact exceeds 2 MB');
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 2 * 1024 * 1024) throw new Error('Artifact exceeds 2 MB');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await file.close();
  }
}
