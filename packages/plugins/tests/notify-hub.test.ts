import { lookup } from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DNS lookup so the async SSRF check in setup() resolves instantly.
// The default mock returns a public IP so setup() proceeds normally for
// tests that don't care about the SSRF layer. Tests that *do* assert the
// SSRF block path override via mockResolvedValueOnce / mockImplementationOnce.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

const notifyHubPlugin = (await import('../src/notify-hub')).default;

interface MockApi {
  tools: { register: ReturnType<typeof vi.fn> };
  config: { extensions: Record<string, unknown> };
  log: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  metrics: {
    counter: ReturnType<typeof vi.fn>;
    histogram: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  };
  registerHook: ReturnType<typeof vi.fn>;
  onPattern: ReturnType<typeof vi.fn>;
}

function makeApi(overrides: { extensions?: Record<string, unknown> } = {}): MockApi {
  return {
    tools: { register: vi.fn() },
    config: { extensions: overrides.extensions ?? {} },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    metrics: { counter: vi.fn(), histogram: vi.fn(), gauge: vi.fn() },
    registerHook: vi.fn(() => vi.fn()),
    onPattern: vi.fn(() => vi.fn()),
  };
}

function getTool(
  api: MockApi,
  name: string,
): { execute: (input: unknown) => Promise<Record<string, unknown>> } {
  const call = api.tools.register.mock.calls.find(
    ([t]: unknown[]) => (t as { name: string }).name === name,
  );
  if (!call) throw new Error(`${name} not registered`);
  return call[0] as { execute: (input: unknown) => Promise<Record<string, unknown>> };
}

const fetchMock = vi.fn();
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  globalThis.fetch = fetchMock as never;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const URL_CFG = { 'notify-hub': { webhookUrl: 'https://hooks.example.com/x' } };

