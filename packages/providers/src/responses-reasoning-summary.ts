/** Keep server summary parts in their original order; legacy metadata has none. */
export function responsesReasoningSummary(
  value: unknown,
): Array<{ type: 'summary_text'; text: string }> {
  if (
    !Array.isArray(value) ||
    !value.every(
      (part) =>
        part !== null &&
        typeof part === 'object' &&
        part.type === 'summary_text' &&
        typeof part.text === 'string',
    )
  )
    return [];
  return value.map((part) => ({ type: 'summary_text', text: part.text }));
}
