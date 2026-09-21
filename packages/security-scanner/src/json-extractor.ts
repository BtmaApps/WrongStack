import { sanitizeJsonString } from '@wrongstack/core/utils';

type JsonContainer = 'object' | 'array';

function parseJsonContainer(
  candidate: string,
  container: JsonContainer,
): { hasObject: boolean } | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (container === 'array') {
      if (!Array.isArray(parsed)) return null;
      const hasObject = parsed.some((x) => typeof x === 'object' && x !== null);
      return { hasObject };
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const hasObject = Object.keys(parsed as Record<string, unknown>).length > 0;
      return { hasObject };
    }
    return null;
  } catch {
    const sanitized = sanitizeJsonString(candidate);
    if (!sanitized) return null;
    try {
      const parsed: unknown = JSON.parse(sanitized);
      if (container === 'array') {
        if (!Array.isArray(parsed)) return null;
        const hasObject = parsed.some((x) => typeof x === 'object' && x !== null);
        return { hasObject };
      }
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const hasObject = Object.keys(parsed as Record<string, unknown>).length > 0;
        return { hasObject };
      }
      return null;
    } catch {
      return null;
    }
  }
}

function extractBalanced(text: string, container: JsonContainer): string | null {
  const opening = container === 'object' ? '{' : '[';
  const closing = container === 'object' ? '}' : ']';

  // One string-aware pass marks every position inside a JSON-style string
  // (double-quoted, backslash escapes). The start scan below must ignore
  // brackets inside strings: an LLM preamble like `see "[1]" markers` makes
  // `[1]` the first bracket.
  const insideString = new Array<boolean>(text.length).fill(false);
  let inString = false;
  let escaped = false;
  let stringStartIndex = -1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\n' || char === '\r') {
      if (inString && stringStartIndex >= 0) {
        for (let i = stringStartIndex; i <= index; i++) {
          insideString[i] = false;
        }
        inString = false;
        escaped = false;
        stringStartIndex = -1;
      }
      continue;
    }
    if (inString) {
      insideString[index] = true;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        inString = false;
        stringStartIndex = -1;
      }
      continue;
    }
    if (char === '"') {
      insideString[index] = true;
      inString = true;
      stringStartIndex = index;
    }
  }

  // If double quotes in prose were unclosed, rollback insideString for the
  // unclosed portion so valid JSON following an unclosed quote is not skipped.
  if (inString && stringStartIndex >= 0) {
    for (let index = stringStartIndex; index < text.length; index++) {
      insideString[index] = false;
    }
  }

  let firstBalanced: string | null = null;

  const findCandidate = (ignoreInsideString: boolean): string | null => {
    let best: { raw: string; hasObject: boolean; length: number } | null = null;

    for (let start = 0; start < text.length; start++) {
      if ((!ignoreInsideString && insideString[start]) || text[start] !== opening) continue;

      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let index = start; index < text.length; index++) {
        const char = text[index];
        if (inStr) {
          if (esc) esc = false;
          else if (char === '\\') esc = true;
          else if (char === '"') inStr = false;
          continue;
        }
        if (char === '"') {
          inStr = true;
        } else if (char === opening) {
          depth++;
        } else if (char === closing) {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, index + 1);
            const parsed = parseJsonContainer(candidate, container);
            if (parsed) {
              const current = {
                raw: candidate,
                hasObject: parsed.hasObject,
                length: candidate.length,
              };
              if (
                !best ||
                (current.hasObject && !best.hasObject) ||
                (current.hasObject === best.hasObject && current.length > best.length)
              ) {
                best = current;
              }
            }
            if (firstBalanced === null) {
              firstBalanced = candidate;
            }
            break;
          }
        }
      }
    }
    return best?.raw ?? null;
  };

  // Pass 1: Prefer brackets outside strings
  const preferred = findCandidate(false);
  if (preferred) return preferred;

  // Pass 2: Fallback across unclosed quote boundaries if no valid container was found
  const fallback = findCandidate(true);
  if (fallback) return fallback;

  return firstBalanced;
}

export function extractJsonBlock(text: string, container: JsonContainer): string | null {
  if (typeof text !== 'string' || (container !== 'object' && container !== 'array')) return null;
  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/gi)];
  for (const match of fencedBlocks) {
    const extracted = extractBalanced(match[1]!, container);
    if (extracted && parseJsonContainer(extracted, container)) return extracted;
  }
  return extractBalanced(text, container);
}
