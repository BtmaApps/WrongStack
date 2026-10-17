import { readFileSync } from 'node:fs';

/**
 * Parse JSONC (JSON with `//` and `/* *\/` comments and trailing commas), the
 * format Bun writes `bun.lock` in. Runtime-neutral: works under Node as well as
 * Bun, unlike the `Bun.JSONC` global. Comments and trailing commas are removed
 * outside string literals, then the result is handed to `JSON.parse`.
 */
export function parseJsonc(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      // Copy the string literal verbatim, honouring backslash escapes.
      const start = i++;
      while (i < n && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      out += text.slice(start, ++i);
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (ch === ',') {
      // Drop a trailing comma: the next significant character closes a scope.
      let j = i + 1;
      for (;;) {
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === '/' && text[j + 1] === '/') {
          while (j < n && text[j] !== '\n') j++;
        } else if (text[j] === '/' && text[j + 1] === '*') {
          const end = text.indexOf('*/', j + 2);
          j = end === -1 ? n : end + 2;
        } else break;
      }
      if (text[j] !== '}' && text[j] !== ']') out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return JSON.parse(out);
}

export function readBunLock(file) {
  return parseJsonc(readFileSync(file, 'utf8'));
}
