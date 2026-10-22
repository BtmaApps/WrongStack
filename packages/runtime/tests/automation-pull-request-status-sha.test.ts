import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationPullRequests } from '../src/automation/pull-request.js';

describe('AutomationPullRequests legacy status identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects a legacy commit status whose sha differs from the published receipt', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.temp_files', 'pr-status-sha-'));
    const runId = 'run-1';
    const commit = 'a'.repeat(40);
    await mkdir(path.join(root, 'runs', runId), { recursive: true });
    await writeFile(
      path.join(root, 'runs', runId, 'pull-request.json'),
      JSON.stringify({
        plan: {
          repository: 'owner/repo',
          base: 'main',
          branch: 'wrongstack/automation/run-1',
        },
        receipt: { number: 7, commit },
        ci: null,
      }),
    );
    vi.stubEnv('GITHUB_TOKEN', 'proof-token');
    vi.stubGlobal('fetch', async (url: string | URL | Request) => {
      const route = String(url);
      if (route.endsWith('/pulls/7')) {
        return Response.json({
          number: 7,
          state: 'open',
          draft: true,
          head: {
            sha: commit,
            ref: 'wrongstack/automation/run-1',
            repo: { full_name: 'owner/repo' },
          },
          base: { ref: 'main', repo: { full_name: 'owner/repo' } },
        });
      }
      if (route.includes('/check-runs?')) return Response.json({ total_count: 0, check_runs: [] });
      if (route.includes('/status?')) {
        return Response.json({
          total_count: 1,
          statuses: [{ context: 'legacy-ci', state: 'success', sha: 'b'.repeat(40) }],
        });
      }
      throw new Error(`unexpected route: ${route}`);
    });

    const store = {
      directory: root,
      snapshot: async () => ({ runs: [{ id: runId }] }),
    };
    await expect(new AutomationPullRequests(store as never).check(runId)).rejects.toThrow(
      'CI status is invalid',
    );
  });
});
