import { expect, it } from 'vitest';
import { createZipBuffer, readZipEntries } from '../src/server/zip.js';

it.each([true, false])('counts all local entries with unique names=%s', (unique) => {
  for (const count of [0, 1, 1000, 1001]) {
    const zip = createZipBuffer(
      Array.from({ length: count }, (_, i) => ({
        name: unique ? `f${i}` : 'same',
        data: String(i),
      })),
    );
    if (count > 1000) expect(() => readZipEntries(zip)).toThrow('too many entries');
    else {
      const result = readZipEntries(zip);
      expect(result.size).toBe(unique ? count : Math.min(count, 1));
      if (count && !unique) expect(result.get('same')?.toString()).toBe(String(count - 1));
    }
  }
});
