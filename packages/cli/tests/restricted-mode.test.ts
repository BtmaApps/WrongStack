import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/arg-parser.js';
import {
  RESTRICTED_DENY_CAPABILITIES,
  RESTRICTED_ENV,
  validateRestrictedMode,
  withRestrictedTools,
} from '../src/boot/restricted-mode.js';

describe('--restricted', () => {
  const original = process.env[RESTRICTED_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[RESTRICTED_ENV];
    else process.env[RESTRICTED_ENV] = original;
  });

  it('parses as a boolean that keeps the prompt', () => {
    expect(parseArgs(['--restricted', 'review this']).positional).toEqual(['review this']);
  });

  it('is off unless asked', () => {
    delete process.env[RESTRICTED_ENV];
    expect(validateRestrictedMode({})).toBe(false);
    expect(validateRestrictedMode({ restricted: true })).toBe(true);
  });

  it.each(['yolo', 'yolo-destructive', 'full-auto', 'mcp-config', 'allowed-tools'])(
    'refuses --%s alongside it',
    (flag) => {
      expect(() => validateRestrictedMode({ restricted: true, [flag]: 'x' })).toThrow(
        `--${flag} cannot be combined with --restricted`,
      );
    },
  );

  it('folds into the launch restriction, keeping an --only-tools list', () => {
    expect(withRestrictedTools(undefined, false)).toBeUndefined();
    expect(withRestrictedTools({ only: ['read'], deny: ['edit'] }, true)).toEqual({
      only: ['read'],
      deny: ['edit', 'mcp__*'],
      denyCapabilities: RESTRICTED_DENY_CAPABILITIES,
      requireDeclaredCapabilities: true,
    });
  });

  it('denies every code-running and network capability', () => {
    expect(RESTRICTED_DENY_CAPABILITIES).toEqual(
      expect.arrayContaining([
        'shell.arbitrary',
        'shell.restricted',
        'net.outbound',
        'package.install',
      ]),
    );
  });
});
