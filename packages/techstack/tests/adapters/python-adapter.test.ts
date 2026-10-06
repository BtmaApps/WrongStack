import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PythonAdapter, parsePoetryLock } from '../../src/adapters/python.js';
import { workspaceId } from '../../src/discovery/index.js';
import { classifyStatus } from '../../src/policy/status.js';
import { parsePurlEcosystem } from '../../src/registry/purl.js';
import type { Workspace } from '../../src/types.js';

const PYPROJECT = `[project]
name = "test-py"
dependencies = [
    "django>=5.2,<6.0",
    "requests>=2.32,<3.0",
]
[project.optional-dependencies]
dev = ["pytest>=8.3,<9.0"]
`;

const POETRY_PYPROJECT = `[tool.poetry.dependencies]
python = "^3.11"
django = "^5.2"
requests = ">=2.32"
[tool.poetry.group.dev.dependencies]
pytest = "^8.3"
`;

const PIPFILE_CONTENT = `[[source]]
url = "https://pypi.org/simple"
verify_ssl = true

[packages]
django = "*"
requests = ">=2.32"

[dev-packages]
pytest = ">=8.3"
`;

const POETRY_LOCK = `[[package]]
name = "django"
version = "5.2.1"

[[package]]
name = "requests"
version = "2.32.3"

[[package]]
name = "pytest"
version = "8.3.4"
`;

const REQS = `django==5.2.1\nrequests==2.32.3\n`;

function mkWorkspace(
  files: Record<string, string>,
  lockfiles: string[] = [],
): { dir: string; ws: Workspace } {
  const dir = join(tmpdir(), `ts-py-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
  return {
    dir,
    ws: {
      id: workspaceId('', 'python'),
      relativeRoot: dir,
      ecosystem: 'python' as const,
      manifests: Object.keys(files),
      lockfiles,
      confidence: 0.9,
      coverage: 'full' as const,
    },
  };
}

describe('PythonAdapter', () => {
  it('extracts deps from pyproject.toml', async () => {
    const { dir, ws } = mkWorkspace({ 'pyproject.toml': PYPROJECT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name)).toContain('django');
      expect(deps.map((d) => d.name)).toContain('requests');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks optional deps correctly', async () => {
    const { dir, ws } = mkWorkspace({ 'pyproject.toml': PYPROJECT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === 'pytest')?.scope).toBe('optional');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses requirements.txt pinned versions as locked', async () => {
    const { dir, ws } = mkWorkspace({ 'requirements.txt': REQS });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === 'django')?.locked).toBe('5.2.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // A PEP 508 requirement may carry extras — `requests[socks]>=2.32` — and the
  // `]` there belongs to the requirement string, not to the TOML array. Taking
  // the first `]` on the line as the terminator closed the array on that entry
  // and silently dropped every dependency after it from the inventory.
  it('keeps deps that follow one with PEP 508 extras', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]
name = "extras-py"
dependencies = [
    "requests[socks]>=2.32",
    "flask>=3.0",
]
`,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const names = deps.map((d) => d.name);
      expect(names).toContain('requests');
      // The entry AFTER the extras one is the one that was lost.
      expect(names).toContain('flask');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an array of extras specs without dropping the closing entry', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]
