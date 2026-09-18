/** Keep buffer offsets in UTF-16 while editing and painting whole visible characters. */
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function inputGraphemes(value: string): Intl.Segments {
  return segmenter.segment(value);
}

export function previousGraphemeIndex(value: string, cursor: number): number {
  return inputGraphemes(value).containing(Math.max(0, cursor - 1))?.index ?? 0;
}

export function nextGraphemeIndex(value: string, cursor: number): number {
  const part = inputGraphemes(value).containing(cursor);
  return part ? part.index + part.segment.length : value.length;
}
