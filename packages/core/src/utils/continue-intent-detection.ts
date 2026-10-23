/**
 * Normalized phrases that mean "just keep going" on their own. Matching is
 * deliberately exact so substantive prompts such as "continue with auth"
 * remain ordinary user instructions.
 */
const CONTINUE_PHRASES: ReadonlySet<string> = new Set([
  'continue',
  'cont',
  'continue continue',
  'continue working',
  'keep going',
  'keep it going',
  'keep going on',
  'keep working',
  'keep on',
  'carry on',
  'go on',
  'goon',
  'go ahead',
  'proceed',
  'proceed further',
  'onward',
  'onwards',
  'next',
  'next step',
  'more',
  'resume',
  'and continue',
  'yes continue',
  'ok continue',
  'devam',
  'devam et',
  'devam et bakalim',
  'devam edelim',
  'devam edin',
  'devam etsene',
  'devam etsenize',
  'devam ediyoruz',
  'devam et lutfen',
  'surdur',
  'devam etsen',
  'devam et hadi',
  'hadi devam',
  'bir tur daha',
  'bir tur daha at',
  'bir tur daha bakalim',
  'bir tur daha atalim',
  'bir tur daha at bakalim',
  'weiter',
  'mach weiter',
  'continuar',
  'continua',
  'continuer',
  'continue por favor',
]);

const POLITENESS_SUFFIXES: readonly string[] = [
  'please',
  'pls',
  'plz',
  'lutfen',
  'thanks',
  'thank you',
  'thx',
  'ty',
];

function foldDiacritics(text: string): string {
  return text
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

function normalizeContinueInput(raw: string): string {
  // 'İ' first: its default lowercase is 'i' + U+0307, which the fold misses.
  let normalized = foldDiacritics(raw.trim().replace(/İ/g, 'i').toLowerCase());
  normalized = normalized.replace(/^["'`]+/, '').replace(/["'`]+$/, '');
  normalized = normalized.replace(/^[\s.!?,;:…]+/, '').replace(/[\s.!?,;:…]+$/, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  for (const suffix of POLITENESS_SUFFIXES) {
    if (normalized === suffix) break;
    if (normalized.endsWith(` ${suffix}`)) {
      normalized = normalized.slice(0, normalized.length - suffix.length - 1).trim();
      break;
    }
  }
  return normalized;
}

/** True only when the entire input is a bare continuation nudge. */
export function detectContinueIntent(raw: string): boolean {
  if (!raw || raw.length > 40) return false;
  const normalized = normalizeContinueInput(raw);
  if (!normalized || normalized.split(' ').length > 4) return false;
  return CONTINUE_PHRASES.has(normalized);
}
