'use client';

import { Check, Copy, WrapText } from 'lucide-react';
import { Children, createElement, isValidElement, type ReactNode, useMemo, useState } from 'react';
import { codeLanguage, highlightCode, jsonContent } from '../lib/code-content';
import { useCopyText } from '../lib/use-copy-text';
import { JsonTree } from './json-tree';

type HighlightNode = {
  type: string;
  value?: string;
  properties?: { className?: (string | number)[] };
  children?: HighlightNode[];
};
function highlightedNodes(nodes: HighlightNode[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === 'text'
      ? node.value
      : createElement(
          'span',
          {
            key: index,
            className: node.properties?.className?.join(' '),
          },
          highlightedNodes(node.children ?? []),
        ),
  );
}

export function CodePanel({
  value,
  label = 'Code',
  copyLabel = 'Copy code',
  language = '',
  defaultView = 'formatted',
  className = '',
  formatJson = true,
}: {
  value: string;
  label?: string;
  copyLabel?: string;
  language?: string;
  defaultView?: 'formatted' | 'tree';
  className?: string;
  formatJson?: boolean;
}) {
  const [wrap, setWrap] = useState(false);
  const [view, setView] = useState<'formatted' | 'raw' | 'tree'>(defaultView);
  const json = useMemo(() => (formatJson ? jsonContent(value) : null), [value, formatJson]);
  const display = json && view !== 'raw' ? json.formatted : value;
  const syntax = json ? 'json' : codeLanguage(language || label);
  const highlighted = useMemo(() => highlightCode(display, syntax), [display, syntax]);
  const { status, copy } = useCopyText(value);
  const lines = display ? display.replace(/\n$/, '').split('\n').length : 0;
  return (
    <section className={`code-panel ${className}`} data-wrap={wrap} aria-label={label}>
      <div className="code-panel-toolbar">
        <span className="code-panel-label">{label}</span>
        {syntax && <span className="code-language">{syntax}</span>}
        <span className="code-panel-lines">
          {lines.toLocaleString()} {lines === 1 ? 'line' : 'lines'}
        </span>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Wrap lines"
            title="Wrap long lines"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            className="code-copy"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={() => void copy(value)}
          >
            {status === 'copied' ? <Check size={13} /> : <Copy size={13} />}
            <span>{status === 'copied' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      {json && (
        <fieldset className="code-panel-views" aria-label={`${label} view`}>
          {(['tree', 'formatted', 'raw'] as const).map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option === 'tree' ? 'Tree' : option === 'formatted' ? 'Formatted' : 'Raw'}
            </button>
          ))}
          <span>Copy keeps the original source</span>
        </fieldset>
      )}
      <span className="sr-only" role="status">
        {status === 'copied' ? 'Copied to clipboard.' : ''}
      </span>
      {status === 'error' && (
        <p className="code-copy-error" role="status">
          Copy unavailable. You can select and copy the text manually.
        </p>
      )}
      {json && view === 'tree' ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Bounded JSON scroll areas need keyboard access.
        <section className="json-tree" tabIndex={0} aria-label={`${label} JSON tree`}>
          <JsonTree node={json.node} />
        </section>
      ) : (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Bounded code scroll areas need keyboard access.
        <pre tabIndex={0}>
          <code>{highlighted ? highlightedNodes(highlighted.children) : display}</code>
        </pre>
      )}
    </section>
  );
}

export function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const code = Children.toArray(children).find((child) =>
    isValidElement<{ className?: string; children?: ReactNode }>(child),
  );
  if (
    !isValidElement<{ className?: string; children?: ReactNode }>(code) ||
    typeof code.props.children !== 'string'
  )
    return <pre>{children}</pre>;
  const language = /(?:^|\s)language-([\w+-]+)/.exec(code.props.className ?? '')?.[1] || 'Code';
  return <CodePanel value={code.props.children} label={language} language={language} />;
}
