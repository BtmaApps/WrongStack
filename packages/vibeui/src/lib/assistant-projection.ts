import {
  indexInsideCodeFence,
  parseNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/webui-protocol';

export function assistantProjection(input: string) {
  const normalized = input
    .replace(/<next_?steps\b[^>]*>\s*/gi, '<nextsteps>\n')
    .replace(/\s*<\/next_?steps>/gi, '\n</nextsteps>');
  const parsed = parseNextSteps(normalized);
  if (parsed.steps.length)
    return { text: stripNextStepsBlock(parsed.stripped), steps: parsed.steps };
  const opening = /<next_?steps\b[^>]*>/i.exec(input);
  if (opening && !indexInsideCodeFence(input, opening.index))
    return {
      text: /<\/next_?steps>/i.test(input)
        ? stripNextStepsBlock(normalized)
        : input.slice(0, opening.index).trimEnd(),
      steps: [],
    };
  return { text: stripNextStepsBlock(input), steps: [] };
}
