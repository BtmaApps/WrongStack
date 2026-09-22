import * as dns from 'node:dns/promises';

import * as http from 'node:http';

import * as https from 'node:https';

import * as net from 'node:net';

import { isPrivateIPv4, isPrivateIPv6 } from '@wrongstack/core/utils';

export interface MCPAuthorizationChallenge {
  status: 401;
  resource: string;
  resourceMetadataUrl?: string | undefined;
  scopes: string[];
  rawScheme: 'Bearer';
}

export interface MCPProtectedResourceMetadata {
  resource: string;
  authorizationServers: string[];
  scopesSupported: string[];
}

export interface MCPAuthorizationServerMetadata {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string | undefined;
  authorizationResponseIssuerParameterSupported?: boolean | undefined;
  scopesSupported: string[];
}

export interface MCPAuthorizationDiscoveryResult {
  resourceMetadataUrl: string;
  authorizationServerMetadataUrl: string;
  protectedResource: MCPProtectedResourceMetadata;
  authorizationServer: MCPAuthorizationServerMetadata;
}

export type MCPAuthorizationJsonFetcher = (
  url: string,
  signal?: AbortSignal | undefined,
) => Promise<unknown | undefined>;

export interface MCPAuthorizationDiscoveryOptions {
  challengeHeader?: string | null | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  maxResponseBytes?: number | undefined;
  lookup?: BrowserCompatibleDnsLookup | undefined;
  /** Test/host override. Production callers should use the pinned default. */
  fetchJson?: MCPAuthorizationJsonFetcher | undefined;
}

export type BrowserCompatibleDnsLookup = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

/** Non-2xx answer from an OAuth endpoint, carrying the HTTP status. */
export class MCPOAuthHttpError extends Error {
  override readonly name = 'MCPOAuthHttpError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function canonicalMcpResource(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('MCP authorization resource must be an absolute URL');
  }
  if (url.protocol !== 'https:' && !isLoopbackHttp(url)) {
    throw new Error('MCP authorization resource must use HTTPS (except loopback development)');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('MCP authorization resource must not contain credentials or a fragment');
  }
  if (url.pathname === '/' && !url.search) return url.origin;
  return url.toString();
}

export function parseMcpBearerChallenge(
  header: string | null,
  resource: string,
): MCPAuthorizationChallenge {
  const challenge: MCPAuthorizationChallenge = {
    status: 401,
    resource,
    scopes: [],
    rawScheme: 'Bearer',
  };
  if (!header) return challenge;
  const bearer = /(?:^|,)\s*Bearer(?:\s+|$)/i.exec(header);
  if (!bearer) return challenge;
  const parameters = header.slice(bearer.index + bearer[0].length);
  const resourceMetadata = challengeParameter(parameters, 'resource_metadata');
  if (resourceMetadata) {
    const metadataUrl = validateMetadataUrl(resourceMetadata);
    if (metadataUrl) challenge.resourceMetadataUrl = metadataUrl;
  }
  const scope = challengeParameter(parameters, 'scope');
  if (scope) {
    challenge.scopes = [...new Set(scope.split(/\s+/).filter(Boolean))].slice(0, 64);
  }
  return challenge;
}

/** RFC 9728 fallback order for an MCP endpoint when no challenge URL exists. */
export function protectedResourceMetadataUrls(resource: string): string[] {
  const url = new URL(canonicalMcpResource(resource));
  const suffix = url.pathname === '/' ? '' : url.pathname;
  const candidates = [
    new URL(`/.well-known/oauth-protected-resource${suffix}`, url.origin).toString(),
    new URL('/.well-known/oauth-protected-resource', url.origin).toString(),
  ];
  return [...new Set(candidates)];
}

