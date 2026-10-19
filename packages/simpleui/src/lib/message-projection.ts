import {
  indexInsideCodeFence,
  type ParsedNextStep,
  parseNextSteps,
  stripNextStepsBlock,
} from '@wrongstack/tools/next-steps';

export interface AssistantMessageProjection {
  text: string;
  nextSteps: ParsedNextStep[];
}

/**
 * Normalize persisted/legacy spellings before handing content to WrongStack's
 * canonical browser-safe parser. This keeps parsing rules in one package while
 * preventing XML control tags from leaking into the minimal chat surface.
 */
function normalizeNextStepsTags(text: string): string {
  return text
    .replace(/<next_?steps\b[^>]*>\s*/gi, (match, offset: number) =>
      indexInsideCodeFence(text, offset) ? match : '<nextsteps>\n',
    )
    .replace(/\s*<\/next_?steps>/gi, (match, offset: number) =>
      indexInsideCodeFence(text, offset) ? match : '\n</nextsteps>',
    );
}

export function projectAssistantMessage(text: string): AssistantMessageProjection {
  const normalized = normalizeNextStepsTags(text);
  const parsed = parseNextSteps(normalized);

  if (parsed.steps.length > 0) {
    return { text: stripNextStepsBlock(parsed.stripped), nextSteps: parsed.steps };
  }

  const openRe = /<next_?steps\b[^>]*>/gi;
  let openingTag: RegExpExecArray | null = null;
  for (let m = openRe.exec(text); m !== null; m = openRe.exec(text)) {
    if (!indexInsideCodeFence(text, m.index)) {
      openingTag = m;
      break;
    }
  }
  if (!openingTag) return { text, nextSteps: [] };

  // During streaming, hide machine-readable metadata from the moment its
  // opening tag arrives. A balanced but malformed block is stripped too:
  // suggestions are optional UI metadata, never user-facing answer prose.
  const closeRe = /<\/next_?steps>/gi;
  closeRe.lastIndex = openingTag.index + openingTag[0].length;
  let hasUnfencedClose = false;
  for (let c = closeRe.exec(text); c !== null; c = closeRe.exec(text)) {
    if (!indexInsideCodeFence(text, c.index)) {
      hasUnfencedClose = true;
      break;
    }
  }
  const visibleText = hasUnfencedClose
    ? stripNextStepsBlock(normalized)
    : text.slice(0, openingTag.index).trimEnd();
  return { text: visibleText, nextSteps: [] };
}
