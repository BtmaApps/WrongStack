'use client';

import { useMemo, useState } from 'react';
import { jsonContent } from '../lib/code-content';
import { useCopyText } from '../lib/use-copy-text';
import { CodePanel } from './code-panel';
import { MarkdownContent } from './markdown-content';

/** Render prose/Markdown where present, with the exact source always available. */
export function ContentView({
  value,
  label = 'Content',
  copyLabel = 'Copy content',
}: {
  value: string;
  label?: string;
  copyLabel?: string;
}) {
  const [source, setSource] = useState(false);
  const { status, copy } = useCopyText(value);
  const json = useMemo(() => jsonContent(value), [value]);
  const markdown =
    /(^|\n)\s*(#{1,6}\s|```|~~~|[-*+]\s|\d+\.\s|>\s|\|)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/.test(
      value,
    );
  if (json || !markdown)
    return <CodePanel value={value} label={label} copyLabel={copyLabel} defaultView="tree" />;
  return (
    <section className="content-view" aria-label={label}>
      <fieldset className="code-panel-views" aria-label={`${label} view`}>
        <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>
          Rendered
        </button>
        <button type="button" aria-pressed={source} onClick={() => setSource(true)}>
          Source
        </button>
        {!source && (
          <button
            type="button"
            className="content-copy"
            aria-label={copyLabel}
            onClick={() => void copy(value)}
          >
            {status === 'copied' ? 'Copied' : 'Copy'}
          </button>
        )}
      </fieldset>
      {!source && (
        <span className={status === 'error' ? 'code-copy-error' : 'sr-only'} role="status">
          {status === 'error'
            ? 'Copy unavailable. You can select and copy the text manually.'
            : status === 'copied'
              ? 'Copied to clipboard.'
              : ''}
        </span>
      )}
      {source ? (
        <CodePanel value={value} label={label} copyLabel={copyLabel} language="markdown" />
      ) : (
        <MarkdownContent text={value} />
      )}
    </section>
  );
}
