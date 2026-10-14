import * as fs from 'node:fs/promises';

/**
 * Remove a test fixture directory, retrying while Windows still holds it.
 *
 * `fs.rm`'s own `maxRetries`/`retryDelay` are no help under `bun --bun vitest`:
 * Bun ignores them on EBUSY and throws on the first attempt, so a directory a
 * just-exited child process still holds fails the cleanup at once. This is the
 * package-local twin of `removeProjectFixtureDirectory` in
 * `packages/core/tests/helpers/project-server-harness.ts`; this package's test
 * project pins `rootDir` to the package, so it cannot import that one.
 */
export async function removeProjectFixtureDirectory(
  directory: string,
  options: { maxRetries?: number; retryDelay?: number } = {},
): Promise<void> {
  const maxRetries = options.maxRetries ?? 20;
  const retryDelay = options.retryDelay ?? 50;
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        attempt >= maxRetries ||
        !['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM'].includes(code ?? '')
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }
}
