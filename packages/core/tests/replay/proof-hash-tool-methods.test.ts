/**
 * Diagnostic proof: inspect the exact JSON strings that feed the hash
 * to confirm which tool properties cause instability.
 */

import { describe, expect, it } from 'vitest';
import { hashRequest, stableStringify } from '../../src/replay/hash.js';
import type { Request } from '../../src/types/provider.js';

function makeBaseRequest(): Request {
  return {
    model: 'claude-test',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    maxTokens: 1,
  };
}

// ── Diagnostic: what JSON does hashRequest produce for tools with functions? ───

describe('DIAGNOSTIC: what JSON does hashRequest produce for tools', () => {
  it('inspect JSON for a request with execute/validate functions', () => {
    const req = makeBaseRequest();
    req.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
        execute: async function (_: unknown) { return { contents: '' }; },
        validate: (_: unknown) => [],
      },
    ];

    const json = stableStringify({
      model: req.model,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      topP: req.topP,
      stopSequences: req.stopSequences,
      toolChoice: req.toolChoice,
    });

    // Log for human inspection:
    console.log('\n[JSON with execute/validate present]');
    console.log(json);
    // Expected: `execute` and `validate` appear as `null` or are dropped.
    // If they appear as `null`, their KEY is still in the sorted output.
    // This means the hash CAN change based on whether the key exists at all.
  });

  it('inspect JSON for a request after JSON round-trip (no functions)', () => {
    const req = makeBaseRequest();
    req.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
        execute: async function (_: unknown) { return { contents: '' }; },
        validate: (_: unknown) => [],
      },
    ];

    const json = stableStringify({
      model: req.model,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      topP: req.topP,
      stopSequences: req.stopSequences,
      toolChoice: req.toolChoice,
    });

    const deserialised = JSON.parse(json);
    const jsonAfterRoundTrip = stableStringify({
      model: deserialised.model,
      system: deserialised.system,
      messages: deserialised.messages,
      tools: deserialised.tools,
      maxTokens: deserialised.maxTokens,
      temperature: deserialised.temperature,
      topP: deserialised.topP,
      stopSequences: deserialised.stopSequences,
      toolChoice: deserialised.toolChoice,
    });

    console.log('\n[JSON after JSON round-trip (no functions)]');
    console.log(jsonAfterRoundTrip);
    console.log('\n[Are they equal?]', json === jsonAfterRoundTrip);
    console.log('[Original hash]', hashRequest(req));
    console.log('[After round-trip hash]', hashRequest(deserialised as Request));
  });
});

// ── The actual bug: different `_estDefTokens` values produce different hashes ──

describe('CONFIRMED BUG: tool _estDefTokens (runtime cache) makes hash unstable', () => {
  it('produces different hashes when tools differ only by _estDefTokens', () => {
    const reqWithout = makeBaseRequest();
    reqWithout.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
      },
    ];

    const reqWith = makeBaseRequest();
    reqWith.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
        _estDefTokens: 42, // runtime token estimate — set by ToolRegistry, differs per run
      },
    ];

    const hashWithout = hashRequest(reqWithout);
    const hashWith = hashRequest(reqWith);

    console.log('\n[Hash WITHOUT _estDefTokens]', hashWithout);
    console.log('[Hash WITH _estDefTokens]', hashWith);
    console.log('[Hashes equal?]', hashWithout === hashWith);

    // This FAILS on unfixed code: _estDefTokens IS included in the hash,
    // causing instability. After fix: PASS.
    expect(hashWithout).toBe(hashWith);
  });

  it('produces different hashes when tools differ only by timeoutMs', () => {
    const reqWithout = makeBaseRequest();
    reqWithout.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
      },
    ];

    const reqWith = makeBaseRequest();
    reqWith.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
        timeoutMs: 30000, // runtime config — differs per run, not sent to provider
      },
    ];

    const hashWithout = hashRequest(reqWithout);
    const hashWith = hashRequest(reqWith);

    console.log('\n[Hash WITHOUT timeoutMs]', hashWithout);
    console.log('[Hash WITH timeoutMs]', hashWith);
    console.log('[Hashes equal?]', hashWithout === hashWith);

    // This FAILS on unfixed code. After fix: PASS.
    expect(hashWithout).toBe(hashWith);
  });

  it('produces different hashes when tools differ only by estimatedDurationMs', () => {
    const reqWithout = makeBaseRequest();
    reqWithout.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
      },
    ];

    const reqWith = makeBaseRequest();
    reqWith.tools = [
      {
        name: 'read',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        permission: 'confirm' as const,
        mutating: false,
        estimatedDurationMs: 5000, // runtime hint — not sent to provider
      },
    ];

    const hashWithout = hashRequest(reqWithout);
    const hashWith = hashRequest(reqWith);

    console.log('\n[Hash WITHOUT estimatedDurationMs]', hashWithout);
    console.log('[Hash WITH estimatedDurationMs]', hashWith);
    console.log('[Hashes equal?]', hashWithout === hashWith);

    // This FAILS on unfixed code. After fix: PASS.
    expect(hashWithout).toBe(hashWith);
  });
});
