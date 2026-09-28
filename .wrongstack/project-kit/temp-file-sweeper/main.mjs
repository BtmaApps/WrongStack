// temp-file-sweeper: report, relocate or delete stray top-level temporary files.
// Safety posture: the top level only, `report` as the default, and mutation gated
// on git-untracked evidence for the swept root itself.
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const KIT_PREFIX = '@kit/';
const GIT_PREFIX = '@git/';
const UNKNOWN_EVIDENCE = 'tracked-state-unknown';

// Never swept, whatever the extension filter says. Lowercase: matched case-insensitively.
const PROTECTED_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  '.gitignore',
  '.gitattributes',
  'readme.md',
  'agents.md',
  'license',
  'license.md',
  'changelog.md',
  'kit.json',
  'main.mjs',
]);

function extensionSet(values) {
  const result = new Set();
  for (const value of values) {
    const normalized = String(value).trim().toLowerCase();
    if (normalized) result.add(normalized.startsWith('.') ? normalized : `.${normalized}`);
  }
  return result;
}

function segmentsOf(value, label) {
  const segments = String(value).split('/');
  if (
    segments.some(
      (part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes(':'),
    )
  )
    throw new Error(`${label} must be a plain relative path`);
  return segments;
}

/** Untracked names for this exact work tree, or null when no evidence exists. */
function untrackedNames(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // A parent repository's answer would describe paths we are not sweeping.
    if (!top || path.resolve(top) !== path.resolve(root)) return null;
    const listed = execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard', '--', '.'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 },
    );
    return new Set(
      listed
        .split('\0')
        .filter(Boolean)
        .map((name) => name.split(path.sep).join('/')),
    );
  } catch {
    return null;
  }
}

/** Runs git inside `cwd`. A failure is a fixture defect and must stay loud. */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * `@git/<path>` turns the copied fixture into a throwaway work tree and stages
 * the names listed in the fixture `.staged` JSON array, so a case can assert how
 * a genuinely tracked file is classified. `git add` alone suffices: a file in the
 * index stops being reported by `ls-files --others`, and staging needs no commit
 * and therefore no git identity.
 */
