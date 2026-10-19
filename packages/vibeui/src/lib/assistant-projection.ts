import {
  indexInsideCodeFence,
  parseNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/webui-protocol';

export function assistantProjection(input: string) {
  const normalized = input
    .replace(/<next_?steps\b[^>]*>\s*/gi, (match, offset: number) =>
      indexInsideCodeFence(input, offset) ? match : '<nextsteps>\n',
    )
    .replace(/\s*<\/next_?steps>/gi, (match, offset: number) =>
      indexInsideCodeFence(input, offset) ? match : '\n</nextsteps>',
    );
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
