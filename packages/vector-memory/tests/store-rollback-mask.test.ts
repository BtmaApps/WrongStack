import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];

vi.mock('@wrongstack/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wrongstack/persistence')>();

  class FaultingDatabase {
    exec(sql: string): void {
      if (sql.trim() === 'ROLLBACK') {
        throw new Error('SECONDARY: no transaction is active');
      }
    }

    prepare(): { run: () => never } {
      return {
        run: () => {
          throw new Error('PRIMARY: provider metadata write failed');
        },
      };
    }
  }

  return { ...actual, loadRuntimeDatabaseSync: () => FaultingDatabase };
});

import { VectorMemoryStore } from '../src/store.js';

function projectRoot(label: string): string {
  const root = join(tmpdir(), `wrongstack-vector-rollback-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('VectorMemoryStore transaction failure reporting', () => {
  it('preserves the provider-metadata write error when rollback also fails', () => {
    expect(
      () =>
        new VectorMemoryStore({
          projectRoot: projectRoot('victim'),
          provider: {
            id: 'proof-provider',
            dimensions: 4,
            embed: async () => new Float32Array(4),
          },
        }),
    ).toThrow('PRIMARY: provider metadata write failed');
  });

  it('rejects a missing provider before opening the database', () => {
    expect(
      () =>
        new VectorMemoryStore({
          projectRoot: projectRoot('control'),
          provider: undefined as never,
        }),
    ).toThrow('provider is required');
  });
});
