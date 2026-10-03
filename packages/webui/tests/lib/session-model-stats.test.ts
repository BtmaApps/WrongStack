import { describe, expect, it } from 'vitest';
import { distribution, sessionModelStats } from '../../src/lib/session-model-stats';
import { buildSessionStory } from '../../src/lib/session-story';
import type { ChronicleEventView } from '../../src/types';

function record(
  id: string,
  type: string,
  extra: Partial<ChronicleEventView> = {},
): ChronicleEventView {
  return {
    schemaVersion: 1,
    eventId: id,
    eventType: type,
    observedAt: '2026-10-02T12:00:00Z',
    persistedAt: '2026-10-02T12:00:00Z',
    sequence: 1,
    hash: '',
    previousHash: '',
    scope: { sessionId: 's', agentId: 'leader' },
    correlation: {},
    runtime: { providerId: 'p', modelId: 'm' },
    ...extra,
  };
}
const stats = (records: ChronicleEventView[]) => sessionModelStats(buildSessionStory('s', records));
describe('model evidence aggregation', () => {
  it('keeps worker loop identity and stopped task outcomes distinct from failures', () => {
    const rows = stats([
      record('worker-loop', 'subagent.loop_detected', {
        scope: { sessionId: 's', agentId: 'worker' },
        attributes: { repeatCount: 4 },
      }),
      record('stopped', 'subagent.task_completed', {
        scope: { sessionId: 's', agentId: 'worker', taskId: 'task' },
        attributes: { status: 'stopped' },
      }),
      record('timeout', 'subagent.task_completed', {
        scope: { sessionId: 's', agentId: 'worker', taskId: 'task2' },
        attributes: { status: 'timeout' },
      }),
    ]);
    expect(rows[0]).toMatchObject({ loops: 1, taskStopped: 1, taskTimeout: 1, taskFailed: 0 });
  });
  it('pairs native and worker attempts, keeps retries and stream samples, excludes other tabs', () => {
    const rows = stats([
      record('start', 'provider.attempt.started', {
        correlation: { attemptId: 'a1', logicalRequestId: 'r' },
        attributes: { attempt: 0, messageCount: 4, toolCount: 9, streaming: true },
      }),
      record('failed', 'provider.attempt.failed', {
        correlation: { attemptId: 'a1', logicalRequestId: 'r' },
        durationNs: '1000000000',
        attributes: {
          attempt: 0,
          status: 429,
          failureKind: 'rate_limit',
          retryScheduled: true,
          retryDelayMs: 50,
        },
      }),
      record('start2', 'provider.attempt.started', {
        correlation: { attemptId: 'a2', logicalRequestId: 'r' },
        attributes: { attempt: 1 },
      }),
      record('done', 'provider.attempt.completed', {
        correlation: { attemptId: 'a2', logicalRequestId: 'r' },
        durationNs: '3000000000',
        attributes: {
          attempt: 1,
          stopReason: 'max_tokens',
          usage: { input: 10, output: 30, cacheRead: 20, cacheWrite: 5 },
        },
      }),
      record('stream', 'provider.stream.summarized', {
        correlation: { attemptId: 'a2' },
        attributes: { firstChunkLatencyMs: 0 },
      }),
      record('worker-start', 'subagent.provider_attempt', {
        scope: { sessionId: 's', agentId: 'worker' },
        correlation: { attemptId: 'a2' },
        attributes: { outcome: 'started', attempt: 0 },
      }),
      record('worker-end', 'subagent.provider_attempt', {
        scope: { sessionId: 's', agentId: 'worker' },
        correlation: { attemptId: 'a2' },
        attributes: {
          outcome: 'completed',
          durationMs: 1000,
          usage: { input: 1, output: 2 },
          stopReason: 'end_turn',
        },
      }),
      record('foreign', 'provider.attempt.failed', { scope: { sessionId: 'other' } }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      attempts: 3,
      completed: 2,
      failed: 1,
      retryAttempts: 1,
      retriesScheduled: 1,
      retryDelay: 50,
      recovered: 1,
      input: 11,
      output: 32,
      cacheRead: 20,
      cacheWrite: 5,
      usageSamples: 2,
      messageCounts: [4],
      offeredTools: [9],
      streamingSamples: 1,
      streamingAttempts: 1,
      promptTokens: [35, 1],
      responseTokens: [30, 2],
      firstChunk: [0],
      httpStatuses: { '429': 1 },
    });
    expect(distribution(rows[0]!.durations)).toMatchObject({
      avg: 5000 / 3,
      p50: 1000,
      p95: 3000,
      n: 3,
    });
  });
  it('does not double count token snapshots or charge cumulative mixed-model spend to a model', () => {
    const rows = stats([
      record('completion', 'provider.attempt.completed', {
        correlation: { attemptId: 'a' },
        attributes: { usage: { input: 10, output: 5 } },
      }),
      record('account', 'token.accounted', {
        attributes: {
          deltaUsage: { input: 10, output: 5 },
          usage: { input: 500, output: 500 },
          cost: { total: 100 },
          deltaCost: { total: 0.25 },
        },
      }),
      record('switch', 'token.accounted', {
        runtime: { providerId: 'p', modelId: 'm2' },
        attributes: {
          deltaUsage: { input: 20, output: 10 },
          usage: { input: 520, output: 510 },
          cost: { total: 101 },
          deltaCost: { total: 1 },
        },
      }),
    ]);
    expect(rows.find((row) => row.model === 'm')).toMatchObject({
      input: 10,
      output: 5,
      cost: 0.25,
      usageSamples: 1,
      pricedSamples: 1,
    });
    expect(rows.find((row) => row.model === 'm2')).toMatchObject({
      input: 20,
      output: 10,
      cost: 1,
      usageSource: 'accounting deltas',
    });
  });
  it('keeps ambiguous task attribution unknown instead of using the last actor model', () => {
    const rows = stats([
      record('one', 'provider.attempt.completed', {
        scope: { sessionId: 's', agentId: 'leader', taskId: 'task' },
        attributes: { usage: { input: 0, output: 0 } },
      }),
      record('two', 'provider.attempt.completed', {
        scope: { sessionId: 's', agentId: 'leader', taskId: 'task' },
        runtime: { providerId: 'p', modelId: 'm2' },
      }),
      record('verify', 'sdd.task.verification_failed', {
        runtime: undefined,
        scope: { sessionId: 's', taskId: 'task' },
      }),
      record('loop', 'tool.loop_detected', { runtime: undefined, attributes: { repeatCount: 5 } }),
    ]);
    expect(rows.find((row) => row.model === 'Unknown model')).toMatchObject({
      verificationFailed: 1,
      loops: 1,
    });
    expect(
      rows
        .filter((row) => row.model !== 'Unknown model')
        .every((row) => row.loops === 0 && row.verificationFailed === 0),
    ).toBe(true);
  });
  it('uses an explicit attempt correlation for tools and distinguishes denied calls', () => {
    const rows = stats([
      record('model', 'provider.attempt.completed', { correlation: { attemptId: 'a' } }),
      record('tool-start', 'tool.started', {
        runtime: undefined,
        correlation: { attemptId: 'a', toolCallId: 't' },
        attributes: { toolName: 'write' },
      }),
      record('tool-end', 'tool.executed', {
        runtime: undefined,
        correlation: { attemptId: 'a', toolCallId: 't' },
        outcome: 'denied',
        durationNs: '0',
      }),
    ]);
    expect(rows[0]).toMatchObject({
      toolCalls: 1,
      toolBlocked: 1,
      toolFailed: 0,
      toolDurations: [0],
    });
  });
  it('attributes fallback endpoints explicitly and keeps absent metrics unknown', () => {
    const rows = stats([
      record('fallback', 'provider.fallback', {
        runtime: undefined,
        attributes: { from: { providerId: 'p', model: 'm' }, to: { providerId: 'q', model: 'm' } },
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.provider === 'p')?.fallbackOut).toBe(1);
    expect(rows.find((row) => row.provider === 'q')?.fallbackIn).toBe(1);
    expect(distribution([])).toMatchObject({ avg: undefined, p95: undefined, n: 0 });
    expect(rows.every((row) => row.pricedSamples === 0)).toBe(true);
  });
});
