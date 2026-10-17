'use client';

import { createContext, memo, type ReactNode, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { localArtifactPath, useArtifactNavigation } from './artifact-navigation';
import { MarkdownCodeBlock } from './code-panel';

const MarkdownBasePath = createContext('');

function ArtifactLink({ href, children }: { href?: string; children?: ReactNode }) {
  const openArtifact = useArtifactNavigation();
  const basePath = useContext(MarkdownBasePath);
  return (
    <a
      href={href}
      onClick={(event) => {
        if (
          !openArtifact ||
          !href ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const path = localArtifactPath(href, window.location.origin, basePath);
        if (path) {
          event.preventDefault();
          openArtifact(path);
        }
      }}
      target={href && /^https?:/i.test(href) ? '_blank' : undefined}
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide tables must be scrollable with the keyboard.
    <section className="markdown-table" tabIndex={0} aria-label="Scrollable table">
      <table>{children}</table>
    </section>
  );
}

// Stable renderer identities preserve reader controls, selection and focus across workspace updates.
const components = { pre: MarkdownCodeBlock, table: MarkdownTable, a: ArtifactLink };

/** Settled replies do not reparse Markdown for every delta of the current reply. */
export const MarkdownContent = memo(function MarkdownContent({
  text,
  basePath = '',
}: {
  text: string;
  basePath?: string;
}) {
  return (
    <MarkdownBasePath.Provider value={basePath}>
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </div>
    </MarkdownBasePath.Provider>
  );
});
