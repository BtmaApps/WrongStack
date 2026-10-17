import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { wrongstackPackageJsonPath } from '@wrongstack/core/utils';

/** Resolve prebuilt assets in workspace, npm and extracted standalone installations. */
export function resolveVibeUiDistDir(
  deps: { resolvePackageJson?: () => string; exists?: (file: string) => boolean } = {},
): string {
  const require = createRequire(import.meta.url);
  let packageJson: string;
  try {
    packageJson =
      deps.resolvePackageJson?.() ??
      wrongstackPackageJsonPath('@wrongstack/vibeui', (id) => require.resolve(id));
  } catch {
    throw new Error('VibeUI package is unavailable. Reinstall WrongStack with @wrongstack/vibeui.');
  }
  const distDir = path.join(path.dirname(packageJson), 'dist');
  if (!(deps.exists ?? existsSync)(path.join(distDir, 'index.html'))) {
    throw new Error(
      'VibeUI frontend is not built. Run `bun run --filter @wrongstack/vibeui build`.',
    );
  }
  return distDir;
}