/** RFC 8414 + OIDC discovery order required by the MCP authorization spec. */
export function authorizationServerMetadataUrls(issuer: string): string[] {
  const url = secureOAuthUrl(issuer, 'authorization server issuer');
  const suffix = url.pathname === '/' ? '' : url.pathname;
  const candidates = [
    new URL(`/.well-known/oauth-authorization-server${suffix}`, url.origin).toString(),
    new URL(`/.well-known/openid-configuration${suffix}`, url.origin).toString(),
  ];
  if (suffix) {
    candidates.push(
      new URL(
        `${suffix.replace(/\/$/, '')}/.well-known/openid-configuration`,
        url.origin,
      ).toString(),
    );
  }
  return candidates;
}

export function parseProtectedResourceMetadata(
  value: unknown,
  expectedResource: string,
): MCPProtectedResourceMetadata {
  const metadata = record(value, 'protected resource metadata');
  const resource = canonicalMcpResource(requiredString(metadata['resource'], 'resource'));
  if (resource !== canonicalMcpResource(expectedResource)) {
    throw new Error('MCP protected resource metadata resource does not match the target server');
  }
  const authorizationServers = boundedStringArray(
    metadata['authorization_servers'],
    'authorization_servers',
    8,
  ).map((issuer) => secureOAuthUrl(issuer, 'authorization server issuer').toString());
  if (authorizationServers.length === 0) {
    throw new Error('MCP protected resource metadata must declare an authorization server');
  }
  return {
    resource,
    authorizationServers,
    scopesSupported: optionalStringArray(metadata['scopes_supported'], 'scopes_supported', 128),
  };
}

export function parseAuthorizationServerMetadata(
  value: unknown,
  expectedIssuer: string,
): MCPAuthorizationServerMetadata {
  const metadata = record(value, 'authorization server metadata');
  const issuer = secureOAuthUrl(requiredString(metadata['issuer'], 'issuer'), 'issuer').toString();
  if (issuer !== secureOAuthUrl(expectedIssuer, 'expected issuer').toString()) {
    throw new Error('MCP authorization metadata issuer mismatch');
  }
  const methods = boundedStringArray(
    metadata['code_challenge_methods_supported'],
    'code_challenge_methods_supported',
    16,
  );
  if (!methods.includes('S256')) {
    throw new Error('MCP authorization server does not advertise required PKCE S256 support');
  }
  const registration = optionalString(metadata['registration_endpoint'], 'registration_endpoint');
  const authorizationEndpoint = secureOAuthUrl(
    requiredString(metadata['authorization_endpoint'], 'authorization_endpoint'),
    'authorization endpoint',
  ).toString();
  const tokenEndpoint = secureOAuthUrl(
    requiredString(metadata['token_endpoint'], 'token_endpoint'),
    'token endpoint',
  ).toString();
  const issuerParameterSupported = optionalBoolean(
    metadata['authorization_response_iss_parameter_supported'],
    'authorization_response_iss_parameter_supported',
  );
  if (
    issuerParameterSupported !== true &&
    (new URL(authorizationEndpoint).origin !== new URL(issuer).origin ||
      new URL(tokenEndpoint).origin !== new URL(issuer).origin)
  ) {
    throw new Error(
      'MCP authorization server with cross-origin endpoints must support the authorization response issuer parameter',
    );
  }
  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: registration
      ? secureOAuthUrl(registration, 'registration endpoint').toString()
      : undefined,
    authorizationResponseIssuerParameterSupported: issuerParameterSupported,
    scopesSupported: optionalStringArray(metadata['scopes_supported'], 'scopes_supported', 128),
  };
}

/**
 * Discover and validate MCP OAuth metadata without following redirects. The
 * default fetcher resolves once and opens the socket to that exact IP, making
 * discovery resistant to DNS rebinding.
 */
