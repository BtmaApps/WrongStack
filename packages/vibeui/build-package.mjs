import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBuildOutput } from '../../scripts/lib/build-output-cleanup.mjs';

// CLI distributions serve static assets; Next itself is only needed at build time.
const packageRoot = dirname(fileURLToPath(import.meta.url));
const output = resolve(packageRoot, 'dist');
if (process.cwd() !== packageRoot || dirname(output) !== packageRoot) {
  throw new Error('VibeUI must be built from its package directory.');
}
cleanBuildOutput(output);
mkdirSync('dist', { recursive: true });
cpSync('out', 'dist', { recursive: true });
writeFileSync('dist/index.js', "export const surface = 'vibeui';\n");
writeFileSync('dist/index.d.ts', "export declare const surface: 'vibeui';\n");
