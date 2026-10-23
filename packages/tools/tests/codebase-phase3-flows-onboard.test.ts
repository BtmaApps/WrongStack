import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  codebaseFlowTraceTool,
  codebaseOnboardTool,
  detectInfraArtifactKind,
  discoverConventionTestFiles,
  enrichConcepts,
  extractLanguagePatternNotes,
  parseInfraArtifact,
  runIndexer,
  setEcosystemBridgeProvider,
  writeOnboardingAtlas,
} from '../src/codebase-index/index.js';
import { IndexStore, indexStorePool } from '../src/codebase-index/writer.js';

let tmpDir: string;
let indexDir: string;
let store: IndexStore | null = null;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wstack-phase3-'));
  indexDir = path.join(tmpDir, '.idx');
});

afterEach(async () => {
  store?.close();
  store = null;
  indexStorePool.evict(tmpDir, indexDir);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(rel: string, body: string): Promise<void> {
  const full = path.join(tmpDir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, 'utf8');
}

describe('Phase 3.1: Polyglot Infrastructure, CI/CD & Schema Parser', () => {
  it('extracts stages, env vars, ports, and cross-stage COPY refs from Dockerfile', () => {
    const content = [
      'FROM oven/bun:1.2 AS builder',
      'ARG NODE_ENV=production',
      'FROM gcr.io/distroless/base AS runtime',
      'ENV PORT=8080',
      'COPY --from=builder /app/dist /app/dist',
      'EXPOSE 8080/tcp',
    ].join('\n');

    expect(detectInfraArtifactKind('Dockerfile')).toBe('dockerfile');
    const res = parseInfraArtifact({ file: 'Dockerfile', content });
    expect(res.kind).toBe('dockerfile');
    expect(res.symbols.map((s) => s.name)).toEqual([
      'builder',
      'NODE_ENV',
      'runtime',
      'PORT',
      'EXPOSE:8080/tcp',
    ]);
    expect(res.refs.map((r) => [r.callType, r.toName])).toContainEqual(['call', 'builder']);
  });

  it('extracts services and depends_on edges from docker-compose.yml and jobs/needs from GitHub workflows', () => {
    const compose = [
      'services:',
      '  db:',
      '    image: postgres:16',
      '  api:',
      '    image: myapp/api:latest',
      '    depends_on:',
      '      - db',
    ].join('\n');
    const composeRes = parseInfraArtifact({ file: 'docker-compose.yml', content: compose });
    expect(composeRes.kind).toBe('docker-compose');
    expect(composeRes.symbols.map((s) => s.name)).toEqual(['db', 'api']);
    expect(composeRes.refs.map((r) => [r.callType, r.toName])).toContainEqual(['call', 'db']);

    const workflow = [
      'name: CI',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '  test:',
      '    needs: [lint]',
      '    runs-on: ubuntu-latest',
    ].join('\n');
    const wfRes = parseInfraArtifact({ file: '.github/workflows/ci.yml', content: workflow });
    expect(wfRes.kind).toBe('github-workflow');
    expect(wfRes.symbols.map((s) => s.name)).toEqual(['lint', 'test']);
    expect(wfRes.refs.map((r) => [r.callType, r.toName])).toContainEqual(['call', 'lint']);
    expect(wfRes.refs.map((r) => [r.callType, r.toName])).toContainEqual([
      'import',
      'actions/checkout@v4',
    ]);
  });

  it('extracts SQL foreign keys, GraphQL type references, Protobuf RPC message refs, and Makefile target prereqs', () => {
    const sqlRes = parseInfraArtifact({
      file: 'schema.sql',
      content: [
        'CREATE TABLE users (id INT PRIMARY KEY);',
        'CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));',
      ].join('\n'),
    });
    expect(sqlRes.symbols.map((s) => s.name)).toEqual(['users', 'orders']);
    expect(sqlRes.refs.map((r) => r.toName)).toEqual(['users']);

    const gqlRes = parseInfraArtifact({
      file: 'schema.graphql',
      content: [
        'interface Node { id: ID! }',
        'type User implements Node {',
        '  id: ID!',
        '  profile: UserProfile!',
        '}',
      ].join('\n'),
    });
    expect(gqlRes.symbols.map((s) => s.name)).toEqual(['Node', 'User']);
    expect(gqlRes.refs.map((r) => [r.callType, r.toName])).toEqual([
      ['implement', 'Node'],
      ['type_ref', 'UserProfile'],
    ]);

    const protoRes = parseInfraArtifact({
      file: 'billing.proto',
      content: [
        'service BillingService {',
        '  rpc Charge (ChargeRequest) returns (ChargeResponse);',
        '}',
      ].join('\n'),
    });
    expect(protoRes.symbols.map((s) => s.name)).toEqual(['BillingService', 'Charge']);
    expect(protoRes.refs.map((r) => r.toName)).toEqual(['ChargeRequest', 'ChargeResponse']);

    const makeRes = parseInfraArtifact({
      file: 'Makefile',
      content: ['build: compile bundle', '\techo done'].join('\n'),
    });
    expect(makeRes.symbols.map((s) => s.name)).toEqual(['build']);
    expect(makeRes.refs.map((r) => r.toName)).toEqual(['compile', 'bundle']);

    const dotenvRes = parseInfraArtifact({
      file: '.env.example',
      content: [
        'DATABASE_URL=postgres://localhost:5432/app',
        'READ_REPLICA_URL=${DATABASE_URL}',
      ].join('\n'),
    });
    expect(dotenvRes.kind).toBe('dotenv');
    expect(dotenvRes.symbols.map((s) => s.name)).toEqual(['DATABASE_URL', 'READ_REPLICA_URL']);
    expect(dotenvRes.refs.map((r) => r.toName)).toContain('DATABASE_URL');

    const openapiRes = parseInfraArtifact({
      file: 'openapi.yaml',
      content: [
        'openapi: 3.1.0',
        'paths:',
        '  /users:',
        '    get:',
        '      responses:',
        '        "200":',
        '          $ref: "#/components/schemas/User"',
        'components:',
        '  schemas:',
        '    User:',
        '      type: object',
      ].join('\n'),
    });
    expect(openapiRes.kind).toBe('openapi');
    expect(openapiRes.symbols.map((s) => s.name)).toContain('/users');
    expect(openapiRes.symbols.map((s) => s.name)).toContain('User');
    expect(openapiRes.refs.map((r) => r.toName)).toContain('User');

    const tfRes = parseInfraArtifact({
      file: 'infra/main.tf',
      content: [
        'variable "db_name" { type = string }',
        'module "vpc" {',
        '  source = "./modules/vpc"',
        '}',
        'resource "aws_db_instance" "primary" {',
        '  db_name = var.db_name',
        '  vpc_security_group_ids = [module.vpc.sg_id]',
        '}',
      ].join('\n'),
    });
    expect(tfRes.kind).toBe('terraform');
    expect(tfRes.symbols.map((s) => s.name)).toEqual([
      'var.db_name',
      'module.vpc',
      'aws_db_instance.primary',
    ]);
    expect(tfRes.refs.map((r) => [r.callType, r.toName])).toContainEqual([
      'import',
      './modules/vpc',
    ]);
    expect(tfRes.refs.map((r) => [r.callType, r.toName])).toContainEqual(['call', 'var.db_name']);
    expect(tfRes.refs.map((r) => [r.callType, r.toName])).toContainEqual(['call', 'module.vpc']);

    const k8sRes = parseInfraArtifact({
      file: 'k8s/deployment.yaml',
      content: [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'metadata:',
        '  name: api-gateway',
        'spec:',
        '  template:',
        '    spec:',
        '      containers:',
        '        - name: app',
        '          image: ghcr.io/org/api:1.2.0',
        '      serviceName: redis-primary',
      ].join('\n'),
    });
    expect(k8sRes.kind).toBe('kubernetes');
    expect(k8sRes.symbols.map((s) => s.name)).toEqual(['Deployment:api-gateway']);
    expect(k8sRes.refs.map((r) => [r.callType, r.toName])).toContainEqual([
      'import',
      'ghcr.io/org/api:1.2.0',
    ]);
    expect(k8sRes.refs.map((r) => [r.callType, r.toName])).toContainEqual([
      'call',
      'redis-primary',
    ]);

    const mdRes = parseInfraArtifact({
      file: 'docs/architecture.md',
      content: [
        '# Architecture',
        'See [[AuthFlow#Token|Auth Flow]] and [Guide](./onboarding.md#step-1).',
      ].join('\n'),
    });
    expect(mdRes.kind).toBe('markdown-wiki');
    expect(mdRes.symbols).toEqual([]);
    expect(mdRes.refs.map((r) => r.toName)).toEqual(['AuthFlow', './onboarding.md']);

    const shRes = parseInfraArtifact({
      file: 'scripts/deploy.sh',
      content: ['#!/usr/bin/env bash', 'source ./scripts/common.sh', '. "./env.sh"'].join('\n'),
    });
    expect(shRes.kind).toBe('shell');
    expect(shRes.symbols).toEqual([]);
    expect(shRes.refs.map((r) => r.toName)).toEqual(['./scripts/common.sh', './env.sh']);
  });

  it('discovers companion test files by naming convention alongside call-graph edges', async () => {
    await write('src/billing/invoice.ts', 'export const calc = () => 1;\n');
    await write('src/billing/invoice.test.ts', 'import { calc } from "./invoice";\n');
    await write('tests/router.spec.ts', 'export {};\n');

    const discovered = discoverConventionTestFiles(tmpDir, [
      'src/billing/invoice.ts',
      'src/api/router.ts',
    ]);
    expect(discovered).toEqual(['src/billing/invoice.test.ts', 'tests/router.spec.ts']);
  });
});

describe('Phase 3.2 & 3.3: Execution Flow Slicer (`codebase-flow-trace`) & Onboarding Tour (`codebase-onboard`)', () => {
  async function seedLayeredApp(): Promise<void> {
    await write(
      'src/db/repository.ts',
      `export interface UserRecord { id: string; email: string; }
export function findUserByEmail(email: string): UserRecord {
  return { id: 'u1', email };
}
`,
    );
    await write(
      'src/services/auth-service.ts',
      `import { findUserByEmail, type UserRecord } from '../db/repository.js';
export function authenticateUser(email: string): UserRecord {
  return findUserByEmail(email);
}
`,
    );
    await write(
      'src/api/routes.ts',
      `import { authenticateUser } from '../services/auth-service.js';
export function handleLoginRequest(email: string): string {
  const user = authenticateUser(email);
  return user.id;
}
`,
    );
    await runIndexer(undefined as never, { projectRoot: tmpDir, indexDir });
  }

  it('discovers entry points and slices forward execution flows (`Domain -> Flow -> Step`)', async () => {
    await seedLayeredApp();

    const result = await codebaseFlowTraceTool.execute(
      { symbol: 'handleLoginRequest', maxDepth: 4, persist: true },
      {
        cwd: tmpDir,
        projectRoot: tmpDir,
        meta: { codebaseIndexDir: indexDir },
      } as never,
      { signal: new AbortController().signal },
    );

    expect(result.status).toBe('ok');
    expect(result.persistedPaths).toEqual({
      jsonPath: '.wrongstack/atlas/flows.json',
      markdownPath: '.wrongstack/atlas/FLOWS.md',
    });
    expect(result.flows).toHaveLength(1);
    const flow = result.flows[0]!;
    expect(flow.entrySymbol).toBe('handleLoginRequest');
    expect(flow.steps.map((s) => s.symbol)).toEqual([
      'handleLoginRequest',
      'authenticateUser',
      'findUserByEmail',
    ]);
    expect(flow.steps.map((s) => s.depth)).toEqual([0, 1, 2]);
  });

  it('builds a dependency-ordered onboarding tour with crux line spans and markdown output', async () => {
    await seedLayeredApp();
    store = new IndexStore(tmpDir, { indexDir });
    await enrichConcepts(
      store,
      {
        describeFile: async (input) => ({
          summary: `Core responsibility for ${input.file}.`,
          cruxStart: 2,
          cruxEnd: 4,
          model: 'test-model',
        }),
      },
      (f) => path.relative(tmpDir, f).replace(/\\/g, '/'),
    );
    store.close();
    store = null;

    setEcosystemBridgeProvider(() => [
      {
        id: 'sage-onboard-1',
        kind: 'convention',
        text: 'All database queries in repository.ts must use parameterized bindings.',
        importance: 0.9,
        anchorPath: 'src/db/repository.ts',
        anchorSymbol: 'findUserByEmail',
      },
    ]);

    try {
      const onboard = await codebaseOnboardTool.execute(
        { maxSteps: 5 },
        {
          cwd: tmpDir,
          projectRoot: tmpDir,
          meta: { codebaseIndexDir: indexDir },
        } as never,
        { signal: new AbortController().signal },
      );

      expect(onboard.status).toBe('ok');
      expect(onboard.steps.length).toBeGreaterThanOrEqual(3);
      // Foundational leaf (repository.ts, outDeg=0, inDeg>0) is ordered before entry-flow (routes.ts)
      const filesInOrder = onboard.steps.map((s) => s.file);
      expect(filesInOrder.indexOf('src/db/repository.ts')).toBeLessThan(
        filesInOrder.indexOf('src/api/routes.ts'),
      );
      expect(onboard.steps[0]?.explanation).toContain('Core responsibility for');
      expect(onboard.markdown).toContain('# Codebase Onboarding & Architecture Tour');
      expect(onboard.markdown).toContain('## 2. Dependency-Ordered Guided Tour');
      expect(onboard.markdown).toContain(
        '**Institutional Knowledge (convention):** All database queries in repository.ts must use parameterized bindings.',
      );

      store = new IndexStore(tmpDir, { indexDir });
      const written = await writeOnboardingAtlas(store, tmpDir, { maxSteps: 5 });
      expect(written.path).toBe('.wrongstack/atlas/ONBOARDING.md');
      const diskMarkdown = await fs.readFile(path.join(tmpDir, written.path), 'utf8');
      expect(diskMarkdown).toBe(onboard.markdown);

      // Verify language pattern extraction and persona adaptation
      const notes = extractLanguagePatternNotes([
        {
          name: 'runTask',
          kind: 'function',
          signature: 'export async function runTask<T>(signal: AbortSignal): Promise<T>',
        },
      ]);
      expect(notes).toContain('Uses generic type parameters (<T>) for type-safe polymorphism.');
      expect(notes).toContain('Asynchronous Promise/async execution boundary.');
      expect(notes).toContain('Supports cooperative cancellation via AbortSignal.');

      const nonTech = await codebaseOnboardTool.execute(
        { maxSteps: 4, persona: 'non-technical' },
        {
          cwd: tmpDir,
          projectRoot: tmpDir,
          meta: { codebaseIndexDir: indexDir },
        } as never,
        { signal: new AbortController().signal },
      );
      expect(nonTech.persona).toBe('non-technical');
      expect(nonTech.steps[0]?.explanation).toContain('cross-module workflows');
    } finally {
      setEcosystemBridgeProvider(null);
    }
  });
});
