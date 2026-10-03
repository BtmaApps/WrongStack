import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import {
  compareQualityExperiment,
  type QualityReviewPolicy,
  type RoutingPolicy,
  readRunDir,
  reviewTranscript,
  routingExperiment,
} from '@wrongstack/bench';
import type { SubcommandDeps } from '../contracts.js';

async function boundedFile(file: string, limit: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('Experiment input exceeds the size limit');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('Experiment input exceeds the size limit');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
export async function benchExperimentCommand(
  action: string,
  args: string[],
  deps: SubcommandDeps,
): Promise<number> {
  const flag = (name: string) =>
    typeof deps.flags?.[name] === 'string' ? (deps.flags[name] as string) : undefined;
  try {
    const policyFile = flag('policy');
    const policy = policyFile
      ? (JSON.parse(await boundedFile(path.resolve(deps.cwd, policyFile), 128 * 1024)) as unknown)
      : undefined;
    let report: unknown;
    if (action === 'review') {
      const transcript = flag('transcript');
      if (!transcript)
        throw new Error('Use bench review --transcript <session.jsonl> [--policy <json>]');
      const raw = await boundedFile(path.resolve(deps.cwd, transcript), 32 * 1024 * 1024);
      const events: Record<string, unknown>[] = [];
      for (const line of raw.split('\n').filter((line) => line.trim())) {
        const event: unknown = JSON.parse(line);
        if (!event || typeof event !== 'object' || Array.isArray(event))
          throw new Error('Transcript contains a non-event');
        events.push(event as Record<string, unknown>);
      }
      if (policy !== undefined && (!policy || typeof policy !== 'object' || Array.isArray(policy)))
        throw new Error('Invalid review policy');
      report = reviewTranscript(
        events,
        createHash('sha256').update(raw).digest('hex'),
        policy as QualityReviewPolicy | undefined,
      );
    } else if (action === 'route') {
      if (!args[0] || !policy || typeof policy !== 'object' || Array.isArray(policy))
        throw new Error('Use bench route <run-dir> --policy <routing.json>');
      report = routingExperiment(
        await readRunDir(path.resolve(deps.cwd, args[0])),
        policy as RoutingPolicy,
      );
    } else {
      const dimension = flag('dimension');
      if (!args[0] || !args[1] || (dimension !== 'compaction' && dimension !== 'behavior'))
        throw new Error(
          'Use bench experiment <baseline-dir> <candidate-dir> --dimension compaction|behavior',
        );
      const [baseline, candidate] = await Promise.all([
        readRunDir(path.resolve(deps.cwd, args[0])),
        readRunDir(path.resolve(deps.cwd, args[1])),
      ]);
      report = compareQualityExperiment(baseline, candidate, dimension);
    }
    deps.renderer.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    deps.renderer.writeError(error instanceof Error ? error.message : 'Experiment failed');
    return 1;
  }
}
export async function readBenchReviewPolicy(file: string): Promise<QualityReviewPolicy> {
  const raw: unknown = JSON.parse(await boundedFile(file, 128 * 1024));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid review policy');
  const policy = raw as QualityReviewPolicy;
  reviewTranscript([], '0'.repeat(64), policy);
  return policy;
}
