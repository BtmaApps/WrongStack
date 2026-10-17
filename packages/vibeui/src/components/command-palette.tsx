'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from './dialogs';

export interface WorkspaceCommand {
  id: string;
  title: string;
  detail: string;
  disabled?: boolean;
  run: () => void;
}
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: WorkspaceCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [listId, selected]);
  const matches = commands.filter((command) =>
    `${command.title} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  const choose = (index: number) => {
    const command = matches[index];
    if (!command || command.disabled) return;
    onClose();
    command.run();
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Quick actions"
      initialFocusRef={input}
      description="Find a workspace action or jump to a recent session. Ctrl/Cmd+P opens this menu."
    >
      <input
        ref={input}
        className="context-search"
        role="combobox"
        aria-label="Search actions"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={matches[selected] ? `${listId}-${selected}` : undefined}
        placeholder="Search commands, resources or sessions…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected((value) =>
              matches.length
                ? (value + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
                : 0,
            );
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            choose(selected);
          }
        }}
      />
      <div id={listId} role="listbox" aria-label="Workspace actions" className="command-results">
        {matches.map((command, index) => (
          <button
            type="button"
            role="option"
            aria-selected={selected === index}
            aria-disabled={command.disabled === true}
            id={`${listId}-${index}`}
            key={command.id}
            onClick={() => choose(index)}
          >
            <strong>{command.title}</strong>
            <small>
              {command.detail}
              {command.disabled ? ' · Unavailable right now' : ''}
            </small>
          </button>
        ))}
      </div>
      {!matches.length && <p className="panel-hint">No matching actions.</p>}
    </Modal>
  );
}
