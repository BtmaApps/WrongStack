import { useEffect, useState } from 'react';
import type { SimplePrefs } from './lib/prefs-model.js';
import { GroupCount, presetOptions, TG_POLL_INTERVAL_PRESETS } from './settings-panel-controls.js';

/** The TELEGRAM group of the settings panel. Owns the chat-ID draft. */
export function SettingsTelegramSection({
  prefs,
  offline,
  onPrefChange,
  groupHidden,
  rowHidden,
  groupCountLabel,
}: {
  prefs: SimplePrefs;
  offline: boolean;
  onPrefChange: (patch: Partial<SimplePrefs>) => void;
  groupHidden: (id: string) => boolean;
  rowHidden: (id: string) => boolean;
  groupCountLabel: (id: string) => string | null;
}) {
  // Telegram chat ID is free text, so it holds a draft and commits on blur /
  // Enter. Sending on every keystroke would put "-" or "12abc" on the wire,
  // and `validatePreferenceValue` rejects the WHOLE prefs.update payload on
  // one bad key — leaving the optimistic local value on screen while config
  // never changed.
  const [tgChatDraft, setTgChatDraft] = useState(prefs.tgChatId);
  const [tgChatInvalid, setTgChatInvalid] = useState(false);
  useEffect(() => {
    // Re-seed only from a non-empty server value, so a write the server
    // refused (e.g. a group chat without allowGroupChats) does not wipe what
    // the user typed.
    if (prefs.tgChatId !== '') setTgChatDraft(prefs.tgChatId);
  }, [prefs.tgChatId]);
  // Mirrors validateTelegramChatId in webui-server ws-payload-preferences.ts:
  // empty clears, otherwise a non-zero safe integer.
  const commitTgChat = () => {
    const trimmed = tgChatDraft.trim();
    if (trimmed !== '' && !/^-?\d+$/.test(trimmed)) {
      setTgChatInvalid(true);
      return;
    }
    const chatId = Number(trimmed);
    if (trimmed !== '' && (!Number.isSafeInteger(chatId) || chatId === 0)) {
      setTgChatInvalid(true);
      return;
    }
    setTgChatInvalid(false);
    if (trimmed !== prefs.tgChatId) onPrefChange({ tgChatId: trimmed });
  };

  return (
    <section
      className="settings-group"
      aria-label="Telegram"
      data-group-id="telegram"
      style={groupHidden('telegram') ? { display: 'none' } : undefined}
    >
      <h2>
        TELEGRAM
        <GroupCount groupId="telegram" label={groupCountLabel('telegram')} />
      </h2>
      <label
        className="settings-field"
        data-setting-id="telegram.pollInterval"
        style={rowHidden('telegram.pollInterval') ? { display: 'none' } : undefined}
      >
        <span>Polling interval</span>
        {/* A select can only ever emit a valid value, so the 1–60 bound
            the server enforces needs no client-side guard here — unlike
            a free number input, which would have to reject and revert. */}
        <select
          value={String(prefs.tgPollIntervalSec)}
          disabled={offline}
          onChange={(event) => onPrefChange({ tgPollIntervalSec: Number(event.target.value) })}
        >
          {presetOptions(TG_POLL_INTERVAL_PRESETS, prefs.tgPollIntervalSec, 1).map((seconds) => (
            <option key={seconds} value={String(seconds)}>
              {seconds === 1 ? '1 second' : `${seconds} seconds`}
            </option>
          ))}
        </select>
        <small className="settings-hint">
          How often the bot checks Telegram for new messages. Lower is more responsive but makes
          more API calls.
        </small>
      </label>
      <label
        className="settings-field"
        data-setting-id="telegram.chatId"
        style={rowHidden('telegram.chatId') ? { display: 'none' } : undefined}
      >
        <span>Notification chat</span>
        <input
          type="text"
          inputMode="numeric"
          value={tgChatDraft}
          disabled={offline}
          aria-invalid={tgChatInvalid}
          onChange={(event) => {
            setTgChatDraft(event.target.value);
            if (tgChatInvalid) setTgChatInvalid(false);
          }}
          onBlur={commitTgChat}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <small className="settings-hint">
          {tgChatInvalid
            ? 'Enter a non-zero integer chat ID, or leave empty.'
            : 'Default chat for notifications. A positive ID pairs your private chat with the bot; group IDs are refused unless allowGroupChats is set in the config. Leave empty to clear.'}
        </small>
      </label>
    </section>
  );
}
