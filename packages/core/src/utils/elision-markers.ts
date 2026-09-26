/**
 * How compaction marks tool I/O it has replaced with a receipt.
 *
 * Kept below the execution layer so code outside compaction (the required-skill
 * gate in `skills/`) can tell whether a tool call is still readable without
 * depending on the compactor. `execution/compaction-elision.ts` re-exports both.
 */

export function isElidedResultContent(content: string): boolean {
  return (
    typeof content === 'string' &&
    (content.startsWith('[elided:') || content.startsWith('[stale read of '))
  );
}

export function isElidedToolInput(input: Record<string, unknown> | undefined): boolean {
  return (
    !!input && (Object.hasOwn(input, '__elided_tool_input') || Object.hasOwn(input, '__stale_read'))
  );
}
