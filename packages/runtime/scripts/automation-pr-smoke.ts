/** Real Git + compiled CLI proof. Agent/Docker output is a deterministic boundary fixture; no remote writes. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutomationService } from '../src/automation/service.js';
import { AutomationStore } from '../src/automation/store.js';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const entry = path.join(repository, 'packages/cli/dist/index.js');
const root = await mkdtemp(path.join(os.tmpdir(), 'wrongstack-pr-cli-proof-'));
const git = (...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { windowsHide: true, timeout: 15_000 })
    .toString()
    .trim();
try {
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'core.autocrlf', 'false');
  await writeFile(path.join(root, '.gitignore'), 'state/\n');
  await writeFile(path.join(root, 'parser.txt'), 'before\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD'),
    source = git('write-tree');
  await writeFile(path.join(root, 'parser.txt'), 'after\n');
  git('add', 'parser.txt');
  const tree = git('write-tree');
  const patch = execFileSync('git', [
    '-C',
    root,
    'diff',
    '--cached',
    '--binary',
    'HEAD',
  ]).toString();
  await writeFile(path.join(root, 'parser.txt'), 'before\n');
  git('add', 'parser.txt');
  const store = new AutomationStore(path.join(root, 'state'));
  const job = await store.add({
    name: 'Verified parser fix',
    projectRoot: root,
    image: 'fixture:local',
    prompt: 'Fix parser',
    envNames: [],
    enabled: true,
    yolo: false,
    timeoutMs: 1000,
    verification: { commands: [['bun', 'run', 'test']], timeoutMs: 1000 },
  });
  const run = await store.enqueue(job.id);
  const service = new AutomationService(store, async (options) => ({
    id: options.id!,
    ownerToken: options.ownerToken!,
    exitCode: 0,
    cleanup: 'removed',
    snapshotRevision: base,
    sourceTree: source,
    inputTree: options.command === 'wstack' ? source : tree,
    outputTree: tree,
    imageId: `sha256:${'a'.repeat(64)}`,
    patch,
    output: '',
    stepResults: [{ exitCode: 0, durationMs: 1, output: 'fixture passed' }],
  }));
  await service.tick();
  await service.idle();
  const cli = (args: string[]) =>
    spawnSync(process.execPath, [entry, 'automation', ...args, '--data-dir', store.directory], {
      cwd: root,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 30_000,
    });
  const prepared = cli([
    'pr-prepare',
    run.id,
    '--repository',
    'owner/repo',
    '--base',
    'main',
    '--title',
    'Fix parser',
  ]);
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
  const view = JSON.parse(prepared.stdout);
  assert.equal(view.plan.candidateTree, tree);
  assert.deepEqual(view.plan.files, ['parser.txt']);
  assert.equal(view.receipt, null);
  const inspected = cli(['pr-view', run.id]);
  assert.equal(inspected.status, 0);
  assert.equal(JSON.parse(inspected.stdout).plan.fingerprint, view.plan.fingerprint);
  const refused = cli(['pr-publish', run.id]);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout + refused.stderr, /fingerprint/);
  const refusedRepair = cli(['pr-follow-up', run.id]);
  assert.equal(refusedRepair.status, 1);
  assert.match(refusedRepair.stdout + refusedRepair.stderr, /fingerprint/);
  const requiresPublishedPR = cli(['pr-follow-up', run.id, '--ci', '0'.repeat(64)]);
  assert.equal(requiresPublishedPR.status, 1);
  assert.match(
    requiresPublishedPR.stdout + requiresPublishedPR.stderr,
    /Publish the prepared draft PR/,
  );
  assert.equal(await readFile(path.join(root, 'parser.txt'), 'utf8'), 'before\n');
  assert.equal(git('write-tree'), source);
  assert.equal(git('rev-parse', 'HEAD'), base);
  process.stdout.write(
    'PASS: compiled CLI prepares and inspects a verified PR plan, refuses publication without its fingerprint, preserves project/index/HEAD; no GitHub writes\n',
  );
} finally {
  if (
    path.dirname(root) === os.tmpdir() &&
    path.basename(root).startsWith('wrongstack-pr-cli-proof-')
  )
    await rm(root, { recursive: true, force: true });
}
