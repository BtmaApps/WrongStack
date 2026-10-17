'use client';
import { createContext, useContext } from 'react';
export const ArtifactNavigation = createContext<((path: string) => void) | null>(null);
export const useArtifactNavigation = () => useContext(ArtifactNavigation);
export function localArtifactPath(href: string, origin: string, basePath = ''): string | null {
  if (!href || href.startsWith('#') || /^(?:mailto|tel|data|javascript):/i.test(href)) return null;
  let path = href;
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    let url: URL;
    try {
      url = new URL(path, origin);
    } catch {
      return null;
    }
    if (url.origin !== origin) return null;
    path = url.pathname;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return null;
  try {
    path = decodeURIComponent(path.split(/[?#]/)[0] || '');
  } catch {
    return null;
  }
  if (!/\.[a-z\d]{1,12}$/i.test(path)) return null;
  const workspaceRelative = path.startsWith('/') || path.startsWith('.temp_files/') || !basePath;
  const parts: string[] = workspaceRelative ? [] : basePath.split('/').slice(0, -1);
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  const repeated = parts.indexOf('.temp_files', 1);
  if (
    parts[0] === '.temp_files' &&
    repeated > 0 &&
    parts.slice(0, repeated).join('/') === parts.slice(repeated, repeated * 2).join('/')
  )
    parts.splice(0, repeated);
  return parts.join('/');
}
