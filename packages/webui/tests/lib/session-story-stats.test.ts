import { describe, expect, it } from 'vitest';
import { observedOverlap } from '../../src/components/session-story/StoryInsights';
import { buildSessionStory } from '../../src/lib/session-story';
import { storyStats } from '../../src/lib/session-story-stats';
import type { ChronicleEventView } from '../../src/types';

function record(
  id: string,
  type: string,
  tool: string,
  extra: Partial<ChronicleEventView> = {},
): ChronicleEventView {
  return {
    schemaVersion: 1,
    eventId: `${type}-${id}`,
    eventType: type,
    observedAt: '2026-10-02T12:00:00Z',
    persistedAt: '2026-10-02T12:00:00Z',
    sequence: 1,
    hash: '',
    previousHash: '',
    scope: { sessionId: 'a', agentId: 'leader' },
    correlation: { toolCallId: id },
    attributes: { toolName: tool, input: { path: 'D:/repo/a.ts' } },
    ...extra,
  };
}
describe('dashboard evidence', () => {
  it('pairs calls and averages only measured terminal durations; counts successful file evidence', () => {
    const story = buildSessionStory(
      'a',
      [
        record('1', 'tool.started', 'read'),
        record('1', 'tool.executed', 'read', {
          outcome: 'success',
          durationNs: '10000000',
          attributes: { toolName: 'read', fileStats: { readLines: 5 } },
        }),
        record('2', 'tool.started', 'read'),
        record('2', 'tool.executed', 'read', { outcome: 'success' }),
        record('3', 'tool.started', 'read'),
        record('3', 'tool.executed', 'read', { outcome: 'failure', durationNs: '30000000' }),
        record('4', 'tool.started', 'edit'),
        record('4', 'tool.executed', 'edit', {
          outcome: 'success',
          attributes: {
            toolName: 'edit',
            fileStats: { addedLines: 2, removedLines: 1, partial: true },
          },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.tools.find((tool) => tool.name === 'read')).toMatchObject({
      calls: 3,
      success: 2,
      failed: 1,
      avg: 20,
      measured: 2,
      p95: 30,
    });
    expect(stats.files[0]).toMatchObject({
      path: 'a.ts',
      reads: 2,
      edits: 1,
      readLines: 5,
      readMeasured: 1,
      added: 2,
      removed: 1,
      partial: true,
    });
  });
  it('attributes patch edits to each file named in the diff, creating unseen rows', () => {
    // A patch call is not path-scoped: it carries no `path`, and neither file
    // appears in `story.files` from a read/edit/write record.
    const story = buildSessionStory(
      'a',
      [
        record('p1', 'tool.started', 'patch'),
        record('p1', 'tool.executed', 'patch', {
          outcome: 'success',
          attributes: {
            toolName: 'patch',
            fileStats: {
              addedLines: 3,
              removedLines: 2,
              patchFiles: [
                { path: 'D:/repo/src/a.ts', addedLines: 2, removedLines: 1 },
                { path: 'D:/repo/src/b.ts', addedLines: 1, removedLines: 1 },
              ],
            },
          },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.files.map((file) => file.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(stats.files[0]).toMatchObject({
      path: 'src/a.ts',
      edits: 1,
      added: 2,
      removed: 1,
      changeMeasured: 1,
      reads: 0,
      writes: 0,
    });
    expect(stats.files[1]).toMatchObject({ path: 'src/b.ts', added: 1, removed: 1 });
    expect(stats.tools.find((tool) => tool.name === 'patch')).toMatchObject({
      calls: 1,
      success: 1,
    });
  });
  it('counts a patch in the tools table but not as file activity when it failed', () => {
    const story = buildSessionStory(
      'a',
      [
        record('p2', 'tool.started', 'patch'),
        record('p2', 'tool.executed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', fileStats: { patchFiles: [{ path: 'x.ts' }] } },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.files).toHaveLength(0);
    expect(stats.tools.find((tool) => tool.name === 'patch')).toMatchObject({
      calls: 1,
      failed: 1,
    });
  });
  it('surfaces files a failed patch left changed, with zero counts and a conflict flag', () => {
    // `patch --merge` writes conflict markers and THEN throws, so the call is a
    // failure with no line evidence — but the working tree is genuinely dirty.
    const story = buildSessionStory(
      'a',
      [
        record('p3', 'tool.started', 'patch'),
        record('p3', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', modifiedPaths: ['src/c.ts'] },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.files).toHaveLength(1);
    expect(stats.files[0]).toMatchObject({
      path: 'src/c.ts',
      conflicted: true,
      reads: 0,
      edits: 0,
      writes: 0,
      readLines: 0,
      added: 0,
      removed: 0,
      readMeasured: 0,
      changeMeasured: 0,
    });
    // The call is still a failure in the tools table.
    expect(stats.tools.find((tool) => tool.name === 'patch')).toMatchObject({
      calls: 1,
      failed: 1,
      success: 0,
    });
  });
  it('counts a conflicted-only directory toward `directories`', () => {
    // DECIDED side effect of markConflicted: a conflicted-only row is a file a
    // failed call genuinely left dirty, so its parent directory really did see
    // activity and IS counted. Excluding it would both understate blast radius
    // and contradict `files.length`, which StoryTables renders beside this
    // number ("N recorded paths · M directories"). `directories` measures
    // reach, not success. See the DECIDED comment at the computation site.
    const conflictedOnly = buildSessionStory(
      'a',
      [
        record('d1', 'tool.started', 'patch'),
        record('d1', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', modifiedPaths: ['src/deep/only-conflicted.ts'] },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(conflictedOnly, 'D:/repo');
    // The row exists with no measured evidence at all...
    expect(stats.files).toHaveLength(1);
    expect(stats.files[0]).toMatchObject({
      path: 'src/deep/only-conflicted.ts',
      conflicted: true,
      reads: 0,
      edits: 0,
      writes: 0,
      added: 0,
      removed: 0,
    });
    // ...yet its directory is still part of the reach of this session.
    expect(stats.directories).toBe(1);

    // And it is ADDITIVE with directories that hold successful evidence: a
    // successful read in a different directory must take the count to 2, which
    // is what proves the conflicted directory is a real contribution rather
    // than a coincidence of the only row in the set.
    const mixed = buildSessionStory(
      'a',
      [
        record('d1', 'tool.started', 'patch'),
        record('d1', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', modifiedPaths: ['src/deep/only-conflicted.ts'] },
        }),
        record('d2', 'tool.started', 'read', {
          attributes: { toolName: 'read', input: { path: 'D:/repo/lib/other.ts' } },
        }),
        record('d2', 'tool.executed', 'read', {
          outcome: 'success',
          attributes: {
            toolName: 'read',
            input: { path: 'D:/repo/lib/other.ts' },
            fileStats: { readLines: 5 },
          },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const mixedStats = storyStats(mixed, 'D:/repo');
    expect(mixedStats.files).toHaveLength(2);
    expect(mixedStats.directories).toBe(2);
  });
  it('does not mark a file conflicted when the failure touched nothing', () => {
    const story = buildSessionStory(
      'a',
      [
        record('p4', 'tool.started', 'patch'),
        record('p4', 'tool.failed', 'patch', { outcome: 'failure' }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    expect(storyStats(story, 'D:/repo').files).toHaveLength(0);
  });
  it('flags a file conflicted without discarding counts it already earned', () => {
    // A good patch, then a later failure that damaged the same file: the row
    // keeps its measured evidence AND is flagged, so neither fact is lost.
    const story = buildSessionStory(
      'a',
      [
        record('p5', 'tool.started', 'patch'),
        record('p5', 'tool.executed', 'patch', {
          outcome: 'success',
          attributes: {
            toolName: 'patch',
            fileStats: {
              addedLines: 3,
              removedLines: 1,
              patchFiles: [{ path: 'D:/repo/src/d.ts', addedLines: 3, removedLines: 1 }],
            },
          },
        }),
        record('p6', 'tool.started', 'patch'),
        record('p6', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', modifiedPaths: ['src/d.ts'] },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.files).toHaveLength(1);
    expect(stats.files[0]).toMatchObject({
      path: 'src/d.ts',
      conflicted: true,
      added: 3,
      removed: 1,
      edits: 1,
    });
  });
  it('reports conflictedTruncated when the chronicle dropped conflicted paths', () => {
    // The chronicle caps modifiedPaths at 64; the flag must survive to the UI so
    // an operator never reads the surviving rows as a complete manifest.
    const story = buildSessionStory(
      'a',
      [
        record('p7', 'tool.started', 'patch'),
        record('p7', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: {
            toolName: 'patch',
            modifiedPaths: ['src/e.ts'],
            modifiedPathsTruncated: true,
          },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    const stats = storyStats(story, 'D:/repo');
    expect(stats.conflictedTruncated).toBe(true);
    // The kept row is still present and still conflicted.
    expect(stats.files).toHaveLength(1);
    expect(stats.files[0]).toMatchObject({ path: 'src/e.ts', conflicted: true });
  });

  it('leaves conflictedTruncated false when every conflicted path was recorded', () => {
    const story = buildSessionStory(
      'a',
      [
        record('p8', 'tool.started', 'patch'),
        record('p8', 'tool.failed', 'patch', {
          outcome: 'failure',
          attributes: { toolName: 'patch', modifiedPaths: ['src/f.ts'] },
        }),
      ],
      [],
      [],
      [],
      'D:/repo',
    );
    expect(storyStats(story, 'D:/repo').conflictedTruncated).toBe(false);
  });

  it('does not treat touching endpoints or zero-length lanes as concurrent', () => {
    const story = buildSessionStory('a', []);
    story.actors = [
      { id: 'a', name: 'a', start: 0, end: 10, events: 1 },
      { id: 'b', name: 'b', start: 10, end: 20, events: 1 },
      { id: 'c', name: 'c', start: 10, end: 10, events: 1 },
    ];
    expect(observedOverlap(story).peak).toBe(1);
  });
});
