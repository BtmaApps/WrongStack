import {
  indexInsideCodeFence,
  parseNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/webui-protocol';

export function assistantProjection(input: string) {
  let normalized = input.replace(
    /<next_?steps(?![-\w])(?:\s[^/>]*)?>\s*/gi,
    (match, offset: number) => (indexInsideCodeFence(input, offset) ? match : '<nextsteps>\n'),
  );
  normalized = normalized.replace(/\s*<\/next_?steps>/gi, (match, offset: number) => {
    // The string being scanned here is the FIRST pass's output: rewriting a
    // legacy opening tag changes its length, so offsets in `input` no longer
    // line up with positions in the scanned string — and the match itself
    // starts at `\s*`, which reaches back into a fenced example that ends
    // immediately before the tag (scanFences covers the closing-fence line
    // and its trailing newline). Ask the fence question about the scanned
    // string at the close TAG's own offset; a genuinely-unfenced close is
    // then folded, and parseNextSteps can find the block.
    const tagOffset = offset + match.indexOf('<');
    return indexInsideCodeFence(normalized, tagOffset) ? match : '\n</nextsteps>';
  });
  const parsed = parseNextSteps(normalized);
  if (parsed.steps.length)
    return { text: stripNextStepsBlock(parsed.stripped), steps: parsed.steps };
  const openRe = /<next_?steps(?![-\w])(?:\s[^/>]*)?>/gi;
  let hadUnfencedOpen = false;
  for (let m = openRe.exec(input); m !== null; m = openRe.exec(input)) {
    if (indexInsideCodeFence(input, m.index)) continue;
    hadUnfencedOpen = true;
    const closeRe = /<\/next_?steps>/gi;
    closeRe.lastIndex = m.index + m[0].length;
    let matchedClose: RegExpExecArray | null = null;
    for (let c = closeRe.exec(input); c !== null; c = closeRe.exec(input)) {
      if (!indexInsideCodeFence(input, c.index)) {
        matchedClose = c;
        break;
      }
    }
    if (!matchedClose) {
      return {
        text: stripNextStepsBlock(input.slice(0, m.index)).trimEnd(),
        steps: [],
      };
    }
    openRe.lastIndex = matchedClose.index + matchedClose[0].length;
  }
  if (hadUnfencedOpen) {
    return { text: stripNextStepsBlock(normalized), steps: [] };
  }
  return { text: stripNextStepsBlock(input), steps: [] };
}