async function initializeWorkTree(scratch, ctx) {
  git(scratch, ['init', '--quiet']);
  // Hermetic fixture: a developer's global core.excludesFile must not decide what
  // this throwaway work tree reports as untracked.
  git(scratch, [
    'config',
    'core.excludesFile',
    path.join(scratch, '.git', 'info', 'exclude').split(path.sep).join('/'),
  ]);
  const marker = path.join(scratch, '.staged');
  let staged = [];
  try {
    const parsed = JSON.parse(await readFile(marker, 'utf8'));
    if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string' || !name))
      throw new Error('.staged must be a JSON array of file names');
    staged = parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (staged.length) git(scratch, ['add', '--', ...staged]);
  await rm(marker, { force: true });
  ctx.log(`Throwaway work tree ready, staged: ${staged.join(', ') || 'nothing'}`);
}

/** Fixed so an aged fixture yields identical results on every run. */
const AGED_MTIME = new Date('2001-01-01T00:00:00.000Z');

/**
 * A fixture may ship an `.aged` JSON array naming files whose mtime is backdated
 * to AGED_MTIME. That is how the `sinceMinutes` window is verified without
 * depending on when the fixture happened to be checked out, since copying a
 * fixture always stamps it with the current time. The marker is removed before
 * the sweep so it never counts as a top-level file.
 */
async function ageFixtureFiles(scratch, ctx) {
  const marker = path.join(scratch, '.aged');
  let aged = [];
  try {
    const parsed = JSON.parse(await readFile(marker, 'utf8'));
    if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string' || !name))
      throw new Error('.aged must be a JSON array of file names');
    aged = parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  for (const name of aged) await utimes(path.join(scratch, name), AGED_MTIME, AGED_MTIME);
  if (aged.length) ctx.log(`Backdated ${aged.length} fixture file(s) to 2001-01-01`);
  await rm(marker, { force: true });
}

/** `@kit/<path>` and `@git/<path>` sweep a disposable copy of bundled fixtures. */
async function openRoot(input, ctx) {
  const { root } = input;
  if (!root.startsWith(KIT_PREFIX) && !root.startsWith(GIT_PREFIX))
    return { directory: ctx.resolvePath(root), scratch: null };
  const withGit = root.startsWith(GIT_PREFIX);
  const prefix = withGit ? GIT_PREFIX : KIT_PREFIX;
  const segments = segmentsOf(root.slice(prefix.length), 'root');
  const scratch = await mkdtemp(path.join(tmpdir(), 'temp-file-sweeper-'));
  await cp(path.join(ctx.kitRoot, ...segments), scratch, { recursive: true });
  await ageFixtureFiles(scratch, ctx);
  if (withGit) await initializeWorkTree(scratch, ctx);
  ctx.log('Sweeping a disposable copy of bundled fixtures');
  return { directory: scratch, scratch };
}

export async function run(input, ctx) {
  ctx.signal.throwIfAborted();
  const extensions = extensionSet(input.extensions);
  const windowMs = input.sinceMinutes * 60000;
  const { directory, scratch } = await openRoot(input, ctx);
  try {
    const untracked = untrackedNames(directory);
    const quarantine = segmentsOf(input.quarantineDir, 'quarantineDir');
    const reporting = input.mode === 'report';
    ctx.log(`mode=${input.mode} root=${input.root} evidence=${untracked ? 'work-tree' : 'none'}`);
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const candidates = [];
    const skipped = [];
    const moved = [];
    const deleted = [];
    let scanned = 0;
    for (const entry of entries) {
      ctx.signal.throwIfAborted();
      if (!entry.isFile()) continue;
      scanned += 1;
      const name = entry.name;
      if (!extensions.has(path.extname(name).toLowerCase())) continue;
      const info = await stat(path.join(directory, name));
      if (windowMs > 0 && Date.now() - info.mtimeMs > windowMs) {
        skipped.push({ path: name, reason: 'outside-time-window' });
        continue;
      }
      if (PROTECTED_NAMES.has(name.toLowerCase())) {
        skipped.push({ path: name, reason: 'protected-name' });
        continue;
      }
      const reason =
        untracked === null ? UNKNOWN_EVIDENCE : untracked.has(name) ? 'untracked' : 'tracked';
      // Reporting changes nothing, so it lists every match with its evidence.
      // A mutation only touches what git proves untracked, unless overridden.
      if (!reporting && reason !== 'untracked' && !input.includeTracked) {
        skipped.push({ path: name, reason });
        continue;
      }
      if (candidates.length >= input.maxActions) {
        skipped.push({ path: name, reason: 'max-actions-reached' });
        continue;
      }
      candidates.push({ path: name, bytes: info.size, reason });
    }
    if (!reporting) {
      const target = path.join(directory, ...quarantine);
      const taken = new Set();
      if (input.mode === 'move') {
        await mkdir(target, { recursive: true });
        for (const existing of await readdir(target)) taken.add(existing.toLowerCase());
      }
      for (const candidate of candidates) {
        ctx.signal.throwIfAborted();
        if (input.mode === 'delete') {
          await unlink(path.join(directory, candidate.path));
          deleted.push({ path: candidate.path, bytes: candidate.bytes });
          continue;
        }
        const extension = path.extname(candidate.path);
        const base = candidate.path.slice(0, candidate.path.length - extension.length);
        let name = candidate.path;
        let suffix = 0;
        while (taken.has(name.toLowerCase())) {
          suffix += 1;
          name = `${base}-${suffix}${extension}`;
        }
        taken.add(name.toLowerCase());
        await rename(path.join(directory, candidate.path), path.join(target, name));
        moved.push({ from: candidate.path, to: path.posix.join(input.quarantineDir, name) });
      }
    }
    ctx.log(
      `scanned=${scanned} candidates=${candidates.length} acted=${moved.length + deleted.length}`,
    );
    return {
      mode: input.mode,
      root: input.root,
      gitWorkTree: untracked !== null,
      scanned,
      candidates,
      moved,
      deleted,
      skipped,
    };
  } finally {
    if (scratch) {
      await rm(scratch, { recursive: true, force: true }).catch((error) => {
        ctx.log(`scratch cleanup failed: ${error?.message ?? error}`);
      });
    }
  }
}
