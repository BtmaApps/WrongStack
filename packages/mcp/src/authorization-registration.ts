import {
  type BrowserCompatibleDnsLookup,
  isLoopbackHttp,
  type MCPAuthorizationServerMetadata,
  optionalString,
  record,
  requestPinnedJson,
  requiredString,
  unbracket,
} from './authorization-discovery.js';

/**
 * Identity this client presents to an authorization server. `clientSecret` is
 * only present when the server refused the public-client registration we ask
 * for and issued a confidential client anyway; it is a credential and must
 * reach the vault-backed store, never config or logs.
 */
export interface MCPClientRegistration {
  clientId: string;
  clientSecret?: string | undefined;
  issuer: string;
  registeredAt: string;
}

export interface MCPClientRegistrationOptions {
  authorizationServer: MCPAuthorizationServerMetadata;
  redirectUris: readonly string[];
  clientName?: string | undefined;
  clientUri?: string | undefined;
  scopes?: readonly string[] | undefined;
  /** Canonical MCP resource, used only to allow loopback development servers. */
  resource?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  maxResponseBytes?: number | undefined;
  lookup?: BrowserCompatibleDnsLookup | undefined;
  /** Test/host override. Production callers should use the pinned default. */
  requestJson?: typeof requestPinnedJson | undefined;
}

const DEFAULT_CLIENT_NAME = 'WrongStack';
const MAX_REDIRECT_URIS = 8;

/**
 * RFC 7591 dynamic client registration.
 *
 * Most hosted MCP servers issue no preregistered client IDs at all, so without
 * this the only way to authorize was for the user to find a client ID by hand.
 * We register as a public client (`token_endpoint_auth_method: "none"`) because
 * a CLI cannot keep a secret; a server that overrides that and returns one is
 * still honored, but the secret goes straight to the vault.
 */
export async function registerMcpOAuthClient(
  options: MCPClientRegistrationOptions,
): Promise<MCPClientRegistration> {
  const endpoint = options.authorizationServer.registrationEndpoint;
  if (!endpoint) {
    throw new Error(
      'MCP authorization server does not support dynamic client registration; pass an explicit client id',
    );
  }
  const redirectUris = validateRedirectUris(options.redirectUris);
  const scopes = options.scopes?.filter(Boolean) ?? [];
  const body = JSON.stringify({
    client_name: boundedClientName(options.clientName ?? DEFAULT_CLIENT_NAME),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    // A CLI is a public client: it cannot hold a secret that the user could not
    // also read. Asking for `none` keeps the PKCE-only exchange we implement.
    token_endpoint_auth_method: 'none',
    application_type: 'native',
    ...(options.clientUri ? { client_uri: options.clientUri } : {}),
    ...(scopes.length > 0 ? { scope: scopes.join(' ') } : {}),
  });
  const request = options.requestJson ?? requestPinnedJson;
  const response = await request(endpoint, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
    lookup: options.lookup,
    allowedLoopbackHostname: loopbackHostnameForResource(options.resource),
    label: 'client registration endpoint',
  });
  if (response === undefined) {
    throw new Error('MCP OAuth client registration endpoint returned no response');
  }
  return parseRegistrationResponse(response, options.authorizationServer.issuer);
}

function parseRegistrationResponse(value: unknown, issuer: string): MCPClientRegistration {
  const metadata = record(value, 'client registration response');
  const clientId = requiredString(metadata['client_id'], 'client_id');
  if (/[\r\n]/.test(clientId)) {
    throw new Error('MCP OAuth client registration returned an invalid client_id');
  }
  const clientSecret = optionalString(metadata['client_secret'], 'client_secret');
  if (clientSecret !== undefined && /[\r\n]/.test(clientSecret)) {
    throw new Error('MCP OAuth client registration returned an invalid client_secret');
  }
  // A registration that expires would silently stop working mid-session. The
  // spec allows `client_secret_expires_at: 0` for "never"; anything else means
  // the caller must re-register, which we do not yet schedule.
  const expiresAt = metadata['client_secret_expires_at'];
  if (clientSecret !== undefined && typeof expiresAt === 'number' && expiresAt !== 0) {
    if (!Number.isFinite(expiresAt) || expiresAt * 1_000 <= Date.now()) {
      throw new Error('MCP OAuth client registration returned an already-expired client secret');
    }
  }
  return {
    clientId,
    ...(clientSecret !== undefined ? { clientSecret } : {}),
    issuer,
    registeredAt: new Date().toISOString(),
  };
}

function validateRedirectUris(values: readonly string[]): string[] {
  if (values.length === 0 || values.length > MAX_REDIRECT_URIS) {
    throw new Error(
      `MCP OAuth client registration requires between 1 and ${MAX_REDIRECT_URIS} redirect URIs`,
    );
  }
  return values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('MCP OAuth redirect URI must be an absolute URL');
    }
    if (url.protocol !== 'https:' && !isLoopbackHttp(url)) {
      throw new Error('MCP OAuth redirect URI must use HTTPS or loopback HTTP');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('MCP OAuth redirect URI must not contain credentials, query, or fragment');
    }
    return url.toString();
  });
}

function boundedClientName(value: string): string {
  if (!value || value.length > 128 || /[\r\n]/.test(value)) {
    throw new Error('MCP OAuth client name must be a bounded single-line string');
  }
  return value;
}

function loopbackHostnameForResource(resource: string | undefined): string | undefined {
  if (!resource) return undefined;
  try {
    const url = new URL(resource);
    return isLoopbackHttp(url) ? unbracket(url.hostname).toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
