import {
  indexInsideCodeFence,
  parseNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/webui-protocol';

export function assistantProjection(input: string) {
  let normalized = input.replace(/<next_?steps\b[^>]*>\s*/gi, (match, offset: number) =>
    indexInsideCodeFence(input, offset) ? match : '<nextsteps>\n',
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
  const openRe = /<next_?steps\b[^>]*>/gi;
  let opening: RegExpExecArray | null = null;
  for (let m = openRe.exec(input); m !== null; m = openRe.exec(input)) {
    if (!indexInsideCodeFence(input, m.index)) {
      opening = m;
      break;
    }
  }
  if (opening) {
    const closeRe = /<\/next_?steps>/gi;
    closeRe.lastIndex = opening.index + opening[0].length;
    let hasUnfencedClose = false;
    for (let c = closeRe.exec(input); c !== null; c = closeRe.exec(input)) {
      if (!indexInsideCodeFence(input, c.index)) {
        hasUnfencedClose = true;
        break;
      }
    }
    return {
      text: hasUnfencedClose
        ? stripNextStepsBlock(normalized)
        : input.slice(0, opening.index).trimEnd(),
      steps: [],
    };
  }
  return { text: stripNextStepsBlock(input), steps: [] };
}
