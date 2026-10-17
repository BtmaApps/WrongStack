'use client';

import { ArrowUpRight, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChatEntry } from '../lib/session';
import { Modal } from './dialogs';
import { SearchHighlight } from './search-highlight';

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
  const listId = useId();
  const [selected, setSelected] = useState(0);
  const matches = query.trim()
    ? messages.filter(
        (message) =>
          message.role !== 'thinking' &&
          message.text.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];
  const active = Math.min(selected, Math.max(0, matches.length - 1));
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId, query]);
  const choose = (index: number) => {
    const message = matches[index];
    if (!message) return;
    onClose();
    onJump(message.id);
  };
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
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches.length ? `${listId}-${active}` : undefined}
        placeholder="Find something in this conversation…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (matches.length)
              setSelected(
                (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length,
              );
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            choose(active);
          }
        }}
      />
      <div
        className="command-results conversation-results"
        id={listId}
        role="listbox"
        aria-label="Conversation results"
      >
        {matches.map((message, index) => (
          <button
            type="button"
            key={message.id}
            role="option"
            id={`${listId}-${index}`}
            aria-selected={index === active}
            data-author={message.role}
            onClick={() => choose(index)}
          >
            <strong>
              {message.role === 'user'
                ? 'You'
                : message.role === 'assistant'
                  ? 'WrongStack'
                  : 'Workspace'}
              <ArrowUpRight size={13} className="search-result-arrow" />
            </strong>
            <small>
              <SearchHighlight
                query={query}
                value={message.text.slice(
                  Math.max(0, message.text.toLowerCase().indexOf(query.trim().toLowerCase()) - 60),
                  Math.max(0, message.text.toLowerCase().indexOf(query.trim().toLowerCase()) - 60) +
                    220,
                )}
              />
            </small>
          </button>
        ))}
      </div>
      {!query.trim() && (
        <div className="search-empty">
          <Search size={22} />
          <p>Find a message, decision or workspace note.</p>
        </div>
      )}
      <div className="search-footer">
        <span role="status">
          {query.trim()
            ? `${matches.length} matching ${matches.length === 1 ? 'message' : 'messages'}`
            : 'Current conversation'}
        </span>
        <span>
          <kbd>↑↓</kbd> navigate <kbd>↵</kbd> jump
        </span>
      </div>
      {query.trim() && !matches.length && <p className="panel-hint">No matching messages.</p>}
    </Modal>
  );
}
