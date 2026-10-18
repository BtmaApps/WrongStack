'use client';

import { ChevronRight, Layers } from 'lucide-react';
import type { ChatEntry } from '../lib/session';
import { ContentView } from './content-view';
import { MarkdownContent } from './markdown-content';
import { usePresentation } from './presentation-mode';

export function WorkspaceNotes({ notes }: { notes: ChatEntry[] }) {
  const { mode } = usePresentation();
  const latest = notes.at(-1);
  const preview = latest?.text === 'Runtime context' ? 'Runtime context updated' : latest?.text;
  return (
    <details className="workspace-notes" key={mode} open={mode === 'extended'}>
      <summary>
        <ChevronRight size={13} className="workspace-notes-chevron" />
        <Layers size={13} />
        <span>Workspace</span>
        <small>
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </small>
        <span className="workspace-notes-preview">
          {preview?.replace(/\s+/g, ' ').slice(0, 140)}
        </span>
      </summary>
      <div className="workspace-notes-body">
        {notes.map((note) => (
          <article key={note.id} id={`chat-${note.id}`} tabIndex={-1}>
            {note.text === 'Runtime context' && note.runtimeContext?.length ? (
              <span className="workspace-note-label">Runtime context</span>
            ) : (
              <MarkdownContent text={note.text} />
            )}
            {note.runtimeContext?.map((text, index) => (
              <ContentView key={index} label="Runtime context" value={text} />
            ))}
          </article>
        ))}
      </div>
    </details>
  );
}
