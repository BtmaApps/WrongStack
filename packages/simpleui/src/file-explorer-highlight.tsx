import type React from 'react';

// ── Syntax highlighting overlay ─────────────────────────────────────
// Lightweight token-based highlighter — wraps keywords, strings, comments,
// and numbers in <span> elements with CSS classes. Not a full parser, but
// enough to make code readable behind the transparent textarea. Returns
// React nodes so the raw file text is escaped by React itself — no HTML
// string is ever injected into the document.
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'css',
  'scss',
  'html',
  'xml',
  'svg',
  'py',
  'rs',
  'go',
  'rb',
  'java',
  'c',
  'cpp',
  'h',
  'sh',
  'bash',
  'yml',
  'yaml',
  'sql',
  'md',
  'graphql',
]);

const TOKEN_PATTERN =
  /(\/\/[^\n]*|#[^\n]*)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)|(\b\d+\.?\d*\b)|(\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|class|extends|implements|import|export|from|default|async|await|new|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|yield|interface|type|enum|public|private|protected|static|readonly|abstract|namespace|declare|module|def|elif|fn|struct|impl|pub|use|match|package|func|val|nil)\b)/g;

export function highlightContent(text: string, selectedPath: string | null): React.ReactNode {
  if (!text) return null;
  const ext = selectedPath?.split('.').pop()?.toLowerCase() ?? '';
  if (!CODE_EXTENSIONS.has(ext)) return text;

  const pattern = new RegExp(TOKEN_PATTERN.source, 'g');
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const className = match[1]
      ? 'hl-comment'
      : match[2]
        ? 'hl-string'
        : match[3]
          ? 'hl-number'
          : 'hl-keyword';
    nodes.push(
      <span key={`hl-${key++}`} className={className}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
