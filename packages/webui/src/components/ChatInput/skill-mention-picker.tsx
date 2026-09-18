import {
  detectSkillMention,
  insertSkillMention,
  matchSkillMentions,
  type SkillMentionCandidate,
} from '@wrongstack/webui-protocol';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { WrongStackWebSocketClient } from '@/lib/ws-client';

export function useSkillMentionPicker(
  input: string,
  setInput: (text: string) => void,
  textarea: React.RefObject<HTMLTextAreaElement | null>,
  client: WrongStackWebSocketClient | null | undefined,
  sessionId: string | null | undefined,
) {
  const listId = useId();
  const pendingSelection = useRef<{ text: string; cursor: number } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [skills, setSkills] = useState<SkillMentionCandidate[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = `${sessionId}\0${input}\0${cursor}`;
  const mention = dismissed === key ? null : detectSkillMention(input, cursor);
  const open = mention !== null;
  const connected = client?.isConnected === true;
  useEffect(() => {
    if (!open || !client || !connected) return;
    const requestId = `skill-mention-${crypto.randomUUID()}`;
    setLoading(true);
    setError('');
    setSkills([]);
    const timer = setTimeout(() => {
      setLoading(false);
      setError('Unable to load skills');
    }, 5000);
    const off = client.on('skills.list', (message) => {
      const payload = (
        message as {
          payload: { requestId?: string; skills?: SkillMentionCandidate[]; error?: string };
        }
      ).payload;
      if (payload.requestId !== requestId) return;
      clearTimeout(timer);
      setSkills(payload.skills ?? []);
      setError(payload.error ?? '');
      setLoading(false);
    });
    client.send({ type: 'skills.list' }, { echoToChat: false, requestId });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [open, client, sessionId, connected]);
  useEffect(() => {
    setSelected(0);
  }, [mention?.query]);
  const matches = matchSkillMentions(skills, mention?.query ?? '').slice(0, 12);
  useEffect(() => {
    if (open)
      document.getElementById(`${listId}-${selected}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, listId, selected, matches.length]);
  const pick = (name: string) => {
    if (!mention) return;
    const next = insertSkillMention(input, mention, name);
    pendingSelection.current = next;
    setInput(next.text);
    setCursor(next.cursor);
  };
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    const element = textarea.current;
    if (pending && element?.value === pending.text) {
      element.focus();
      element.setSelectionRange(pending.cursor, pending.cursor);
    }
  }, [input, cursor, textarea]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!mention || event.nativeEvent.isComposing) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(key);
      return true;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) =>
        matches.length
          ? (index + (event.key === 'ArrowUp' ? -1 : 1) + matches.length) % matches.length
          : 0,
      );
      return true;
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      const candidate = matches[selected];
      if (candidate) pick(candidate.name);
      return true;
    }
    return false;
  };
  const popup = !mention ? null : (
    <div
      className="absolute bottom-full z-50 mb-2 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
      style={{ maxHeight: 'min(18rem, 45vh)' }}
      id={listId}
      role="listbox"
      aria-label="Skills"
    >
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Skills · ↑↓ select · Enter/Tab insert · Esc dismiss
      </div>
      {loading || error || matches.length === 0 ? (
        <div className="px-3 py-2 text-sm">
          {loading ? 'Loading skills…' : error || 'No matching skills'}
        </div>
      ) : (
        matches.map((skill, index) => (
          <button
            key={skill.name}
            type="button"
            role="option"
            id={`${listId}-${index}`}
            aria-selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(skill.name)}
            className={`block w-full rounded px-3 py-2 text-left ${index === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
          >
            <div className="text-sm font-medium">${skill.name}</div>
            <div className="truncate text-xs text-muted-foreground">{skill.description}</div>
          </button>
        ))
      )}
    </div>
  );
  return {
    open,
    popup,
    onKeyDown,
    setCursor,
    listId,
    activeId: matches.length ? `${listId}-${selected}` : undefined,
  };
}
