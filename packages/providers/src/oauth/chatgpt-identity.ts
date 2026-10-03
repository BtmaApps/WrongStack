import { createPublicKey, verify } from 'node:crypto';
import { CODEX_AUTH_BASE_URL } from './codex-protocol.js';
import { oauthRequest, oauthSignal } from './http.js';

// Both OpenAI auth flows use this issuer; their grants and token endpoints remain separate.
const ISSUER = CODEX_AUTH_BASE_URL;

/** OIDC identity validation, using a fixed issuer JWKS rather than token-provided URLs. */
export async function verifyChatGPTIdentity(
  token: string,
  clientId: string,
  nonce: string | undefined,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<{ subject: string }> {
  const pieces = token.split('.');
  if (pieces.length !== 3 || pieces.some((piece) => !/^[A-Za-z0-9_-]+$/.test(piece)))
    throw new Error('Invalid ChatGPT ID token.');
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(pieces[0]!, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(pieces[1]!, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid ChatGPT ID token.');
  }
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string')
    throw new Error('Unsupported ChatGPT ID token signature.');
  const { response, body } = await oauthRequest(fetchImpl, `${ISSUER}/.well-known/jwks.json`, {
    signal: oauthSignal(signal),
  });
  if (!response.ok || !Array.isArray(body.keys))
    throw new Error('Could not verify ChatGPT identity keys.');
  const key = body.keys.find((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return false;
    const jwk = raw as Record<string, unknown>;
    return (
      jwk.kid === header.kid &&
      jwk.kty === 'RSA' &&
      (jwk.use === undefined || jwk.use === 'sig') &&
      (jwk.alg === undefined || jwk.alg === 'RS256')
    );
  });
  if (
    !key ||
    !verify(
      'RSA-SHA256',
      Buffer.from(`${pieces[0]}.${pieces[1]}`),
      createPublicKey({ key, format: 'jwk' }),
      Buffer.from(pieces[2]!, 'base64url'),
    )
  ) {
    throw new Error('Invalid ChatGPT ID token signature.');
  }
  const now = Date.now() / 1000;
  const audience = claims.aud;
  if (
    claims.iss !== ISSUER ||
    !(audience === clientId || (Array.isArray(audience) && audience.includes(clientId))) ||
    (Array.isArray(audience) && audience.length > 1 && claims.azp !== clientId) ||
    typeof claims.exp !== 'number' ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now - 5 ||
    typeof claims.iat !== 'number' ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 5 ||
    (claims.nbf !== undefined &&
      (typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now + 5)) ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    (nonce !== undefined && claims.nonce !== nonce)
  ) {
    throw new Error('ChatGPT ID token identity, expiry or nonce did not match.');
  }
  return { subject: claims.sub };
}
