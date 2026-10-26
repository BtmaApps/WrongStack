import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { type ContentRouteContext, handleContentRoute } from '../src/server/content-routes';

it('correlates real skill creation, duplicate refusal and unavailable lifecycle actions', async () => {
  const base = resolve(tmpdir()),
    dir = mkdtempSync(join(base, 'desktop-skills-correlation-'));
  const frames: { type: string; payload: Record<string, unknown> }[] = [];
  const socket = {
    readyState: 1,
    send(this: unknown, value: string) {
      expect(this).toBe(socket);
      frames.push(JSON.parse(value));
    },
  };
  const ctx = {
    getProjectRoot: () => dir,
    onFileWritten: () => {},
    getSkillsContext: () => ({
      projectRoot: dir,
      skillLoader: undefined,
      skillInstaller: undefined,
    }),
    getPromptsContext: () => {
      throw new Error('not prompts');
    },
    getDesignContext: () => {
      throw new Error('not design');
    },
  } satisfies ContentRouteContext;
  const call = async (type: string, payload: Record<string, unknown>, reply: string) => {
    frames.length = 0;
    await handleContentRoute(
      ctx,
      socket as unknown as WebSocket,
      { type, payload: { ...payload, requestId: type } } as never,
    );
    const result = frames.find((frame) => frame.type === reply)?.payload;
    expect(result?.['requestId']).toBe(type);
    return result;
  };
  try {
    const input = {
      name: 'desktop-fixture-skill',
      description: 'Use for the isolated desktop fixture.',
      scope: 'project',
    };
    expect(await call('skills.create', input, 'skills.created')).toMatchObject({ success: true });
    expect(
      readFileSync(join(dir, '.wrongstack/skills/desktop-fixture-skill/SKILL.md'), 'utf8'),
    ).toContain(input.description);
    expect(await call('skills.create', input, 'skills.created')).toMatchObject({ success: false });
    for (const [type, reply] of [
      ['skills.install', 'skills.installed'],
      ['skills.uninstall', 'skills.uninstalled'],
      ['skills.update', 'skills.updated'],
      ['skills.edit', 'skills.edited'],
      ['skills.export', 'skills.exported'],
    ])
      expect(await call(type!, {}, reply!)).toHaveProperty('error', 'Skills not enabled');
  } finally {
    expect(dir.startsWith(base + sep)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  }
});
