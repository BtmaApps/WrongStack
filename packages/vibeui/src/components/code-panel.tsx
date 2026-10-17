'use client';

import { Check, Copy, WrapText } from 'lucide-react';
import { Children, isValidElement, type ReactNode, useState } from 'react';
import { useCopyText } from '../lib/use-copy-text';

export function CodePanel({
  value,
  label = 'Code',
  copyLabel = 'Copy code',
}: {
  value: string;
  label?: string;
  copyLabel?: string;
}) {
  const [wrap, setWrap] = useState(false);
  const { status, copy } = useCopyText(value);
  const lines = value ? value.replace(/\n$/, '').split('\n').length : 0;
  return (
    <section className="code-panel" data-wrap={wrap} aria-label={label}>
      <div className="code-panel-toolbar">
        <span className="code-panel-label">{label}</span>
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
      <span className="sr-only" role="status">
        {status === 'copied' ? 'Copied to clipboard.' : ''}
      </span>
      {status === 'error' && (
        <p className="code-copy-error" role="status">
          Copy unavailable. You can select and copy the text manually.
        </p>
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Bounded code scroll areas need keyboard access. */}
      <pre tabIndex={0}>
        <code>{value}</code>
      </pre>
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
  return <CodePanel value={code.props.children} label={language} />;
}
