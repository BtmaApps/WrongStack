/** Static settings for the CLI-embedded WebUI host, resolved from options and the environment. */

import * as path from 'node:path';
import { wstackGlobalRoot } from '@wrongstack/core/utils';
import { envFlag, isStrictPort } from '@wrongstack/webui-server';
import type { CliWebUIOptions } from '../webui-server-options.js';

export function resolveWebuiHostSettings(opts: CliWebUIOptions) {
  const host = opts.host ?? process.env['WEBUI_HOST'] ?? process.env['WS_HOST'] ?? '127.0.0.1';
  const publicUrl = opts.publicUrl ?? process.env['WEBUI_PUBLIC_URL'];
  const publicWsUrl = opts.publicWsUrl ?? process.env['WEBUI_PUBLIC_WS_URL'];
  const requireToken = opts.requireToken ?? envFlag('WEBUI_REQUIRE_TOKEN');
  const surface = opts.surface ?? 'webui';
  const surfaceDefaults = surface === 'simpleui' ? { http: 3466 } : { http: 3456 };
  const requestedHttpPort = opts.httpPort ?? opts.port ?? surfaceDefaults.http;
  const strictPort = opts.strictPort ?? isStrictPort();
  const globalRoot = opts.globalConfigPath
    ? path.dirname(opts.globalConfigPath)
    : wstackGlobalRoot();
  const profileConfigPath =
    opts.profileConfigPath ?? opts.globalConfigPath ?? path.join(globalRoot, 'config.json');
  const rawRateLimit = process.env['WEBUI_RATE_LIMIT']?.trim() ?? '';
  const parsedRateLimit = /^\d+$/.test(rawRateLimit) ? Number(rawRateLimit) : Number.NaN;
  const rateLimitMax =
    Number.isSafeInteger(parsedRateLimit) && parsedRateLimit >= 0 ? parsedRateLimit : 600;
  const publicHostnames = [publicUrl, publicWsUrl]
    .map((value) => {
      if (!value) return undefined;
      try {
        return new URL(value).hostname;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => Boolean(value));
  return {
    host,
    publicUrl,
    publicWsUrl,
    requireToken,
    surface,
    requestedHttpPort,
    strictPort,
    globalRoot,
    profileConfigPath,
    profileDir: path.dirname(profileConfigPath),
    rateLimitMax,
    publicHostnames,
  };
}
