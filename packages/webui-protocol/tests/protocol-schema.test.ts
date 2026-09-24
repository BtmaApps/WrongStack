/**
 * The published schema files (schema/ws-core.schema.json, schema/openapi.json)
 * are generated from the TypeScript types by
 * scripts/generate-protocol-schema.mjs and committed. These tests fail when a
 * type changed and the files were not regenerated, and check that the schema
 * accepts the frames the server really sends and names only registered types.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import type { CoreClientMessage, CoreServerMessage } from '../src/conversation-core.js';
import { CLIENT_MESSAGE_TYPES, SERVER_MESSAGE_TYPES } from '../src/registry.js';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '../..');

type JsonObject = Record<string, unknown>;
const readJson = (name: string): JsonObject =>
  JSON.parse(readFileSync(path.join(pkgDir, 'schema', name), 'utf8')) as JsonObject;

const wsSchema = readJson('ws-core.schema.json');
const openApi = readJson('openapi.json');

function newAjv(): Ajv {
  // strict off: the generator carries jsDoc annotations (`deprecated` text)
  // that are documentation, not validation keywords.
  return new Ajv({ strict: false, allErrors: true });
}

function validatorFor(definition: string) {
  const ajv = newAjv();
  ajv.addSchema(wsSchema, 'ws');
  const validate = ajv.getSchema(`ws#/definitions/${definition}`);
  if (!validate) throw new Error(`no definition ${definition}`);
  return validate;
}

/** The `type` literals a union definition's members pin. */
function frameTypes(union: string): string[] {
  const definitions = wsSchema.definitions as Record<string, JsonObject>;
  const members = (definitions[union]?.anyOf ?? []) as Array<{ $ref: string }>;
  return members.map((member) => {
    const def = definitions[member.$ref.replace('#/definitions/', '')] as {
      properties: { type: { const: string } };
    };
    return def.properties.type.const;
  });
}

describe('generated protocol schema', () => {
  it('is current with the TypeScript types', () => {
    const run = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts/generate-protocol-schema.mjs'), '--check'],
      { cwd: repoRoot, encoding: 'utf8', windowsHide: true },
    );
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('names only frame types the registry knows, in the right direction', () => {
    const client = frameTypes('CoreClientMessage');
    const server = frameTypes('CoreServerMessage');
    expect(client).toContain('user_message');
    expect(server).toContain('run.result');
    for (const type of client) expect(CLIENT_MESSAGE_TYPES).toContain(type);
    for (const type of server) expect(SERVER_MESSAGE_TYPES).toContain(type);
  });

  // Typed as the TypeScript unions: whatever the compiler lets a client send
  // or a server emit, the published schema must accept.
  it('accepts the frames of a conversation', () => {
    const client = validatorFor('CoreClientMessage');
    const server = validatorFor('CoreServerMessage');
    const sent: CoreClientMessage[] = [
      { type: 'session.subscribe', payload: { sessionIds: ['sess_1'] } },
      {
        type: 'user_message',
        payload: { id: 'm1', content: 'hello', timestamp: 1, sessionId: 'sess_1' },
      },
      { type: 'tool.confirm_result', payload: { id: 'c1', decision: 'yes' } },
      { type: 'abort', payload: { sessionId: 'sess_1' } },
    ];
    for (const frame of sent) expect(client(frame), JSON.stringify(client.errors)).toBe(true);
    const received: CoreServerMessage[] = [
      { type: 'session.start', payload: { sessionId: 'sess_1', provider: 'p', model: 'm' } },
      {
        type: 'provider.text_delta',
        payload: { text: 'Hi', messageId: 'a1', sessionId: 'sess_1' },
      },
      {
        type: 'tool.confirm_needed',
        payload: { id: 'c1', toolName: 'bash', input: { command: 'ls' }, suggestedPattern: 'ls' },
      },
      {
        type: 'tool.executed',
        payload: { id: 't1', name: 'bash', durationMs: 3, ok: true, output: 'a.txt' },
      },
      {
        type: 'run.result',
        payload: { requestId: 'm1', status: 'done', iterations: 1, finalText: 'Hi' },
      },
      {
        type: 'run.result',
        payload: {
          status: 'failed',
          iterations: 0,
          error: { code: 'provider', message: 'boom', recoverable: true },
        },
      },
    ];
    for (const frame of received) expect(server(frame), JSON.stringify(server.errors)).toBe(true);
  });

  it('rejects a frame the server would refuse', () => {
    const client = validatorFor('CoreClientMessage');
    expect(client({ type: 'user_message', payload: { id: 'm1', timestamp: 1 } })).toBe(false);
    expect(client({ type: 'no_such_frame', payload: {} })).toBe(false);
    const error = validatorFor('WrongStackErrorModel');
    expect(error({ kind: 'auth', code: '401' })).toBe(true);
    expect(error({ kind: 'bogus', code: 'x' })).toBe(false);
  });

  it('describes every HTTP session route against resolvable schemas', () => {
    const paths = openApi.paths as Record<string, Record<string, unknown>>;
    expect(Object.keys(paths).sort()).toEqual([
      '/api/sessions',
      '/api/sessions/{id}/agents',
      '/api/sessions/{id}/events',
      '/api/sessions/{id}/interrupt',
      '/api/sessions/{id}/message',
    ]);
    const ajv = newAjv();
    ajv.addSchema({ components: openApi.components }, 'oa');
    const session = ajv.getSchema('oa#/components/schemas/ApiSession');
    const sample = {
      sessionId: 'sess_1',
      projectSlug: 'p',
      projectName: 'P',
      projectRoot: '/p',
      workingDir: '/p',
      status: 'active',
      pid: 1,
      startedAt: 't',
      lastHeartbeatAt: 't',
      agentCount: 0,
      agents: [],
    };
    expect(session?.(sample), JSON.stringify(session?.errors)).toBe(true);
    expect(session?.({ ...sample, pid: 'x' })).toBe(false);
  });
});
