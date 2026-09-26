// Proof that `skill_activated` session events are appended for resource-only
// and pagination calls (not just final-body deliveries), so on session
// resume `restoreRequiredSkillsFromEvents` marks skills as loaded even when
// the body was never delivered to the model. The required-skill gate then
// passes incorrectly, defeating its purpose.
//
// Trigger sequence that reproduces the bug:
//   1. arm the gate for a required skill (e.g. bug-hunter).
//   2. call skill({ name: 'bug-hunter', resource: 'scripts/x.py' }) — a
//      resource-only request; body is NOT delivered.
//   3. observe that ctx.session.append receives type='skill_activated' even
//      though markRequiredSkillLoaded was NOT called for this call.
//   4. simulate a session resume: feed the recorded events to
//      restoreRequiredSkillsFromEvents.
//   5. the gate now reports pending=[] — the skill counts as loaded.
//   6. correct behavior: the gate must still report pending=['bug-hunter']
//      because the body was never delivered.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSkillTool } from '../src/skill.js';

interface SessionEvent {
  type: string;
  ts?: string;
  skillName?: string;
}

interface MockSession {
  events: SessionEvent[];
  append: (event: SessionEvent) => Promise<void>;
}

let tmp: string;
let session: MockSession;
let meta: Record<string, unknown>;
let ctx: never;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'proof-skill-activated-'));
  meta = {};
  session = {
    events: [],
    append: async (e: SessionEvent) => {
      session.events.push(e);
    },
  };
  ctx = { meta, session, catalogTools: [], tools: [] } as never;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

async function buildSkill(name: string) {
  const dir = path.join(tmp, name);
  await fs.mkdir(dir, { recursive: true });
  const raw = `---\nname: ${name}\ndescription: d\n---\nbody for ${name}`;
  await fs.writeFile(path.join(dir, 'SKILL.md'), raw);
  await fs.mkdir(path.join(dir, 'scripts'), { recursive: true });
  await fs.writeFile(path.join(dir, 'scripts', 'x.py'), 'print(1)');
  return { dir, raw };
}

describe('proof: skill_activated event must only fire for full-body deliveries', () => {
  it('does NOT append skill_activated for a resource-only request', async () => {
    const { dir, raw } = await buildSkill('bug-hunter');
    const tool = makeSkillTool({
      list: async () => [
        {
          name: 'bug-hunter',
          description: 'd',
          path: path.join(dir, 'SKILL.md'),
          source: 'project' as const,
        },
      ],
      listEntries: async () => [],
      find: async (n: string) =>
        n === 'bug-hunter'
          ? {
              name: 'bug-hunter',
              description: 'd',
              path: path.join(dir, 'SKILL.md'),
              source: 'project' as const,
            }
          : undefined,
      manifestText: async () => '',
      readBody: async (n: string) => (n === 'bug-hunter' ? raw : ''),
      readSaveBody: async () => '',
      invalidateCache: () => undefined,
    } as never);

    await tool.execute({ name: 'bug-hunter', resource: 'scripts/x.py' }, ctx, {
      signal: new AbortController().signal,
    });

    const activations = session.events.filter((e) => e.type === 'skill_activated');
    expect(
      activations,
      `resource-only request must not append skill_activated; got ${JSON.stringify(activations)}`,
    ).toEqual([]);
  });

  it('after resume, a skill loaded only via resource requests is NOT pending', async () => {
    const { dir, raw } = await buildSkill('bug-hunter');
    const tool = makeSkillTool({
      list: async () => [
        {
          name: 'bug-hunter',
          description: 'd',
          path: path.join(dir, 'SKILL.md'),
          source: 'project' as const,
        },
      ],
      listEntries: async () => [],
      find: async (n: string) =>
        n === 'bug-hunter'
          ? {
              name: 'bug-hunter',
              description: 'd',
              path: path.join(dir, 'SKILL.md'),
              source: 'project' as const,
            }
          : undefined,
      manifestText: async () => '',
      readBody: async (n: string) => (n === 'bug-hunter' ? raw : ''),
      readSaveBody: async () => '',
      invalidateCache: () => undefined,
    } as never);

    await tool.execute({ name: 'bug-hunter', resource: 'scripts/x.py' }, ctx, {
      signal: new AbortController().signal,
    });

    const { pendingRequiredSkills, restoreRequiredSkillsFromEvents } = await import(
      '@wrongstack/core/skills'
    );

    // Simulate the full journal: a user_input event arms the gate, then the
    // resource-only tool call appends no skill_activated (after the fix).
    const journal = [
      { type: 'user_input', content: '<!-- wrongstack:required-skills bug-hunter -->' },
      ...session.events,
    ];
    restoreRequiredSkillsFromEvents({ meta }, journal as never);

    const pending = pendingRequiredSkills({ meta });
    expect(
      pending,
      `after resume from resource-only events, bug-hunter must remain pending; got ${JSON.stringify(pending)}`,
    ).toContain('bug-hunter');
  });
});