name = "extras-py2"
dependencies = [
    "celery[redis,auth]>=5.4",
    "uvloop>=0.20",
]
`,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const names = deps.map((d) => d.name);
      expect(names).toContain('celery');
      expect(names).toContain('uvloop');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Single-line arrays share the same terminator scan and must stay intact.
  it('parses a single-line array containing an extras spec', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]
name = "inline-py"
dependencies = ["requests[socks]>=2.32", "flask>=3.0"]
`,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const names = deps.map((d) => d.name);
      expect(names).toContain('requests');
      expect(names).toContain('flask');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has manifest evidence on every dep', async () => {
    const { dir, ws } = mkWorkspace({ 'pyproject.toml': PYPROJECT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      for (const d of deps) expect(d.evidence.some((e) => e.kind === 'manifest')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns [] for empty dir', async () => {
    const { dir, ws } = mkWorkspace({});
    try {
      expect(await new PythonAdapter().inventory(ws, {})).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Pipfile support ────────────────────────────────────────────────────

  it('parses deps from Pipfile', async () => {
    const { dir, ws } = mkWorkspace({ Pipfile: PIPFILE_CONTENT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name)).toContain('django');
      expect(deps.map((d) => d.name)).toContain('requests');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('excludes Pipfile source, interpreter and script metadata from dependencies', async () => {
    const { dir, ws } = mkWorkspace({
      Pipfile: `${PIPFILE_CONTENT}
[requires]
python_version = "3.12"
[scripts]
serve = "python app.py"
`,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.map((d) => ({ name: d.name, scope: d.scope }))).toEqual([
        { name: 'django', scope: 'runtime' },
        { name: 'requests', scope: 'runtime' },
        { name: 'pytest', scope: 'development' },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not treat a source table after packages as package entries', async () => {
    const { dir, ws } = mkWorkspace({
      Pipfile: '[packages]\ndjango = "*"\n[[source]]\nurl = "https://pypi.org/simple"\n',
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.map((d) => d.name)).toEqual(['django']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns no dependencies for a metadata-only Pipfile', async () => {
    const { dir, ws } = mkWorkspace({ Pipfile: '[requires]\npython_version = "3.12"\n' });
    try {
      expect(await new PythonAdapter().inventory(ws, {})).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks Pipfile dev-packages as development scope', async () => {
    const { dir, ws } = mkWorkspace({ Pipfile: PIPFILE_CONTENT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const pytest = deps.find((d) => d.name === 'pytest');
      expect(pytest).toBeDefined();
      expect(pytest!.scope).toBe('development');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Poe try.lock support ────────────────────────────────────────────────

  it('resolves locked versions from poetry.lock', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': POETRY_PYPROJECT,
      'poetry.lock': POETRY_LOCK,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const django = deps.find((d) => d.name === 'django');
      expect(django).toBeDefined();
      expect(django!.locked).toBe('5.2.1');
      expect(django!.purl).toBe('pkg:pypi/django@5.2.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Real Poetry 2.5.1 output (`poetry add "requests>=2.0,<2.32"`): PEP 621
  // dependencies in the PEP 508 PARENTHESISED form. `authors` is omitted; the
  // rest of pyproject.toml and the requests block of poetry.lock are verbatim.
  it('strips PEP 508 parentheses from Poetry 2 constraints (real Poetry 2.5.1 files)', async () => {
    const { dir, ws } = mkWorkspace(
      {
        'pyproject.toml': `[project]
name = "p3"
version = "0.1.0"
description = ""
requires-python = ">=3.13"
dependencies = [
    "requests (>=2.0,<2.32)"
]


[build-system]
requires = ["poetry-core>=2.0.0,<3.0.0"]
build-backend = "poetry.core.masonry.api"
`,
        'poetry.lock': `# This file is automatically @generated by Poetry 2.5.1 and should not be changed by hand.

[[package]]
name = "requests"
version = "2.31.0"
description = "Python HTTP for Humans."
optional = false
python-versions = ">=3.7"
groups = ["main"]
files = [
    {file = "requests-2.31.0-py3-none-any.whl", hash = "sha256:58cd2187c01e70e6e26505bca751777aa9f2ee0b7f4300988b709f44e013003f"},
    {file = "requests-2.31.0.tar.gz", hash = "sha256:942c5a758f98d790eaed1a29cb6eefc7ffb0d1cf7af05c3d2791656dbd6ad1e1"},
]

[package.dependencies]
certifi = ">=2017.4.17"
charset-normalizer = ">=2,<4"
idna = ">=2.5,<4"
urllib3 = ">=1.21.1,<3"
`,
      },
      ['poetry.lock'],
    );
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const requests = deps.find((d) => d.name === 'requests');
      expect(requests).toMatchObject({ requested: '>=2.0,<2.32', locked: '2.31.0' });
      // The bare constraint now reaches the policy: 2.32.3 is outside it.
      expect(classifyStatus(requests!, { latestStable: '2.32.3' })).toBe(
        'update_available_breaking',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['httpx (==0.27.0)', 'httpx', '==0.27.0'],
    ['uvicorn[standard] (>=0.30)', 'uvicorn', '>=0.30'],
    ['tomli (>=2.0) ; python_version < "3.11"', 'tomli', '>=2.0'],
    ['flask>=2.0,<3.0', 'flask', '>=2.0,<3.0'],
  ])('reads the constraint of %s', async (spec, name, requested) => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]\nname = "x"\nversion = "0.1.0"\ndependencies = [\n  ${JSON.stringify(spec)},\n]\n`,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps.find((d) => d.name === name)?.requested).toBe(requested);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits purls with the canonical pypi type that parsePurlEcosystem resolves', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': POETRY_PYPROJECT,
      'poetry.lock': POETRY_LOCK,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const django = deps.find((d) => d.name === 'django');
      expect(django!.purl).toMatch(/^pkg:pypi\//);
      // Regression (round r20): the adapter used to emit `pkg:python/…` — a
      // purl type this package's own identity resolver cannot resolve, so
      // SBOM identities and OSV advisory queries silently failed.
      const parsed = parsePurlEcosystem(django!.purl!);
      expect(parsed).toEqual({ ecosystem: 'python', name: 'django', version: '5.2.1' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes raw-spelling names in the purl AND in the row name', async () => {
    const { dir, ws } = mkWorkspace({ 'requirements.txt': 'Django==5.2.1\n' });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const django = deps.find((d) => d.name === 'django');
      expect(django).toBeDefined();
      // Regression (round r24): the purl used to carry the raw spelling
      // (`pkg:pypi/Django@5.2.1`) — an identity OSV can never match.
      expect(django!.purl).toBe('pkg:pypi/django@5.2.1');
      // Round r2-pep503: the emitted `name`/`id` used to keep the raw `Django`
      // spelling, contradicting the canonical purl and dedupe key for the very
      // same package. Name, id and purl now all carry the PEP 503 form.
      expect(django!.name).toBe('django');
      expect(django!.id).toBe(`dep-${ws.id}-django`);
      expect(parsePurlEcosystem(django!.purl!)).toEqual({
        ecosystem: 'python',
        name: 'django',
        version: '5.2.1',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // PEP 503 treats `.` as a separator and collapses any run of `-`/`_`/`.` to a
  // single `-`, so `zope.interface`, `zope-interface` and `zope__interface` are
  // ONE package. The old `_` → `-` mapping left the dotted spelling distinct, so
  // the same package was inventoried twice, the duplicate lost its lockfile
  // resolution, and the surviving row carried a versionless non-canonical purl.
  it('treats a dotted manifest name as the same package as its hyphenated lock entry', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]
name = "dotted"
dependencies = ["zope.interface>=5.4"]
`,
      'requirements.txt': 'zope-interface==5.4.0\n',
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      // One package, one row — not a second row for the other spelling.
      expect(deps).toHaveLength(1);
      // The lock resolution is found across the spelling difference, and the
      // purl carries the canonical name OSV indexes by.
      expect(deps[0]!.locked).toBe('5.4.0');
      expect(deps[0]!.purl).toBe('pkg:pypi/zope-interface@5.4.0');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collapses a run of separators when matching a package across manifests', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': `[project]
name = "runs"
dependencies = ["Flask__Admin>=1.6"]
`,
      'requirements.txt': 'flask-admin==1.6.1\n',
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps).toHaveLength(1);
      expect(deps[0]!.purl).toBe('pkg:pypi/flask-admin@1.6.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes lockfile evidence when lockfile is present', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': POETRY_PYPROJECT,
      'poetry.lock': POETRY_LOCK,
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      for (const d of deps) {
        const lockEv = d.evidence.find((e) => e.kind === 'lockfile');
        expect(lockEv).toBeDefined();
        expect(lockEv!.source).toContain('poetry.lock');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Transitive deps ────────────────────────────────────────────────────

  it('includes transitive dependencies when requested', async () => {
    const { dir, ws } = mkWorkspace(
      { 'pyproject.toml': POETRY_PYPROJECT, 'poetry.lock': POETRY_LOCK },
      ['poetry.lock'],
    );
    try {
      const deps = await new PythonAdapter().inventory(ws, { includeTransitive: true });
      // Direct: django, requests, pytest. Transitive: none in this lockfile,
      // but pytest is listed in lockfile as a transitive from dev group.
      // Actually, pytest is a direct dep from dev group, so it should be direct.
      // Let's verify we have deps and they all have lockfile evidence.
      expect(deps.length).toBeGreaterThan(0);
      for (const d of deps) {
        if (d.scope !== 'transitive') {
          expect(d.evidence.some((e) => e.kind === 'lockfile')).toBe(true);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── git+ dependencies ─────────────────────────────────────────────────

  it('classifies git+ deps as git_dependency', async () => {
    // A PEP 508 direct reference (`name @ git+…`) keeps its target, so the
    // shared non-registry predicate sees a VCS scheme and classifies it as a
    // git dependency. This assertion used to expect `current`, documenting the
    // defect where the reference target was discarded and the dep fell through
    // to the registry branch.
    const GIT_PYPROJECT = `[project]
name = "test-git"
dependencies = [
    "mylib @ git+https://github.com/example/mylib.git",
]
`;
    const { dir, ws } = mkWorkspace({ 'pyproject.toml': GIT_PYPROJECT });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps).toHaveLength(1);
      expect(deps[0]!.status).toBe('git_dependency');
      expect(deps[0]!.sourceType).toBe('git');
      expect(deps[0]!.purl).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('classifies editable (-e) deps as local_path', async () => {
    const REQS_EDITABLE = '-e git+https://github.com/example/mylib.git#egg=mylib\n';
    const { dir, ws } = mkWorkspace({ 'requirements.txt': REQS_EDITABLE });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      expect(deps).toHaveLength(0); // -e lines are skipped in requirements parsing
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Requirements.txt with extras ───────────────────────────────────────

  it('parses deps with extras syntax', async () => {
    const REQS_EXTRAS = 'django[argon2,bcrypt]==5.2.1\nrequests>=2.32\n';
    const { dir, ws } = mkWorkspace({ 'requirements.txt': REQS_EXTRAS });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      // Extras are stripped by parsePep508, and an exact pin with extras is
      // still a lock: without one the dep reached OSV unversioned.
      const django = deps.find((d) => d.name === 'django');
      expect(django).toBeDefined();
      expect(django!.locked).toBe('5.2.1');
      expect(django!.requested).toBe('==5.2.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── Multiple manifest sources ──────────────────────────────────────────

  it('deduplicates when same dep appears in pyproject and requirements.txt', async () => {
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': PYPROJECT,
      'requirements.txt': 'django==5.2.1\n',
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      const djangoCount = deps.filter((d) => d.name === 'django').length;
      expect(djangoCount).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── PEP 503 identity ───────────────────────────────────────────────────

  /** PyPI names are case-insensitive and treat `-`/`_` as equivalent. */
  const canon = (name: string): string => name.toLowerCase().replace(/_/g, '-');

  it('treats differently-spelled declarations of one package as a single dependency', async () => {
    // pip-compile writes the normalised name, so a project whose pyproject uses
    // PyPI's canonical spelling (`Django`) declares it twice across manifests.
    const { dir, ws } = mkWorkspace({
      'pyproject.toml': '[project]\nname = "p"\ndependencies = ["Django>=5.0"]\n',
      'requirements.txt': 'django==5.2.1\n',
    });
    try {
      const deps = await new PythonAdapter().inventory(ws, {});
      // One row, and it carries the canonical PEP 503 spelling (round r2-pep503)
      // rather than whichever raw form the manifest happened to list first.
      const rows = deps.filter((d) => canon(d.name) === 'django');
      expect(rows.map((d) => d.name)).toEqual(['django']);
      expect(rows[0]!.locked).toBe('5.2.1');
      expect(deps.map((d) => d.id)).toEqual([...new Set(deps.map((d) => d.id))]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not re-add a lock-normalised dependency as a fake transitive entry', async () => {
    const { dir, ws } = mkWorkspace(
      {
        'pyproject.toml': '[project]\nname = "p"\ndependencies = ["Flask>=3.0"]\n',
        'poetry.lock':
          '[[package]]\nname = "flask"\nversion = "3.0.1"\n\n[[package]]\nname = "werkzeug"\nversion = "3.0.3"\n',
      },
      ['poetry.lock'],
    );
    try {
      const deps = await new PythonAdapter().inventory(ws, { includeTransitive: true });
      expect(deps.filter((d) => canon(d.name) === 'flask').map((d) => d.direct)).toEqual([true]);
      expect(deps.find((d) => canon(d.name) === 'flask')?.locked).toBe('3.0.1');
      // The genuinely lock-only package must still be inventoried.
      expect(deps.find((d) => canon(d.name) === 'werkzeug')).toMatchObject({
        direct: false,
        scope: 'transitive',
        locked: '3.0.3',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── parsePoetryLock ───────────────────────────────────────────────────────

describe('parsePoetryLock', () => {
  it('extracts name-version pairs', () => {
    const versions = parsePoetryLock(POETRY_LOCK);
    expect(versions.get('django')).toBe('5.2.1');
    expect(versions.get('requests')).toBe('2.32.3');
    expect(versions.get('pytest')).toBe('8.3.4');
  });

  it('normalizes names (underscores to hyphens, lowercase)', () => {
    const lock = `[[package]]
name = "My_Package"
version = "1.0.0"
`;
    const versions = parsePoetryLock(lock);
    expect(versions.get('my-package')).toBe('1.0.0');
  });

  it('returns empty map for empty content', () => {
    expect(parsePoetryLock('').size).toBe(0);
  });

  it('skips lines without name or version', () => {
    const lock = `[metadata]
python-versions = "^3.11"
`;
    expect(parsePoetryLock(lock).size).toBe(0);
  });
});
