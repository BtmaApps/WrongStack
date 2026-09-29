import { isSecretField } from '@wrongstack/core/security';

export function redactKeys(obj: unknown, seen = new WeakSet<object>()): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(obj)) return obj.map((item) => redactKeys(item, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === '__proto__') {
      Object.defineProperty(out, k, {
        value: redactKeys(v, seen),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      continue;
    }
    if (isSecretField(k) && typeof v === 'string' && v.length > 0) out[k] = '[REDACTED]';
    else out[k] = redactKeys(v, seen);
  }
  return out;
}