export async function discoverMcpAuthorization(
  resource: string,
  options: MCPAuthorizationDiscoveryOptions = {},
): Promise<MCPAuthorizationDiscoveryResult> {
  const canonicalResource = canonicalMcpResource(resource);
  const resourceUrl = new URL(canonicalResource);
  const allowedLoopbackHostname = isLoopbackHttp(resourceUrl)
    ? unbracket(resourceUrl.hostname).toLowerCase()
    : undefined;
  const fetchJson =
    options.fetchJson ??
    ((url, signal) =>
      requestPinnedJson(url, {
        signal,
        timeoutMs: options.timeoutMs,
        maxResponseBytes: options.maxResponseBytes,
        lookup: options.lookup,
        allowedLoopbackHostname,
      }));

  const challenge = parseMcpBearerChallenge(options.challengeHeader ?? null, canonicalResource);
  const resourceCandidates = challenge.resourceMetadataUrl
    ? [challenge.resourceMetadataUrl]
    : protectedResourceMetadataUrls(canonicalResource);
  const resourceDiscovery = await discoverFirst(
    resourceCandidates,
    fetchJson,
    options.signal,
    (value) => parseProtectedResourceMetadata(value, canonicalResource),
    'protected resource metadata',
  );
  const issuer = resourceDiscovery.value.authorizationServers[0]!;
  const authorizationDiscovery = await discoverFirst(
    authorizationServerMetadataUrls(issuer),
    fetchJson,
    options.signal,
    (value) => parseAuthorizationServerMetadata(value, issuer),
    'authorization server metadata',
  );
  return {
    resourceMetadataUrl: resourceDiscovery.url,
    authorizationServerMetadataUrl: authorizationDiscovery.url,
    protectedResource: resourceDiscovery.value,
    authorizationServer: authorizationDiscovery.value,
  };
}

export function challengeParameter(parameters: string, name: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|,)\\s*${name}\\s*=\\s*(?:"((?:\\\\.|[^"\\\\])*)"|([^,\\s]+))`,
    'i',
  );
  const match = pattern.exec(parameters);
  const value = match?.[1] ?? match?.[2];
  return value?.replace(/\\(["\\])/g, '$1');
}

export function validateMetadataUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return undefined;
    if (url.protocol !== 'https:' && !isLoopbackHttp(url)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`MCP ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) {
    throw new Error(`MCP authorization field "${field}" must be a bounded non-empty string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error(`MCP authorization field "${field}" must be a boolean`);
  }
  return value;
}

export function boundedStringArray(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`MCP authorization field "${field}" must be an array of at most ${maxItems}`);
  }
  return [...new Set(value.map((entry) => requiredString(entry, field)))];
}

export function optionalStringArray(value: unknown, field: string, maxItems: number): string[] {
  return value === undefined ? [] : boundedStringArray(value, field, maxItems);
}

