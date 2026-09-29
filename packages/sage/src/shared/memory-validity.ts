import type { MemoryValidity } from '../memory-model.js';

export function normalizeValidity(value: unknown): MemoryValidity | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('SAGE validity requires a statement and optional source checks.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !['statement', 'checks'].includes(key)))
    throw new Error('Unknown SAGE validity field.');
  if (typeof v.statement !== 'string' || !v.statement.trim() || v.statement.length > 1000)
    throw new Error('SAGE validity statement must contain 1–1000 characters.');
  if (v.checks !== undefined && (!Array.isArray(v.checks) || v.checks.length > 4))
    throw new Error('SAGE validity supports at most four source checks.');
  const checks = (v.checks as unknown[] | undefined)?.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid SAGE validity check.');
    const c = entry as Record<string, unknown>;
    if (
      Object.keys(c).some((key) => !['type', 'path', 'text'].includes(key)) ||
      c.type !== 'source_contains' ||
      typeof c.path !== 'string' ||
      !c.path.trim() ||
      c.path.length > 500 ||
      /^[\\/]|^[a-z]:/i.test(c.path) ||
      c.path.split(/[\\/]/).some((part) => part === '..') ||
      /[\x00-\x1f]/.test(c.path) ||
      typeof c.text !== 'string' ||
      !c.text.trim() ||
      c.text.length > 400
    )
      throw new Error(
        'SAGE validity checks require a relative project path and a literal of 1–400 characters.',
      );
    return { type: 'source_contains' as const, path: c.path.replaceAll('\\', '/'), text: c.text };
  });
  return { statement: v.statement.trim(), ...(checks?.length ? { checks } : {}) };
}

export function validityKey(value: MemoryValidity | undefined): string {
  return JSON.stringify(normalizeValidity(value) ?? null);
}
