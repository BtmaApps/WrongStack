/**
 * The endpoint a base URL finally reaches, seen through the WrongProxy /
 * WrongTrace rewrite.
 *
 * With the toggle on, the host layer rewrites every provider base URL to
 * `<proxy>/proxy/<host><path>` (`@wrongstack/core` `rewriteBaseUrl`), so an
 * adapter sees `localhost:3444` where the user configured `api.minimax.io`.
 * Anything that decides behaviour from the vendor's host — a provider
 * transport, a wire quirk, an account endpoint — has to look past that hop,
 * or turning tracing on silently switches the behaviour off.
 */

const PROXY_SEGMENT = /\/proxy\/([^/]+)(\/.*)?$/;

/** Lower-cased upstream hostname (port stripped), or undefined for a bad URL. */
export function upstreamHost(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return undefined;
  }
  const proxied = PROXY_SEGMENT.exec(url.pathname)?.[1];
  const host = proxied ? proxied.replace(/:\d+$/, '') : url.hostname;
  return host.toLowerCase();
}

/**
 * The un-proxied form of `baseUrl`: `http://localhost:3444/proxy/api.minimax.io/anthropic/v1`
 * → `https://api.minimax.io/anthropic/v1`. A URL that is not proxy-mounted is
 * returned unchanged. The proxy strips the scheme from the path and forwards
 * the original one in a header, so HTTPS is assumed — every hosted vendor
 * API is HTTPS, and loopback servers are never rewritten in the first place.
 */
export function upstreamUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  const match = PROXY_SEGMENT.exec(url.pathname);
  if (!match?.[1]) return baseUrl;
  return `https://${match[1]}${match[2] ?? ''}${url.search}`;
}
