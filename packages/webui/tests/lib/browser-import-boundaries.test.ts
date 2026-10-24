import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(import.meta.dirname, '../../src');

function browserSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'server' ? [] : browserSourceFiles(absolutePath);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe('browser import boundaries', () => {
  it('does not import Node-only core barrels into browser source', () => {
    const forbiddenSpecifiers = [
      '@wrongstack/core/execution',
      '@wrongstack/core/execution/prompt-enhancer',
      '@wrongstack/agent-catalog',
    ];
    const violations = browserSourceFiles(srcRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbiddenSpecifiers
        .filter(
          (specifier) =>
            source.includes(`from '${specifier}'`) || source.includes(`from "${specifier}"`),
        )
        .map((specifier) => `${path.relative(srcRoot, file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
