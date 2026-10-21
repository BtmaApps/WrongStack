// F515: /api/login/verify used to check the per-IP throttle and the pending
// 2FA session before awaiting the request body and never again. A caller that
// held its bodies open and released them together had every code checked —
// past both the backoff and the 5-failures-per-session cap. Gated: every
// handler is parked on its body before any body is released.
import * as fs from 'node:fs/promises';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { generateTotp, generateTotpSecret, hashRecoveryCode } from '@wrongstack/core/security';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { serializeHqSessionCookie } from '../src/hq-server/auth.js';
import { LoginAttemptStore } from '../src/hq-server/login-attempt-store.js';
import { handleApiLoginVerify } from '../src/hq-server/routes/auth/totp-routes.js';
import type { HqRouterMutableAuth, HqSessionEntry } from '../src/hq-server/types.js';

let dataDir = '';
beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-totp-burst-'));
});
afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const cookieSecret = 'c'.repeat(64);
const sid = 'pending-session';

function setup() {
  const secret = generateTotpSecret();
  const mutableAuth = {
    cookieSecret,
    totpSecret: secret,
    totpRecoveryCodes: [hashRecoveryCode('real-recovery-code')],
  } as HqRouterMutableAuth;
  const sessions = new Map<string, HqSessionEntry>();
  sessions.set(sid, {
    createdAt: Date.now(),
    kind: 'password',
    pending2fa: true,
    lastSeenAt: Date.now(),
  });
  const store = new LoginAttemptStore(dataDir);
  const cookie = `hq.session=${serializeHqSessionCookie(sid, cookieSecret)}`;
  const call = () => {
    const req = new PassThrough() as PassThrough & http.IncomingMessage;
    Object.assign(req, { headers: { cookie }, socket: { remoteAddress: '10.0.0.7' } });
    let resolve!: (c: string) => void;
    const done = new Promise<string>((r) => {
      resolve = r;
    });
    const res = {
      writeHead: () => res,
      setHeader: () => undefined,
      getHeader: () => undefined,
      end: (b?: string) =>
        resolve((JSON.parse(b ?? '{}') as { error?: { code?: string } }).error?.code ?? 'OK'),
    } as unknown as http.ServerResponse;
    void handleApiLoginVerify(
      req,
      res,
      new URL('http://x/'),
      mutableAuth,
      sessions,
      store,
      dataDir,
      false,
      () => undefined,
      0,
    );
    return { req, done };
  };
  return { secret, sessions, store, call };
}

it('TOTP burst: one guess checked, the rest refused', async () => {
  const { call } = setup();
  const calls = Array.from({ length: 12 }, call);
  for (const [i, { req }] of calls.entries()) req.end(JSON.stringify({ code: `x${i}` }));
  const codes = await Promise.all(calls.map((c) => c.done));
  expect(codes.filter((c) => c === 'INVALID_TOTP')).toHaveLength(1);
  expect(codes.filter((c) => c === 'RATE_LIMITED')).toHaveLength(11);
});

it('recovery-code burst: one guess checked, the rest refused', async () => {
  const { call } = setup();
  const calls = Array.from({ length: 12 }, call);
  for (const [i, { req }] of calls.entries())
    req.end(JSON.stringify({ recoveryCode: `guess-${i}` }));
  const codes = await Promise.all(calls.map((c) => c.done));
  expect(codes.filter((c) => c === 'INVALID_RECOVERY_CODE')).toHaveLength(1);
  expect(codes.filter((c) => c === 'RATE_LIMITED')).toHaveLength(11);
});

it('a valid code still upgrades the session and leaves no throttle', async () => {
  const { call, secret, store } = setup();
  const one = call();
  one.req.end(JSON.stringify({ code: generateTotp(secret) }));
  expect(await one.done).toBe('OK');
  expect(store.checkBlocked('10.0.0.7').blocked).toBe(false);
});

it('a session dropped while a body is held is refused after the body arrives', async () => {
  const { call, sessions } = setup();
  const held = call();
  sessions.delete(sid);
  held.req.end(JSON.stringify({ code: 'x' }));
  expect(await held.done).toBe('NO_PENDING_SESSION');
});
