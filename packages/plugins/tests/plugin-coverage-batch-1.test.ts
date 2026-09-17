/**
 * Batch supplementary tests for multiple plugins with uncovered branches.
 * Covers: commit-validator, schema-evolution-guard, duplicate-code-detector.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// commit-validator extra coverage
// ---------------------------------------------------------------------------
const commitValidatorPlugin = (await import('../src/commit-validator')).default;

function makeCvApi() {
  return {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
}

describe('commit-validator extra coverage', () => {
  it('setup registers hook and tool', () => {
    const api = makeCvApi();
    commitValidatorPlugin.setup(api as never);
    expect(api.registerHook).toHaveBeenCalledTimes(1);
    expect(api.tools.register).toHaveBeenCalledTimes(1);
  });

  it('teardown zeros state', () => {
    const api = makeCvApi();
    commitValidatorPlugin.setup(api as never);
    commitValidatorPlugin.teardown!(api as never);
    expect(api.log.info).toHaveBeenCalledWith(
      expect.stringContaining('teardown complete'),
      expect.any(Object),
    );
  });

  it('health returns ok', async () => {
    const api = makeCvApi();
    commitValidatorPlugin.setup(api as never);
    const h = (await commitValidatorPlugin.health!()) as { ok: boolean };
    expect(h.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// schema-evolution-guard extra coverage
// ---------------------------------------------------------------------------
const segPlugin = (await import('../src/schema-evolution-guard')).default;

function makeSegApi() {
  return {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
}

describe('schema-evolution-guard extra coverage', () => {
  it('setup registers hook and tool', () => {
    const api = makeSegApi();
    segPlugin.setup(api as never);
    expect(api.registerHook).toHaveBeenCalledTimes(1);
    expect(api.tools.register).toHaveBeenCalledTimes(1);
  });

  it('teardown zeros state', () => {
    const api = makeSegApi();
    segPlugin.setup(api as never);
    segPlugin.teardown!(api as never);
    expect(api.log.info).toHaveBeenCalledWith(
      expect.stringContaining('teardown complete'),
      expect.any(Object),
    );
  });

  it('health returns ok', async () => {
    const api = makeSegApi();
    segPlugin.setup(api as never);
    const h = (await segPlugin.health!()) as { ok: boolean };
    expect(h.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// duplicate-code-detector extra coverage
// ---------------------------------------------------------------------------
const dcdPlugin = (await import('../src/duplicate-code-detector')).default;

function makeDcdApi() {
  return {
    tools: { register: vi.fn() },
    config: { extensions: {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
  };
}

describe('duplicate-code-detector extra coverage', () => {
  it('setup registers hook and tool', () => {
    const api = makeDcdApi();
    dcdPlugin.setup(api as never);
    expect(api.registerHook.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(api.tools.register.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('teardown zeros state', () => {
    const api = makeDcdApi();
    dcdPlugin.setup(api as never);
    dcdPlugin.teardown!(api as never);
    expect(api.log.info).toHaveBeenCalledWith(
      expect.stringContaining('teardown complete'),
      expect.any(Object),
    );
  });

  it('health returns ok', async () => {
    const api = makeDcdApi();
    dcdPlugin.setup(api as never);
    const h = (await dcdPlugin.health!()) as { ok: boolean };
    expect(h.ok).toBe(true);
  });
});
