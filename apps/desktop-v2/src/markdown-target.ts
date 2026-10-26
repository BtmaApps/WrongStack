export type MarkdownTarget = { kind: 'external' | 'file'; value: string };
/** Links never navigate the privileged desktop webview. Local reads use the engine boundary. */
export function markdownTarget(value: string): MarkdownTarget | null {
  const url = value.trim();
  if (!url || /[\u0000-\u001f\u007f]/.test(url) || url.startsWith('//') || url.startsWith('#'))
    return null;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.username || parsed.password ? null : { kind: 'external', value: parsed.href };
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.includes('\\')) return null;
  try {
    const path = decodeURIComponent(url.split('#')[0]!.split('?')[0]!);
    if (
      !path ||
      path.split('/').includes('..') ||
      /[:\\\u0000-\u001f\u007f]/.test(path) ||
      path.startsWith('/')
    )
      return null;
    return { kind: 'file', value: path };
  } catch {
    return null;
  }
}
