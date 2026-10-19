import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { ToolValidationError } from '@wrongstack/core/types';
import { withTransientPrivateOrigin } from './browser/policy.js';

/**
 * Measure a project HTML file without a dev server: serve the project root on
 * an ephemeral 127.0.0.1 port for the length of one call, allow exactly that
 * origin for the browser guard while it runs, then close both.
 *
 * Static pages are the common case this exists for — a model that wrote
 * `index.html` had no URL to inspect, so the rendered gate never ran. Only
 * GET/HEAD of files inside the (realpath'd) project root are answered; the
 * server is never reachable off-host and is not reused across calls.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Validate `file` (project-relative .html/.htm inside the root); returns its URL path. */
export async function resolvePageFile(projectRoot: string, file: string): Promise<string> {
  const root = await fs.realpath(projectRoot);
  const abs = path.resolve(root, file);
  let real: string;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new ToolValidationError({
      message: `design_reference: "${file}" does not exist in the project.`,
      field: 'file',
    });
  }
  if (!inside(root, real) || !/\.html?$/i.test(real)) {
    throw new ToolValidationError({
      message: `design_reference: "file" must be an .html file inside the project root (got "${file}").`,
      field: 'file',
    });
  }
  return `/${path.relative(root, real).split(path.sep).map(encodeURIComponent).join('/')}`;
}

/** Serve the project root on loopback, run `fn` with the page URL, then shut down. */
export async function withServedProjectFile<T>(
  projectRoot: string,
  file: string,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  const urlPath = await resolvePageFile(projectRoot, file);
  const root = await fs.realpath(projectRoot);
  const server = http.createServer((req, res) => {
    void (async () => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      try {
        const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
        let target = path.resolve(root, `.${pathname}`);
        if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
        const real = await fs.realpath(target);
        if (!inside(root, real)) throw new Error('outside');
        const body = await fs.readFile(real);
        res.writeHead(200, {
          'content-type': TYPES[path.extname(real).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch {
        res.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    return await withTransientPrivateOrigin(projectRoot, origin, () => fn(`${origin}${urlPath}`));
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
