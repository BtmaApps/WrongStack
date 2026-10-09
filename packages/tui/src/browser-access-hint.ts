/** Put browser and HTTP-reader origin guidance outside collapsed tool output. */
export function networkAccessHint(
  name: string,
  ok: boolean,
  output: string | undefined,
): string | undefined {
  const browser = name.startsWith('browser_');
  if (
    ok ||
    !(name.startsWith('browser_') || name === 'fetch' || name === 'read_url_content') ||
    !output ||
    !(
      browser
        ? /browser: (?:blocked|resolved to private|navigation was redirected to a blocked)/
        : /fetch: .*?(?:blocked|resolved to private)/
    ).test(output)
  )
    return undefined;
  const match = /\/(browser|network) allow (https?:\/\/[^\s"'<>\\)]+)/.exec(output);
  if (!match) return undefined;
  try {
    const url = new URL(match[2]!);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return undefined;
    return `Network access blocked. If this is your trusted development server, run /${match[1]} allow ${url.origin}, then retry ${name}.`;
  } catch {
    return undefined;
  }
}

export const browserAccessHint = networkAccessHint;
