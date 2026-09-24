/**
 * Images inside the project, for the browser to show: a preview of what
 * `image_generate` wrote (`files.image`), and the before/after of a changed
 * image in the Changes view (`git.diff`).
 *
 * The media type comes from the file's own bytes, never from its name, and
 * only raster formats pass: an SVG is a document that can carry script, and it
 * already diffs as text. Each side is capped so a stray 200 MB TIFF cannot
 * fill a WebSocket frame.
 */

import * as fs from 'node:fs/promises';
import type { WebSocket } from 'ws';
import {
  resolveFileInsideProject,
  validatedPayload,
  withSessionEcho,
} from './file-handler-helpers.js';
import { errMessage, messageSessionId, send } from './ws-utils.js';

/**
 * Largest image sent to the browser, per side. A diff frame carries two, in
 * base64 (4/3 larger): about 11 MB at most, well under the 32 MB a socket may
 * buffer before `sendSerialized` drops a slow client.
 */
const MAX_PREVIEW_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
]);

/** A path whose name says raster image; the bytes still decide. */
export function looksLikeImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

/** The raster media type these bytes start with, or `undefined`. */
function sniffImageMediaType(buf: Uint8Array): string | undefined {
  const at = (i: number) => buf[i];
  const ascii = (start: number, text: string) =>
    [...text].every((ch, i) => at(start + i) === ch.charCodeAt(0));
  if (at(0) === 0x89 && ascii(1, 'PNG')) return 'image/png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(0, 'BM')) return 'image/bmp';
  if (at(0) === 0 && at(1) === 0 && at(2) === 1 && at(3) === 0) return 'image/x-icon';
  if (ascii(4, 'ftypavif') || ascii(4, 'ftypavis')) return 'image/avif';
  return undefined;
}

/** A data URL for these bytes, or `undefined` when they are not a raster image. */
function imageDataUrl(buf: Uint8Array): string | undefined {
  const mediaType = sniffImageMediaType(buf);
  if (!mediaType) return undefined;
  return `data:${mediaType};base64,${Buffer.from(buf).toString('base64')}`;
}

/** `git show <rev>` as bytes; `tooLarge` past the cap, empty when the rev has no such file. */
function gitShowBytes(
  cwd: string | undefined,
  rev: string,
): Promise<{ buf?: Buffer | undefined; tooLarge?: true | undefined }> {
  return import('node:child_process').then(
    ({ execFile }) =>
      new Promise((resolve) => {
        execFile(
          'git',
          ['show', rev],
          {
            cwd,
            encoding: 'buffer',
            maxBuffer: MAX_PREVIEW_IMAGE_BYTES + 1,
            timeout: 5000,
            windowsHide: true,
          },
          (err, stdout) => {
            if ((err as { code?: unknown } | null)?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
              resolve({ tooLarge: true });
            } else resolve(err ? {} : { buf: stdout });
          },
        );
      }),
  );
}

/**
 * The `git.diff` payload for a changed image: the version at HEAD and the
 * working-tree one as data URLs (either may be absent: added or deleted).
 * It keeps `binary: true`, so a client that predates `image` still shows its
 * binary notice.
 */
export async function imageDiffPayload(
  cwd: string | undefined,
  repoPath: string,
  worktreeFile: string,
): Promise<Record<string, unknown>> {
  const empty = { oldText: '', newText: '' };
  const before = await gitShowBytes(cwd, `HEAD:${repoPath}`);
  let after: Buffer | undefined;
  if (worktreeFile) {
    const stat = await fs.stat(worktreeFile).catch(() => undefined);
    if (stat && stat.size > MAX_PREVIEW_IMAGE_BYTES) return { ...empty, tooLarge: true };
    if (stat) after = await fs.readFile(worktreeFile).catch(() => undefined);
  }
  if (before.tooLarge) return { ...empty, tooLarge: true };
  const oldUrl = before.buf?.byteLength ? imageDataUrl(before.buf) : undefined;
  const newUrl = after?.byteLength ? imageDataUrl(after) : undefined;
  if (!oldUrl && !newUrl) return { ...empty, binary: true };
  return {
    ...empty,
    binary: true,
    image: {
      ...(oldUrl ? { old: oldUrl, oldBytes: before.buf?.byteLength } : {}),
      ...(newUrl ? { new: newUrl, newBytes: after?.byteLength } : {}),
    },
  };
}

interface FilesImagePayload {
  filePath: string;
}

/**
 * `files.image` → `{ filePath, dataUrl, bytes }`, or `{ filePath, error }`
 * (`notImage`, `tooLarge` flags). The path resolves inside the project like
 * `files.read`, including the real-path check against symlinks out.
 */
export async function handleFilesImage(
  ws: WebSocket,
  msg: unknown,
  projectRoot: string,
): Promise<void> {
  const sessionId = messageSessionId(msg as { payload?: unknown });
  const reply = (payload: Record<string, unknown>) =>
    send(ws, { type: 'files.image', payload: withSessionEcho(payload, sessionId) });
  let filePath: string;
  try {
    ({ filePath } = validatedPayload<FilesImagePayload>(msg, 'files.image'));
    if (typeof filePath !== 'string' || filePath === '') throw new Error('no path');
  } catch {
    reply({ filePath: '', error: 'Malformed request' });
    return;
  }
  let real: string;
  try {
    real = await resolveFileInsideProject(projectRoot, filePath);
  } catch {
    reply({ filePath, error: 'Forbidden' });
    return;
  }
  try {
    const stat = await fs.stat(real);
    if (stat.size > MAX_PREVIEW_IMAGE_BYTES) {
      reply({ filePath, tooLarge: true, bytes: stat.size });
      return;
    }
    const buf = await fs.readFile(real);
    const dataUrl = imageDataUrl(buf);
    if (!dataUrl) {
      reply({ filePath, notImage: true });
      return;
    }
    reply({ filePath, dataUrl, bytes: buf.byteLength });
  } catch (err) {
    reply({ filePath, error: errMessage(err) });
  }
}
