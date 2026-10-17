'use client';

import { useRef, useState } from 'react';
import type { ChatEntry } from '../lib/session';
import { Modal } from './dialogs';

export function ConversationSearch({
  messages,
  onClose,
  onJump,
}: {
  messages: ChatEntry[];
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const matches = query.trim()
    ? messages.filter(
        (message) =>
          message.role !== 'thinking' &&
          message.text.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Search conversation"
      initialFocusRef={input}
      description="Search the messages currently loaded in this session."
    >
      <input
        ref={input}
        className="context-search"
        aria-label="Search conversation text"
        placeholder="Find something in this conversation…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="command-results">
        {matches.map((message) => (
          <button
            type="button"
            key={message.id}
            onClick={() => {
              onClose();
              onJump(message.id);
            }}
          >
            <strong>
              {message.role === 'user'
                ? 'You'
                : message.role === 'assistant'
                  ? 'WrongStack'
                  : 'Workspace'}
            </strong>
            <small>
              {message.text.slice(
                Math.max(0, message.text.toLowerCase().indexOf(query.trim().toLowerCase()) - 60),
                Math.max(0, message.text.toLowerCase().indexOf(query.trim().toLowerCase()) - 60) +
                  220,
              )}
            </small>
          </button>
        ))}
      </div>
      {query.trim() && !matches.length && <p className="panel-hint">No matching messages.</p>}
    </Modal>
  );
}
