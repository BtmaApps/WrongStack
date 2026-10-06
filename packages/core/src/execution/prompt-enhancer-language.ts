/**
 * Language checks for the prompt refiner's bilingual output contract: narrow
 * prompt-domain lexicons, the English-half validator and the wire parser.
 */

import { preserveSkillMentions } from '../skills/mentions.js';
import type { EnhanceResult } from './prompt-enhancer-types.js';

// Deliberately narrow prompt-domain lexicons, not a general language detector.
// Unknown text is rejected so the model gets one corrective pass rather than
// allowing an unverified English label through.
const ENGLISH_PROMPT_WORDS = new Set([
  'a',
  'add',
  'analyze',
  'and',
  'api',
  'as',
  'build',
  'change',
  'check',
  'code',
  'configure',
  'create',
  'delete',
  'document',
  'ensure',
  'error',
  'explain',
  'failure',
  'feature',
  'file',
  'fix',
  'for',
  'from',
  'function',
  'implement',
  'improve',
  'in',
  'into',
  'is',
  'issue',
  'it',
  'keep',
  'make',
  'model',
  'of',
  'only',
  'output',
  'parser',
  'preserve',
  'prompt',
  'race',
  'refactor',
  'remove',
  'request',
  'resolve',
  'response',
  'return',
  'run',
  'should',
  'test',
  'that',
  'the',
  'this',
  'to',
  'translate',
  'update',
  'use',
  'validate',
  'version',
  'when',
  'with',
  'write',
  'condition',
]);

const NON_ENGLISH_PROMPT_WORDS = new Set([
  // Turkish
  'ama',
  'bir',
  'bu',
  'de',
  'düzelt',
  'et',
  'hata',
  'hatasını',
  'hatayı',
  'için',
  'ile',
  'olarak',
  'sadece',
  've',
  'yap',
  'şu',
  // Spanish / Portuguese
  'con',
  'corrige',
  'debe',
  'el',
  'en',
  'erro',
  'la',
  'para',
  'que',
  'sin',
  'una',
  // French
  'avec',
  'dans',
  'des',
  'doit',
  'erreur',
  'et',
  'le',
  'les',
  'pour',
  'sans',
  'une',
  // German
  'das',
  'den',
  'der',
  'die',
  'ein',
  'fehler',
  'für',
  'mit',
  'ohne',
  'und',
]);

function languageWords(text: string): string[] {
  // Normalize Turkish capital dotted İ before lowercasing; generic/English
  // locale lowercasing otherwise leaves a combining dot that splits words.
  return (
    text
      .replaceAll('İ', 'i')
      .toLowerCase()
      .match(/\p{L}+/gu) ?? []
  );
}

function hasNonLatinScript(text: string): boolean {
  return /[\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
    text,
  );
}

function languageScores(text: string): { english: number; nonEnglish: number; words: string[] } {
  const words = languageWords(text);
  let english = 0;
  let nonEnglish = 0;
  for (const word of words) {
    if (ENGLISH_PROMPT_WORDS.has(word)) english++;
    if (NON_ENGLISH_PROMPT_WORDS.has(word)) nonEnglish++;
  }
  // Inspect the original text before languageWords() normalizes dotted İ;
  // these Turkish-specific characters are meaningful non-English evidence.
  if (/[çğıöşüİı]/u.test(text)) nonEnglish += 2;
  if (hasNonLatinScript(text)) nonEnglish += 3;
  return { english, nonEnglish, words };
}

/**
 * Conservative validation for the English half of a bilingual refinement.
 * It requires explicit English instruction vocabulary and rejects every known
 * non-English marker; identifiers and file paths alone are not language proof.
 */
export function isValidEnglishRefinement(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const scores = languageScores(trimmed);
  return scores.nonEnglish === 0 && scores.english > 0;
}

type LatestMessageLanguage = 'english' | 'non_english' | 'unknown';

const VIBE_TAG_PATTERN = /\[vibe\]/iu;

function preserveVibeTag(original: string, candidate: string): string {
  if (!VIBE_TAG_PATTERN.test(original) || VIBE_TAG_PATTERN.test(candidate)) return candidate;
  return `[VIBE] ${candidate}`;
}

function latestMessageLanguage(text: string): LatestMessageLanguage {
  const scores = languageScores(text);
  if (scores.nonEnglish > scores.english) return 'non_english';
  if (scores.english > scores.nonEnglish) return 'english';
  return 'unknown';
}

/**
 * Parse and validate the two-version wire format emitted by the refiner.
 * Visually blank separator padding (ASCII/non-breaking/zero-width whitespace)
 * and CRLF are tolerated, but exactly one separator and two non-empty versions
 * are required. The second version must be English.
 */
export function parseBilingualEnhancement(raw: string, original: string): EnhanceResult | null {
  const separator = /^[\t \u00a0\u200b-\u200d\ufeff]*---[\t \u00a0\u200b-\u200d\ufeff]*\r?$/gm;
  const matches = [...raw.matchAll(separator)];
  if (matches.length !== 1) return null;
  const [match] = matches;
  if (!match) return null;
  const rawRefined = raw.slice(0, match.index).trim();
  const rawEnglish = raw.slice(match.index + match[0].length).trim();
  if (!rawRefined || !rawEnglish) return null;
  const refined = preserveVibeTag(original, rawRefined);
  const english = preserveVibeTag(original, rawEnglish);
  if (!isValidEnglishRefinement(english)) return null;

  // Reject a clearly English first half when the original was non-English.
  // For lexically ambiguous input, require the model to make the first half
  // classifiable; otherwise two unchecked halves could bypass correction.
  const inputLanguage = latestMessageLanguage(original);
  const refinedLanguage = latestMessageLanguage(refined);
  if (inputLanguage === 'non_english' && refinedLanguage === 'english') return null;
  if (inputLanguage === 'unknown' && refinedLanguage === 'unknown') return null;
  return {
    refined: preserveSkillMentions(original, refined),
    english: preserveSkillMentions(original, english),
  };
}