describe('notify-hub plugin', () => {
  it('registers notify_send + notify_hub_status', async () => {
    const api = makeApi();
    await notifyHubPlugin.setup(api as never);
    const names = api.tools.register.mock.calls.map(
      ([t]: unknown[]) => (t as { name: string }).name,
    );
    expect(names).toEqual(expect.arrayContaining(['notify_send', 'notify_hub_status']));
  });

  it('idles without webhookUrl: no hooks, no bus subscriptions, notify_send errors', async () => {
    const api = makeApi();
    await notifyHubPlugin.setup(api as never);
    expect(api.registerHook).not.toHaveBeenCalled();
    expect(api.onPattern).not.toHaveBeenCalled();
    await expect(getTool(api, 'notify_send').execute({ message: 'hi' })).rejects.toThrow(
      /no webhookUrl configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with a webhookUrl registers Stop hook + tool.error subscription (defaults)', async () => {
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    expect(api.registerHook).toHaveBeenCalledWith('Stop', undefined, expect.any(Function));
    expect(api.onPattern).toHaveBeenCalledWith('tool.*', expect.any(Function));
  });

  it('rejects unsafe webhook URLs and idles', async () => {
    for (const webhookUrl of [
      'ftp://hooks.example.com/x',
      'https://user:pass@hooks.example.com/x',
      'http://localhost:3000/hook',
      'http://127.0.0.1/hook',
      'http://10.0.0.5/hook',
      'http://192.168.1.20/hook',
      'http://[::1]/hook',
    ]) {
      const api = makeApi({ extensions: { 'notify-hub': { webhookUrl } } });
      await notifyHubPlugin.setup(api as never);
      await expect(getTool(api, 'notify_send').execute({ message: 'x' })).rejects.toThrow(
        /no webhookUrl configured/,
      );
      expect(api.registerHook).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects hostnames that resolve to private IPs via DNS (SSRF defense)', async () => {
    // Override the default mock to simulate a DNS rebinding attack:
    // the webhook URL passes the string-level validator (public hostname)
    // but DNS resolves to a private IP (10.0.0.5). The SSRF layer must
    // block channel construction and log a warning.
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    expect(api.registerHook).not.toHaveBeenCalled();
    expect(api.onPattern).not.toHaveBeenCalled();
    expect(api.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('resolves to a private/local IP'),
    );
    // notify_send tool is still registered (global tool registry) but returns
    // "no webhookUrl configured" because the channel was never constructed.
    await expect(getTool(api, 'notify_send').execute({ message: 'x' })).rejects.toThrow(
      /no webhookUrl configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notify_send requires a message', async () => {
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    await expect(getTool(api, 'notify_send').execute({ title: 't' })).rejects.toThrow(
      /message is required/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notify_send POSTs JSON to the webhook', async () => {
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    const result = await getTool(api, 'notify_send').execute({
      title: 'done',
      message: 'migration finished',
      level: 'info',
    });
    expect(result['ok']).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.com/x');
    const body = JSON.parse((init as { body: string }).body) as Record<string, unknown>;
    expect(body['event']).toBe('manual');
    expect(body['message']).toBe('migration finished');
  });

  it('sends custom headers', async () => {
    const api = makeApi({
      extensions: {
        'notify-hub': { webhookUrl: 'https://h.test/x', headers: { authorization: 'Bearer t' } },
      },
    });
    await notifyHubPlugin.setup(api as never);
    await getTool(api, 'notify_send').execute({ message: 'x' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as { headers: Record<string, string> }).headers['authorization']).toBe('Bearer t');
  });

  it('opens the circuit after maxConsecutiveFailures and suppresses further sends', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    const api = makeApi({
      extensions: { 'notify-hub': { webhookUrl: 'https://h.test/x', maxConsecutiveFailures: 2 } },
    });
    await notifyHubPlugin.setup(api as never);
    const send = getTool(api, 'notify_send');
    await expect(send.execute({ message: '1' })).rejects.toThrow(/connection refused/);
    await expect(send.execute({ message: '2' })).rejects.toThrow(/delivery failed/); // circuit opens
    await expect(send.execute({ message: '3' })).rejects.toThrow(/circuit open/); // suppressed
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const status = await getTool(api, 'notify_hub_status').execute({});
    expect(status['circuitOpen']).toBe(true);
    const counters = status['counters'] as Record<string, number>;
    expect(counters['failed']).toBe(2);
    expect(counters['suppressed']).toBe(1);
    const health = (await notifyHubPlugin.health!()) as { ok: boolean };
    expect(health.ok).toBe(false);
  });

  it('non-2xx responses count as failures', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    // A failed delivery used to come back as a successful tool result.
    await expect(getTool(api, 'notify_send').execute({ message: 'x' })).rejects.toThrow(
      /notification delivery failed/,
    );
  });

  it('enabled:false idles even with a webhookUrl', async () => {
    const api = makeApi({
      extensions: { 'notify-hub': { enabled: false, webhookUrl: 'https://h.test/x' } },
    });
    await notifyHubPlugin.setup(api as never);
    expect(api.registerHook).not.toHaveBeenCalled();
    await expect(getTool(api, 'notify_send').execute({ message: 'x' })).rejects.toThrow(/disabled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Stop hook delivers a session.stop event', async () => {
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    const stopHook = api.registerHook.mock.calls[0]![2] as (input: unknown) => void;
    stopHook({ sessionId: 's1', cwd: '/w' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body['event']).toBe('session.stop');
    expect(body['sessionId']).toBe('s1');
  });

  it('teardown resets state and logs', async () => {
    const api = makeApi({ extensions: URL_CFG });
    await notifyHubPlugin.setup(api as never);
    notifyHubPlugin.teardown!(api as never);
    const health = (await notifyHubPlugin.health!()) as { counters: Record<string, number> };
    expect(health.counters['sent']).toBe(0);
    expect(api.log.info).toHaveBeenCalledWith('notify-hub: teardown complete', expect.any(Object));
  });

  // Regression for S8 (J1): the previous hand-rolled `isPrivateIPv4`
  // split on `.` and missed `::ffff:127.0.0.1` (IPv4-mapped IPv6) —
  // the dot-split produced four segments but the first was
  // `::ffff:127` and `Number('::ffff:127')` is `NaN`. A webhook URL
  // pointed at `http://[::ffff:127.0.0.1]:3456/api/command` would be
  // classified as a public, sendable host, and every `session.stop`
  // / `tool.error` event would POST there. The normalised check
  // strips `::ffff:` first and then runs the standard IPv4 check.
  it('blocks IPv4-mapped IPv6 loopback as a private host (S8/J1)', async () => {
    // The classifier is internal, so assert through the config path.
    // Note the WHATWG URL parser serialises `[::ffff:127.0.0.1]` as the hex
    // form `[::ffff:7f00:1]` — the previous version of this test passed the
    // URL under a wrong config key and asserted `>= 0`, so it could never
    // fail and hid that the hex form slipped through.
    for (const webhookUrl of [
      'http://[::ffff:127.0.0.1]:3456/x',
      'http://[::ffff:10.0.0.1]/x',
      'http://[::ffff:192.168.1.20]/x',
    ]) {
      const api = makeApi({ extensions: { 'notify-hub': { webhookUrl } } });
      await notifyHubPlugin.setup(api as never);
      await expect(getTool(api, 'notify_send').execute({ message: 'x' })).rejects.toThrow(
        /no webhookUrl configured/,
      );
      expect(api.registerHook).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still accepts an IPv4-mapped IPv6 PUBLIC host', async () => {
    const api = makeApi({
      extensions: { 'notify-hub': { webhookUrl: 'http://[::ffff:8.8.8.8]/x' } },
    });
    await notifyHubPlugin.setup(api as never);
    await getTool(api, 'notify_send').execute({ message: 'x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
