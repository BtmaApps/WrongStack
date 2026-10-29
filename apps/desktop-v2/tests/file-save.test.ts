import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type EngineCommand, EngineReplyError } from '../src/engine-operations';
import { saveFileVersion } from '../src/file-save';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
/** Mirrors the engine contract: read reports a hash, write re-checks it before replacing. */
function disk(
  initial: string | null,
  options: { beforeWrite?: () => void; legacy?: boolean } = {},
) {
  const state = { text: initial, writes: 0 };
  const command: EngineCommand = async (type, payload) => {
    if (type === 'files.read') {
      if (state.text === null) throw new EngineReplyError('ENOENT', {});
      return {
        content: state.text,
        ...(options.legacy ? {} : { sha256: hash(state.text) }),
      };
    }
    if (type === 'files.write') {
      options.beforeWrite?.();
      const current = state.text === null ? null : hash(state.text);
      if (payload['expectedSha256'] !== current)
        throw new EngineReplyError('FILE_CONFLICT: changed', {
          success: false,
          conflict: true,
          currentSha256: current,
        });
      state.text = String(payload['content']);
      state.writes++;
      return { success: true, sha256: hash(state.text) };
    }
    throw Error(`unexpected ${type}`);
  };
  return { state, command };
}

describe('version-bound file saves', () => {
  it('saves over the reviewed baseline', async () => {
    const { state, command } = disk('base');
    expect(await saveFileVersion(command, 'a.ts', 'mine', 'base')).toEqual({ kind: 'saved' });
    expect(state.text).toBe('mine');
  });

  it('reports an external edit seen before writing without writing', async () => {
    const { state, command } = disk('external');
    expect(await saveFileVersion(command, 'a.ts', 'mine', 'base')).toEqual({
      kind: 'conflict',
      sha256: hash('external'),
    });
    expect(state.writes).toBe(0);
  });

  it('turns an edit that lands between the check and the write into a conflict', async () => {
    const box = disk('base', { beforeWrite: () => (box.state.text = 'raced') });
    expect(await saveFileVersion(box.command, 'a.ts', 'mine', 'base')).toEqual({
      kind: 'conflict',
      sha256: hash('raced'),
    });
    expect(box.state.text).toBe('raced');
  });

  it('overwrites only the disk version shown in the conflict review', async () => {
    const { state, command } = disk('external');
    expect(await saveFileVersion(command, 'a.ts', 'mine', 'base', hash('newer'))).toEqual({
      kind: 'conflict',
      sha256: hash('external'),
    });
    expect(state.text).toBe('external');
    expect(await saveFileVersion(command, 'a.ts', 'mine', 'base', hash('external'))).toEqual({
      kind: 'saved',
    });
    expect(state.text).toBe('mine');
  });

  it('fails closed against an engine that cannot report the disk version', async () => {
    const { state, command } = disk('base', { legacy: true });
    await expect(saveFileVersion(command, 'a.ts', 'mine', 'base')).rejects.toThrow(
      /cannot verify saves/,
    );
    expect(state.writes).toBe(0);
  });
});
