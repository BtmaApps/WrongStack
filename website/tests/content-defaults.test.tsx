import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  DEFAULT_SESSION_LOGGING_CONFIG,
  DEFAULT_TOOLS_CONFIG,
} from '../../packages/core/src/types/default-config';
import { settingGroups } from '../src/data/content-reference';

const fields = settingGroups.flatMap((group) => group.fields);

function documentedDefault(key: string) {
  const field = fields.find((candidate) => candidate.key === key);
  expect(field, `Missing documented setting: ${key}`).toBeDefined();
  return field?.defaultValue;
}

it('documents the actual turn limit and audit defaults', () => {
  const limit = DEFAULT_TOOLS_CONFIG.maxIterations;
  expect(documentedDefault('tools.maxIterations')).toBe(
    limit === 0 ? '0 (unlimited)' : String(limit),
  );
  expect(documentedDefault('session.auditLevel')).toBe(DEFAULT_SESSION_LOGGING_CONFIG.auditLevel);
});

it('documents the top-level concurrency key and log default from the config loader', () => {
  const defaults = readFileSync(
    resolve(process.cwd(), '../packages/core/src/storage/config-loader/defaults.ts'),
    'utf8',
  );
  const concurrency = defaults.match(/^\s+maxConcurrent:\s*(\d+),/m)?.[1];
  const logLevel = defaults.match(/log:\s*\{\s*level:\s*'([^']+)'\s*\}/)?.[1];
  expect(concurrency).toBeDefined();
  expect(logLevel).toBeDefined();
  expect(documentedDefault('maxConcurrent')).toBe(concurrency);
  expect(fields.some((field) => field.key === 'fleet.maxConcurrent')).toBe(false);
  expect(documentedDefault('log.level')).toBe(logLevel);
});
