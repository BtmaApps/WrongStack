import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { createChronicleEventJournal } from '../../../packages/chronicle/dist/index.js';
import { resolveWstackPaths } from '../../../packages/persistence/dist/index.js';

export async function seedNativeChronicle({ rpc, project, waitFor }) {
  const requestId = crypto.randomUUID();
  await rpc('project.send', {
    projectId: project.id,
    message: { type: 'chronicle.status', payload: { requestId } },
  });
  let offset = 0;
  const health = await waitFor(async () => {
    const batch = await rpc('project.events', { projectId: project.id, offset });
    offset = batch.offset;
    const reply = batch.events.find(
      (event) => event.type === 'chronicle.status_result' && event.payload?.requestId === requestId,
    );
    return reply?.payload;
  }, 'Canonical Chronicle owner identity');
  assert.equal(typeof health.projectDir, 'string');
  assert.equal(typeof health.projectRoot, 'string');
  const paths = resolveWstackPaths({
    projectRoot: health.projectRoot,
    globalRoot: dirname(dirname(health.projectDir)),
  });
  const producer = createChronicleEventJournal({
    projectRoot: health.projectRoot,
    projectPaths: {
      globalRoot: paths.globalRoot,
      projectId: paths.projectHash,
      workspaceId: paths.projectSlug,
      projectDir: health.projectDir,
    },
  });
  try {
    for (const input of [
      ...['tool.started', 'file.changed', 'tool.completed'].map((eventType, i) => ({
        eventType,
        outcome: i === 0 ? 'started' : 'success',
        scope: {
          installationId: 'native-fixture',
          machineId: 'native-fixture',
          agentId: 'fixture-reviewer',
          sessionId: 'fixture-story',
        },
        correlation: {
          traceId: 'native-chronicle-proof',
          spanId: `native-span-${i}`,
          ...(i ? { parentSpanId: `native-span-${i - 1}` } : {}),
        },
        resource: { kind: 'file', id: 'review-fixture.ts', path: 'review-fixture.ts' },
        attributes: {
          summary: i === 2 ? 'Native Chronicle review completed' : `Native Chronicle evidence ${i}`,
          reason: 'The fixture review retains its real event lineage.',
        },
      })),
      ...Array.from({ length: 102 }, (_, i) => ({
        eventType: 'runtime.check',
        outcome: 'success',
        scope: { installationId: 'native-fixture', machineId: 'native-fixture' },
        correlation: { traceId: `native-page-${i}`, spanId: `native-page-${i}` },
        attributes: { summary: `Native Chronicle pagination ${i}` },
      })),
    ])
      await producer.journal.append(input);
    await producer.journal.flush();
  } finally {
    await producer.dispose();
  }
}
