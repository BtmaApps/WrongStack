import { describe, expect, it } from 'vitest';
import { gradeLocalManifest } from '../src/graders/local-manifest-grader.js';
import { loadSubsetIds } from '../src/suites/bundled.js';
import { createHardSuite, HARD_TASK_COUNT } from '../src/suites/hard.js';

describe('createHardSuite', () => {
  it('loads the eight bundled discriminating tasks under the hard/ prefix', async () => {
    const suite = createHardSuite();
    expect(suite.id).toBe('hard');
    const tasks = await suite.loadTasks({});
    expect(tasks).toHaveLength(HARD_TASK_COUNT);
    expect(tasks.every((t) => t.id.startsWith('hard/') && t.suite === 'hard')).toBe(true);
    expect(suite.subsetId(tasks)).toMatch(/^hard:[0-9a-f]{12}$/);
  });

  it('grades every shipping fixture as a failure so a no-op model cannot pass', async () => {
    const tasks = await createHardSuite().loadTasks({});
    for (const task of tasks) {
      const grade = await gradeLocalManifest({
        workdir: task.templateDir,
        task,
        timeoutMs: 10_000,
      });
      expect(grade.passed, task.id).toBe(false);
    }
  });
});

describe('loadSubsetIds', () => {
  it('resolves a bundled subset by name to its pinned, language-balanced ids', async () => {
    const ids = await loadSubsetIds('polyglot-wstack-40', process.cwd());
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    for (const lang of ['python', 'javascript', 'go', 'rust']) {
      expect(
        ids.filter((id) => id.startsWith(`polyglot/${lang}/`)),
        lang,
      ).toHaveLength(10);
    }
  });

  it('pins the full set minus the two Boost-only cpp exercises', async () => {
    const ids = await loadSubsetIds('polyglot-wstack-223', process.cwd());
    expect(ids).toHaveLength(223);
    expect(ids).not.toContain('polyglot/cpp/gigasecond');
    expect(ids).not.toContain('polyglot/cpp/meetup');
  });

  it('rejects an unknown subset name', async () => {
    await expect(loadSubsetIds('no-such-subset', process.cwd())).rejects.toThrow(
      /subset not found/,
    );
  });
});
