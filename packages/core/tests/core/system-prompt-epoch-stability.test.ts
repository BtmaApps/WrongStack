/**
 * The wire puts `system` before every message, so a single churning byte there
 * invalidates the whole cached conversation prefix — the message-layer work in
 * `prompt-cache-prefix-stability.test.ts` is worth nothing if this drifts.
 *
 * `refreshSystemPrompt: true` (both the CLI and the WebUI wire it on) rebuilds
 * the prompt on every `run()`, so "we build it once" is not the guarantee.
 * The guarantee has to be that repeated builds are byte-identical, and that
 * anything genuinely per-turn is tagged volatile so `partitionPromptEpoch`
 * lifts it out of `system` and into the live-context tail.
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailboxAgentStatus } from '../../../coordination/src/mailbox-types.js';
import { SYSTEM_BLOCK_SOURCE } from '../../src/core/system-prompt-blocks.js';
import { DefaultSystemPromptBuilder, type Tool } from '../../src/index.js';

const mkTool = (name: string): Tool => ({
  name,
  description: `desc-${name}`,
  permission: 'auto',
  mutating: false,
  inputSchema: { type: 'object' },
  async execute() {
    return '';
  },
});

const mkAgent = (overrides: Partial<MailboxAgentStatus>): MailboxAgentStatus => ({
  agentId: 'scout-1',
  name: 'Scout',
  sessionId: 'session-1',
  status: 'idle',
  iterations: 0,
  toolCalls: 0,
  lastActivityAt: '2026-08-13T00:00:00.000Z',
  lastSeenAt: '2026-08-13T00:00:00.000Z',
  online: true,
  pid: 1234,
  source: 'cli',
  ...overrides,
});

/** Mirrors `EPOCH_VOLATILE_SOURCES` in agent-response.ts. */
const VOLATILE_SOURCES = new Set(['plan', 'contributor', 'glossary', 'peers']);

function stablePartitionText(blocks: readonly { text: string }[]): string {
  return blocks
    .filter((block) => {
      const source = SYSTEM_BLOCK_SOURCE.get(block as never);
      return !(source && VOLATILE_SOURCES.has(source));
    })
    .map((block) => block.text)
    .join('\u0000');
}

describe('system prompt epoch stability', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-epoch-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('rebuilds a byte-identical stable partition across turns', async () => {
    const builder = new DefaultSystemPromptBuilder({ todayIso: '2026-08-13' });
    const ctx = {
      cwd: tmp,
      projectRoot: tmp,
      tools: [mkTool('bash'), mkTool('read'), mkTool('edit'), mkTool('grep')],
      provider: 'test',
      model: 'test-model',
    };

    const first = stablePartitionText(await builder.build(ctx));
    // Several more turns, exactly as `refreshSystemPrompt` would drive it.
    for (let turn = 0; turn < 4; turn++) {
      expect(stablePartitionText(await builder.build(ctx))).toBe(first);
    }
  });

  it('tags every block it emits, so nothing slips past the volatile partition', async () => {
    const builder = new DefaultSystemPromptBuilder({ todayIso: '2026-08-13' });
    const blocks = await builder.build({
      cwd: tmp,
      projectRoot: tmp,
      tools: [mkTool('bash')],
      provider: 'test',
      model: 'test-model',
    });

    // An untagged block is treated as stable and stays in `system`. That is the
    // right default for embedder-supplied prompts, but a NEW builder-emitted
    // block that forgets `tagBlock` would silently become a cache-breaking
    // passenger, so the builder's own output must be fully attributed.
    for (const block of blocks) {
      expect(SYSTEM_BLOCK_SOURCE.get(block)).toBeDefined();
    }
  });

  it('keeps a live online-agents snapshot out of the cacheable partition', async () => {
    const builder = new DefaultSystemPromptBuilder({ todayIso: '2026-08-13' });
    const base = {
      cwd: tmp,
      projectRoot: tmp,
      tools: [mkTool('mail_send'), mkTool('mail_inbox')],
      provider: 'test',
      model: 'test-model',
    };

    const idle = await builder.build({
      ...base,
      onlineAgents: [mkAgent({ status: 'idle' })],
    });
    const busy = await builder.build({
      ...base,
      onlineAgents: [
        mkAgent({
          status: 'running',
          currentTask: 'reading files',
          currentTool: 'grep',
          iterations: 7,
          toolCalls: 21,
          lastActivityAt: '2026-08-13T04:15:00.000Z',
          lastSeenAt: '2026-08-13T04:15:00.000Z',
        }),
      ],
    });

    // Peer churn is real and constant in a fleet; it must not move a byte of
    // the partition that precedes the conversation on the wire.
    expect(stablePartitionText(busy)).toBe(stablePartitionText(idle));
  });
});
