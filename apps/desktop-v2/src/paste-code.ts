const CODE_LINE =
  /^\s*(?:[{}[\]();]+,?$|(?:import|export|from|const|let|var|function|class|interface|type|enum|return|if|else|for|while|switch|case|try|catch|async|await|def|elif|fn|pub|impl|struct|use|mod|package|func|public|private|protected|static|#include)\b)|^#!|[;{}]\s*$|=>|::|^\s{2,}\S|^\t+\S/;
const FENCE_LINE = /^\s*(?:```|~~~)/;

/** Clipboard text as a textarea stores it: CRLF and lone CR become LF. */
export function pastedText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Whether `offset` falls inside an open fenced code block of `text`. */
export function insideFence(text: string, offset: number): boolean {
  return (text.slice(0, offset).match(/^\s*(?:```|~~~)/gm)?.length ?? 0) % 2 === 1;
}

/**
 * A conservative guess that pasted text is source code: several lines, most of them shaped
 * like code, and no fence of its own. The language is named only when it is unambiguous.
 */
export function pastedCode(text: string): { language: string } | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const content = lines.filter((line) => line.trim());
  if (content.length < 2 || lines.some((line) => FENCE_LINE.test(line))) return null;
  const codeLike = content.filter((line) => CODE_LINE.test(line)).length;
  if (codeLike / content.length < 0.6) return null;
  return { language: codeLanguage(text.trim()) };
}

function codeLanguage(text: string): string {
  if (/^[[{]/.test(text))
    try {
      JSON.parse(text);
      return 'json';
    } catch {}
  if (/^\s*def \w+\(.*\):\s*$/m.test(text) || /^\s*(?:from \S+ )?import \w[\w.]*\s*$/m.test(text))
    return 'python';
  if (/^\s*(?:pub )?fn \w+|\blet mut\b|^\s*use \w+::/m.test(text)) return 'rust';
  if (/^\s*package \w+\s*$/m.test(text) && /^\s*func /m.test(text)) return 'go';
  if (/^#!\/(?:usr\/)?bin\/(?:env )?(?:ba|z)?sh/.test(text)) return 'bash';
  return '';
}

/** Replace `draft[start, start + text.length)` with the same text as a fenced block. */
export function fencePaste(
  draft: string,
  start: number,
  text: string,
  language: string,
): { text: string; cursor: number } {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const before = draft.slice(0, start),
    after = draft.slice(start + text.length);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  const trail = after.startsWith('\n') ? '' : '\n';
  const block = `${lead}${fence}${language}\n${text.replace(/\n+$/, '')}\n${fence}${trail}`;
  return { text: before + block + after, cursor: before.length + block.length };
}