export function secureOAuthUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`MCP ${label} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' && !isLoopbackHttp(url)) {
    throw new Error(`MCP ${label} must use HTTPS (except loopback development)`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`MCP ${label} must not contain credentials, query, or fragment components`);
  }
  if (url.pathname === '/') return new URL(url.origin);
  return url;
}

export async function discoverFirst<T>(
  candidates: readonly string[],
  fetchJson: MCPAuthorizationJsonFetcher,
  signal: AbortSignal | undefined,
  parse: (value: unknown) => T,
  label: string,
): Promise<{ url: string; value: T }> {
  const failures: string[] = [];
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    try {
      const value = await fetchJson(candidate, signal);
      if (value === undefined) {
        failures.push(`${candidate}: not found`);
        continue;
      }
      return { url: candidate, value: parse(value) };
    } catch (error) {
      signal?.throwIfAborted();
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`MCP ${label} discovery failed (${failures.join('; ')})`);
}

export async function requestPinnedJson(
  rawUrl: string,
  options: {
    method?: 'GET' | 'POST' | undefined;
    body?: string | undefined;
    headers?: Record<string, string> | undefined;
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
    maxResponseBytes?: number | undefined;
    lookup?: BrowserCompatibleDnsLookup | undefined;
    allowedLoopbackHostname?: string | undefined;
    /** Names the endpoint in errors — token calls were reported as "discovery". */
    label?: string | undefined;
  },
): Promise<unknown | undefined> {
  const label = options.label ?? 'discovery';
  const url = secureOAuthUrl(rawUrl, `${label} URL`);
  const target = await resolvePinnedAddress(url, options);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxBytes = options.maxResponseBytes ?? 64 * 1024;
  options.signal?.throwIfAborted();

  return new Promise<unknown | undefined>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => {
      request.destroy(options.signal?.reason instanceof Error ? options.signal.reason : undefined);
    };
    const headers: Record<string, string | number> = {
      accept: 'application/json',
      host: url.host,
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers['content-length'] = Buffer.byteLength(options.body);
    }
    const requestOptions: http.RequestOptions = {
      host: target.address,
      family: target.family,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      method: options.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers,
      ...(url.protocol === 'https:' && net.isIP(unbracket(url.hostname)) === 0
        ? { servername: unbracket(url.hostname) }
        : {}),
    };
    const requestFn = url.protocol === 'https:' ? https.request : http.request;
    const request = requestFn(requestOptions, (response) => {
      // Node only invokes the HTTP response callback after a status line has
      // been parsed, so statusCode is present here.
      const status = response.statusCode!;
      if (status === 404 || status === 410) {
        response.resume();
        finish(undefined, undefined);
        return;
      }
      if (status >= 300 && status < 400) {
        response.resume();
        finish(new Error(`MCP OAuth ${label} redirects are not allowed`));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        // `status` lets callers tell a rejection (400 invalid_grant, 401) from
        // a transient fault without parsing the message.
        finish(new MCPOAuthHttpError(`MCP OAuth ${label} HTTP ${status}`, status));
        return;
      }
      const contentType = response.headers['content-type'] ?? '';
      if (!/^(?:application\/json|[^;]+\+json)(?:;|$)/i.test(contentType)) {
        response.resume();
        finish(new Error('MCP OAuth discovery response must be JSON'));
        return;
      }
      const declaredLength = Number(response.headers['content-length'] ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy();
        finish(new Error(`MCP OAuth discovery response exceeds ${maxBytes} bytes`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          finish(new Error(`MCP OAuth discovery response exceeds ${maxBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => {
        try {
          finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          finish(new Error('MCP OAuth discovery response is not valid JSON'));
        }
      });
      response.once('error', (error) => finish(error));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`MCP OAuth discovery timed out after ${timeoutMs}ms`));
    });
    request.once('error', (error) => finish(error));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    request.end(options.body);
  });
}

export async function resolvePinnedAddress(
  url: URL,
  options: {
    lookup?: BrowserCompatibleDnsLookup | undefined;
    allowedLoopbackHostname?: string | undefined;
  },
): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = unbracket(url.hostname).toLowerCase();
  const literalFamily = net.isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    assertDiscoveryAddressAllowed(
      hostname,
      literalFamily,
      hostname,
      options.allowedLoopbackHostname,
    );
    return { address: hostname, family: literalFamily };
  }
  const lookup = options.lookup ?? ((host) => dns.lookup(host, { all: true }));
  const records = await lookup(hostname);
  if (records.length === 0)
    throw new Error(`MCP OAuth discovery DNS returned no addresses for ${hostname}`);
  for (const record of records) {
    if (record.family !== 4 && record.family !== 6) {
      throw new Error('MCP OAuth discovery DNS returned an unsupported address family');
    }
    assertDiscoveryAddressAllowed(
      record.address,
      record.family,
      hostname,
      options.allowedLoopbackHostname,
    );
  }
  const selected = records[0]!;
  return { address: selected.address, family: selected.family as 4 | 6 };
}

export function assertDiscoveryAddressAllowed(
  address: string,
  family: 4 | 6,
  hostname: string,
  allowedLoopbackHostname: string | undefined,
): void {
  const isPrivate = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
  if (!isPrivate) return;
  const loopback = family === 4 ? address.startsWith('127.') : address === '::1';
  if (loopback && hostname === allowedLoopbackHostname) return;
  throw new Error(`MCP OAuth discovery blocked private address ${address}`);
}

export function unbracket(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

export function isLoopbackHttp(url: URL): boolean {
  if (url.protocol !== 'http:') return false;
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1'
  );
}
