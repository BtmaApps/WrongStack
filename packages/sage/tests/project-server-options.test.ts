import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/project-server-options.js';

describe('SAGE project-server argv parsing', () => {
  it('resolves a valid project root and preserves an optional storage directory', () => {
    expect(parseArgs(['--project-root', 'relative-project', '--directory', '.sage-data'])).toEqual({
      projectRoot: path.resolve('relative-project'),
      directory: '.sage-data',
    });
  });

  it('rejects a missing project-root value instead of consuming the next option', () => {
    expect(() => parseArgs(['--project-root', '--directory', '.sage-data'])).toThrow(
      '--project-root requires a value',
    );
  });

  it('rejects a missing directory value instead of silently using default storage', () => {
    expect(() => parseArgs(['--project-root', 'relative-project', '--directory'])).toThrow(
      '--directory requires a value',
    );
  });
});
