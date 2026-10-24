/** JSON parsing helpers moved to `@wrongstack/primitives/safe-json`; re-exported here for existing core importers. */
export {
  type SafeParseResult,
  safeParse,
  safeStringify,
  sanitizeJsonString,
  stripCodeFences,
} from '@wrongstack/primitives/safe-json';
