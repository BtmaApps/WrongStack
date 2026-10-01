import { Search, Settings, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { PALETTES, type PaletteId } from './lib/palettes.js';
import {
  AUTONOMY_MODES,
  type AutonomyMode,
  MAX_SUBAGENT_LANES,
  type SimplePrefs,
  type SubagentLane,
} from './lib/prefs-model.js';
import { groupCatalog, matchesQuery } from './lib/settings-catalog.js';
import type { AgentMode } from './types.js';

interface SettingsPanelProps {
  open: boolean;
  prefs: SimplePrefs;
  modes: AgentMode[];
  activeModeId: string;
  palette: PaletteId;
  connection: string;
  onClose: () => void;
  onAutonomyChange: (mode: AutonomyMode) => void;
  onModeChange: (id: string) => void;
  onPaletteChange: (palette: PaletteId) => void;
  onPrefChange: (patch: Partial<SimplePrefs>) => void;
  /** Reset every pref to DEFAULT_PREFS — wired up to useSettings().resetPrefs. */
  onReset: () => void;
  /** True when the current prefs already match DEFAULT_PREFS. */
  isAtDefaults: boolean;
  subagentPolicyLocked: boolean;
  /** Provider/model pairs offered by the subagent lane selects. */
  modelOptions?: Array<{ provider: string; model: string }> | undefined;
}

/** Default lane count shown before the server has stored a plan. */
const DEFAULT_SUBAGENT_LANES = 8;

/** `provider/model` for a pinned lane, or '' for an unpinned one. */
function laneValue(lane: SubagentLane | undefined): string {
  if (lane?.provider && lane.model) return `${lane.provider}/${lane.model}`;
  if (lane?.tier) return `tier:${lane.tier}`;
  if (lane?.fallbackProfile) return `profile:${lane.fallbackProfile}`;
  return '';
}

function laneFromValue(value: string): SubagentLane {
  if (!value) return {};
  // The tier/profile prefixes round-trip: the passthrough <option> re-offers a
  // lane pinned from another surface, and parsing it as a bare model id would
  // corrupt it into `{ model: 'tier:budget' }`.
  if (value.startsWith('tier:')) return { tier: value.slice(5) };
  if (value.startsWith('profile:')) return { fallbackProfile: value.slice(8) };
  const i = value.indexOf('/');
  if (i <= 0) return { model: value };
  return { provider: value.slice(0, i), model: value.slice(i + 1) };
}

/** A provider/model pair the panel can offer. */
type ModelOption = { provider: string; model: string };

/** Option values the provider/model selects already offer.
 *  `modelOptions` is an optional prop, so both the refiner and the lane
 *  selects must tolerate it being absent — a catalog that has not loaded
 *  offers nothing but the "inherit"/"Session model" entry. */
function modelOptionValues(options: ModelOption[] | undefined): string[] {
  return (options ?? []).map((option) => `${option.provider}/${option.model}`);
}

/**
 * A passthrough `<option>` for a value this select is bound to but does not
 * offer — the string-valued form of {@link presetOptions}'s rule, which
 * cannot serve these because it is numeric.
 *
 * Catalog-driven selects (agent modes, provider/model pairs) bind to a value
 * that can legitimately fall outside the offered list: `modelOptions` is
 * optional, the agent-mode catalog can drop a mode that is still active, and a
 * lane or refiner can be pinned from another surface (TUI, WebUI). With no
 * matching `<option>`, the DOM reports the FIRST one, so the control
 * silently displays — and on re-pick, silently writes — a different value
 * than the one stored.
 *
 * Renders nothing when `value` is empty (the control is unpinned) or already
 * offered, so callers can drop it in unconditionally.
 */
function PassthroughOption({
  value,
  offered,
  label,
}: {
  value: string;
  offered: readonly string[];
  label?: string;
}) {
  if (!value || offered.includes(value)) return null;
  return <option value={value}>{label ?? value}</option>;
}

const AUTONOMY_HINT: Record<AutonomyMode, string> = {
  off: 'You drive every turn.',
  suggest: 'Agent proposes the next step; you confirm.',
  auto: 'Agent proceeds on its own between turns.',
};

/** Options for a preset `<select>`, always including the stored value.
 *
 *  A `<select value={X}>` whose `<option>` list omits X does not render blank:
 *  the DOM reports the FIRST option as the value. So a preset-only select
 *  bound to a preference another surface can set to a non-preset silently
 *  displays — and on re-pick, silently writes — a different value than the one
 *  stored. For `refine.preRefineSeconds` that misreport is the worst possible
 *  one, because 0 renders as "Off — send immediately": an 8-second countdown
 *  written by the TUI's own presets would display as disabled.
 *
 *  `floor` is the control's own lower bound and differs per setting — the poll
 *  interval rejects 0 while the countdown treats it as "Off" — so the caller
 *  supplies it. A hand-edited config can hold a fractional or negative value;
 *  those are outside every setting's accepted range (the server's
 *  NUMBER_PREF_BOUNDS and `parsePrefs` both refuse them), so they must never
 *  be offered back as a selectable option.
 */
function presetOptions(presets: readonly number[], current: number, floor: number): number[] {
  if (!Number.isInteger(current) || current < floor) return [...presets];
  return presets.includes(current) ? [...presets] : [...presets, current].sort((a, b) => a - b);
}

/** Presets for the pre-refine grace countdown (seconds). 0 = skip. A subset of
 *  the TUI's `PRE_REFINE_SECONDS_PRESETS = [0, 2, 3, 5, 8, 10]`, whose 2 and 8
 *  `presetOptions` covers by unioning in the stored value. */
const PRE_REFINE_COUNTDOWN_PRESETS = [0, 3, 5, 10] as const;

/** Presets for the Telegram bot polling interval (seconds). 1–60, the range the
 *  server validator enforces. */
const TG_POLL_INTERVAL_PRESETS = [1, 2, 5, 10, 30, 60] as const;

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Stable catalog id, used by the search/filter to hide this row. */
  settingId?: string;
  /** Force-hide the row (used by the search/filter). */
  hidden?: boolean | undefined;
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
  settingId,
  hidden,
}: ToggleRowProps) {
  return (
    <label
      className={`settings-toggle${disabled ? ' disabled' : ''}`}
      data-setting-id={settingId}
      style={hidden ? { display: 'none' } : undefined}
    >
      <span className="settings-toggle-copy">
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="settings-switch" aria-hidden="true" />
    </label>
  );
}

/**
 * Inline "X of Y" badge that sits inside a group heading while a filter is
 * active. Renders nothing when `label` is null so the heading stays clean
 * in the unfiltered state. Visually muted and accessible: the badge is
 * marked `aria-live="polite"` on its container so screen readers hear
 * counts change as the user types.
 */
function GroupCount({ groupId, label }: { groupId: string; label: string | null }) {
  if (label === null) return null;
  return (
    <span className="settings-group-count" data-group-count={groupId} aria-live="polite">
      {label}
    </span>
  );
}

export function SettingsPanel({
  open,
  prefs,
  modes,
  activeModeId,
  palette,
  connection,
  onClose,
  onAutonomyChange,
  onModeChange,
  onPaletteChange,
  onPrefChange,
  onReset,
  isAtDefaults,
  subagentPolicyLocked,
  modelOptions,
}: SettingsPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  useFocusTrap(panelRef, true);
  // Inline confirmation state for the Reset-to-defaults button. Two-step
  // confirm (button → confirm row) avoids accidentally wiping every pref
  // when the user clicks while reaching for another control.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetConfirmRef = useRef<HTMLDivElement | null>(null);
  const resetCancelRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Two-tier query state: `query` is what the user typed (instant feedback,
  // re-renders on every keystroke), `debouncedQuery` is what the filter
  // actually runs against (settles 150 ms after typing stops). Keeping the
  // raw string on the controlled input avoids losing keystrokes while the
  // debounce timer is in flight, and keeps the visible input value in sync
  // with the clear button.
  // Subagent model lanes. A plan the server has never stored arrives with no
  // lanes; show the default eight so the editor has rows to pin without a
  // separate "create" step. Every write sends the WHOLE plan because the pref
  // channel replaces the value rather than deep-merging it.
  const plan = prefs.subagentModelPlan;
  const lanes: SubagentLane[] =
    plan.slots.length > 0 ? plan.slots : Array.from({ length: DEFAULT_SUBAGENT_LANES }, () => ({}));
  const patchPlan = (next: Partial<SimplePrefs['subagentModelPlan']>) =>
    onPrefChange({ subagentModelPlan: { ...plan, slots: lanes, ...next } });
  const setLane = (index: number, lane: SubagentLane) =>
    patchPlan({ slots: lanes.map((existing, i) => (i === index ? lane : existing)) });
  const setLaneCount = (count: number) => {
    const next = Math.max(1, Math.min(MAX_SUBAGENT_LANES, count));
    patchPlan({
      slots:
        next <= lanes.length
          ? lanes.slice(0, next)
          : [...lanes, ...Array.from({ length: next - lanes.length }, (): SubagentLane => ({}))],
    });
  };

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

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
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Compute visibility per entry id, per group id, and a per-group
  // "X of Y" count for the heading badge. Catalog is stable; recomputing
  // once per debounced-query change is cheap.
  const { visibleEntries, visibleGroups, groupCounts } = useMemo(() => {
    const entries = new Set<string>();
    const groups = new Set<string>();
    const counts: Record<string, { visible: number; total: number }> = {};
    for (const { group, entries: groupEntries } of groupCatalog()) {
      const count = { visible: 0, total: groupEntries.length };
      counts[group.id] = count;
      for (const entry of groupEntries) {
        if (matchesQuery(entry, group.title, debouncedQuery)) {
          entries.add(entry.id);
          groups.add(group.id);
          count.visible += 1;
        }
      }
    }
    return { visibleEntries: entries, visibleGroups: groups, groupCounts: counts };
  }, [debouncedQuery]);
  const isFiltering = debouncedQuery.trim().length > 0;
  const hasResults = visibleEntries.size > 0;
  // Helper: hide a row only when actively filtering and the entry is not
  // visible. Outside of a query, every row stays in normal flow.
  const rowHidden = (id: string): boolean => isFiltering && !visibleEntries.has(id);
  const groupHidden = (id: string): boolean => isFiltering && !visibleGroups.has(id);
  // "X of Y" count text for a group heading. Empty when not filtering.
  const groupCountLabel = (id: string): string | null => {
    if (!isFiltering) return null;
    const count = groupCounts[id];
    if (!count) return null;
    return `${count.visible} of ${count.total}`;
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // When the panel closes (route change, Escape, overlay click), drop the
  // open/closed state of the inline reset confirm so re-opening the panel
  // shows the default "Reset to defaults" button — not a half-rendered
  // confirm row from a previous open.
  useEffect(() => {
    if (!open) setResetConfirmOpen(false);
  }, [open]);

  // When the reset confirm row opens, move focus onto the Cancel button so a
  // sighted keyboard user can dismiss it with one Enter. Returning focus to
  // the Reset button on close keeps the keyboard path predictable.
  useEffect(() => {
    if (resetConfirmOpen) {
      resetCancelRef.current?.focus();
    } else {
      resetButtonRef.current?.focus();
    }
  }, [resetConfirmOpen]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;
  const offline = connection !== 'open';

  return (
    <>
      <button
        type="button"
        className="settings-overlay"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        className="settings-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
      >
        <header className="settings-head">
          <span>
            <Settings size={13} aria-hidden="true" /> SETTINGS
          </span>
          <div className="settings-head-actions">
            <button
              type="button"
              className="settings-reset"
              onClick={() => setResetConfirmOpen((open) => !open)}
              aria-expanded={resetConfirmOpen}
              aria-controls="settings-reset-confirm"
              disabled={isAtDefaults || offline}
              aria-disabled={isAtDefaults || offline}
              ref={resetButtonRef}
            >
              {isAtDefaults ? 'Defaults applied' : 'Reset to defaults'}
            </button>
            <button type="button" onClick={onClose} aria-label="Close settings" ref={closeRef}>
              <X size={14} />
            </button>
          </div>
        </header>
        {resetConfirmOpen && !isAtDefaults ? (
          <div
            id="settings-reset-confirm"
            className="settings-reset-confirm"
            role="alertdialog"
            aria-live="polite"
            aria-label="Reset to defaults confirmation"
            ref={resetConfirmRef}
          >
            <p>
              Reset every setting to its default? This will affect autonomy, yolo, refine, model
              reasoning, chime, and confirm-exit.
            </p>
            <div className="settings-reset-actions">
              <button
                type="button"
                className="settings-reset-cancel"
                ref={resetCancelRef}
                onClick={() => {
                  setResetConfirmOpen(false);
                  resetButtonRef.current?.focus();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-reset-confirm-btn"
                onClick={() => {
                  onReset();
                  setResetConfirmOpen(false);
                  resetButtonRef.current?.focus();
                }}
                disabled={offline}
                aria-disabled={offline}
              >
                Reset everything
              </button>
            </div>
          </div>
        ) : null}

        <div className="settings-search">
          <Search size={14} aria-hidden="true" className="settings-search-icon" />
          <input
            type="search"
            className="settings-search-input"
            placeholder="Filter settings"
            aria-label="Filter settings"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {isFiltering ? (
            <button
              type="button"
              className="clear"
              aria-label="Clear filter"
              onClick={() => setQuery('')}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="settings-body">
          {offline && <p className="settings-offline">Disconnected — settings are read-only.</p>}

          <section
            className="settings-group"
            aria-label="Autonomy"
            data-group-id="autonomy"
            style={groupHidden('autonomy') ? { display: 'none' } : undefined}
          >
            <h2>
              AUTONOMY
              <GroupCount groupId="autonomy" label={groupCountLabel('autonomy')} />
            </h2>
            <div
              className="settings-segmented"
              role="radiogroup"
              aria-label="Autonomy mode"
              data-setting-id="autonomy.mode"
              style={rowHidden('autonomy.mode') ? { display: 'none' } : undefined}
            >
              {AUTONOMY_MODES.map((mode) => (
                <label
                  className={`settings-segment${prefs.autonomy === mode ? ' active' : ''}`}
                  key={mode}
                >
                  <input
                    type="radio"
                    name="autonomy"
                    value={mode}
                    checked={prefs.autonomy === mode}
                    disabled={offline}
                    onChange={() => onAutonomyChange(mode)}
                  />
                  <span>{mode}</span>
                </label>
              ))}
            </div>
            <small className="settings-hint">{AUTONOMY_HINT[prefs.autonomy]}</small>
            <ToggleRow
              label="YOLO"
              hint="Auto-approve tool permissions, including pending ones."
              checked={prefs.yolo}
              disabled={offline}
              onChange={(yolo) => onPrefChange({ yolo })}
              settingId="autonomy.yolo"
              hidden={rowHidden('autonomy.yolo')}
            />
          </section>

          <section
            className="settings-group"
            aria-label="Refine"
            data-group-id="refine"
            style={groupHidden('refine') ? { display: 'none' } : undefined}
          >
            <h2>
              REFINE
              <GroupCount groupId="refine" label={groupCountLabel('refine')} />
            </h2>
            <ToggleRow
              label="Refine prompts"
              hint="Rewrite each message before sending, with a review step."
              checked={prefs.enhanceEnabled}
              disabled={offline}
              onChange={(enhanceEnabled) => onPrefChange({ enhanceEnabled })}
              settingId="refine.enhanceEnabled"
              hidden={rowHidden('refine.enhanceEnabled')}
            />
            <label
              className="settings-field"
              data-setting-id="refine.preRefineSeconds"
              style={rowHidden('refine.preRefineSeconds') ? { display: 'none' } : undefined}
            >
              <span>Pre-refine countdown</span>
              <select
                value={String(prefs.preRefineSeconds)}
                disabled={offline}
                onChange={(event) => onPrefChange({ preRefineSeconds: Number(event.target.value) })}
              >
                {presetOptions(PRE_REFINE_COUNTDOWN_PRESETS, prefs.preRefineSeconds, 0).map(
                  (seconds) => (
                    <option key={seconds} value={String(seconds)}>
                      {seconds === 0 ? 'Off — send immediately' : `${seconds} seconds`}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label
              className="settings-field"
              data-setting-id="refine.refinerModel"
              style={rowHidden('refine.refinerModel') ? { display: 'none' } : undefined}
            >
              <span>Refiner model</span>
              <select
                value={
                  prefs.refinerProvider && prefs.refinerModel
                    ? `${prefs.refinerProvider}/${prefs.refinerModel}`
                    : ''
                }
                disabled={offline}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith('profile:')) {
                    // A refiner profile pinned on another surface — re-selecting
                    // the passthrough just clears the concrete model fields.
                    onPrefChange({ refinerProvider: '', refinerModel: '' });
                    return;
                  }
                  const lane = laneFromValue(value);
                  onPrefChange({
                    refinerProvider: lane.provider ?? '',
                    refinerModel: lane.model ?? '',
                  });
                }}
              >
                <option value="">Session model</option>
                {(modelOptions ?? []).map((option) => (
                  <option
                    key={`${option.provider}/${option.model}`}
                    value={`${option.provider}/${option.model}`}
                  >
                    {option.provider}/{option.model}
                  </option>
                ))}
                {prefs.refinerFallbackProfile && !prefs.refinerProvider ? (
                  <option value={`profile:${prefs.refinerFallbackProfile}`}>
                    profile:{prefs.refinerFallbackProfile}
                  </option>
                ) : null}
                {/* The pinned pair may predate this catalog (pinned on the TUI
                    or WebUI, or while `modelOptions` is still loading). Without
                    this the select reports "Session model", i.e. falsely
                    claiming no refiner is pinned. */}
                <PassthroughOption
                  value={
                    prefs.refinerProvider && prefs.refinerModel
                      ? `${prefs.refinerProvider}/${prefs.refinerModel}`
                      : ''
                  }
                  offered={modelOptionValues(modelOptions)}
                />
              </select>
            </label>
            <small className="settings-hint">
              Refine adds a review step before sending. Language follows the saved server
              preference.
            </small>
          </section>

          <section
            className="settings-group"
            aria-label="Mode"
            data-group-id="mode"
            style={groupHidden('mode') ? { display: 'none' } : undefined}
          >
            <h2>
              MODE
              <GroupCount groupId="mode" label={groupCountLabel('mode')} />
            </h2>
            <label
              className="settings-field"
              data-setting-id="mode.agentMode"
              style={rowHidden('mode.agentMode') ? { display: 'none' } : undefined}
            >
              <span>Agent mode</span>
              <select
                value={activeModeId}
                disabled={offline || modes.length === 0}
                onChange={(event) => onModeChange(event.target.value)}
              >
                {modes.length === 0 ? (
                  <option value={activeModeId}>{activeModeId}</option>
                ) : (
                  <>
                    {modes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                    {/* The catalog can drop a mode that is still active. Without
                        this the select reports the first listed mode instead. */}
                    <PassthroughOption value={activeModeId} offered={modes.map((m) => m.id)} />
                  </>
                )}
              </select>
            </label>
            <small className="settings-hint">
              {modes.find((mode) => mode.id === activeModeId)?.description ?? 'Default behaviour.'}
            </small>
          </section>

          <section
            className="settings-group"
            aria-label="Color Palette"
            data-group-id="palette"
            style={groupHidden('palette') ? { display: 'none' } : undefined}
          >
            <h2>
              COLOR PALETTE
              <GroupCount groupId="palette" label={groupCountLabel('palette')} />
            </h2>
            <div
              className="settings-palettes"
              data-setting-id="palette.color"
              style={rowHidden('palette.color') ? { display: 'none' } : undefined}
            >
              {PALETTES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`settings-palette${palette === option.id ? ' active' : ''}`}
                  aria-pressed={palette === option.id}
                  onClick={() => onPaletteChange(option.id)}
                >
                  <span
                    className="settings-palette-swatch"
                    aria-hidden="true"
                    style={{
                      background: `linear-gradient(90deg, ${option.swatch} 0 50%, ${option.swatchSecondary} 50% 100%)`,
                    }}
                  />
                  {option.label}
                </button>
              ))}
            </div>
            <small className="settings-hint">Pick the main color accent for the interface.</small>
          </section>

          <section
            className="settings-group"
            aria-label="Session"
            data-group-id="session"
            style={groupHidden('session') ? { display: 'none' } : undefined}
          >
            <h2>
              SESSION
              <GroupCount groupId="session" label={groupCountLabel('session')} />
            </h2>
            <ToggleRow
              label="Solo session"
              hint={
                subagentPolicyLocked || prefs.subagentsPolicyLocked
                  ? 'Locked for this session. Start a new session to change it.'
                  : 'Block Chimera, delegation, and every background subagent.'
              }
              checked={!prefs.subagentsAllowed}
              disabled={offline || subagentPolicyLocked || prefs.subagentsPolicyLocked}
              onChange={(solo) => onPrefChange({ subagentsAllowed: !solo })}
              settingId="session.solo"
              hidden={rowHidden('session.solo')}
            />
            <div
              className="settings-subagent-models"
              data-setting-id="session.subagentModels"
              style={rowHidden('session.subagentModels') ? { display: 'none' } : undefined}
            >
              <div className="settings-toggle-copy">
                <strong>Subagent models</strong>
                <small>
                  Each running subagent takes the first free lane, so parallel workers run on
                  different models. "Use my model" runs them all on this session's model instead.
                  This session only — restored by resume.
                </small>
              </div>
              <div className="settings-subagent-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={plan.followSessionModel}
                    disabled={offline}
                    onChange={(event) => patchPlan({ followSessionModel: event.target.checked })}
                  />
                  Use my model
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={plan.enabled}
                    disabled={offline}
                    onChange={(event) => patchPlan({ enabled: event.target.checked })}
                  />
                  Enabled
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={plan.lock}
                    disabled={offline}
                    onChange={(event) => patchPlan({ lock: event.target.checked })}
                  />
                  Override the leader
                </label>
                <label>
                  Lanes
                  <input
                    type="number"
                    min={1}
                    max={MAX_SUBAGENT_LANES}
                    value={lanes.length}
                    disabled={offline || plan.followSessionModel}
                    onChange={(event) => setLaneCount(Number.parseInt(event.target.value, 10) || 1)}
                  />
                </label>
              </div>
              {lanes.map((lane, index) => (
                <div
                  // Lane identity IS its position, so the index is the stable key.
                  key={`lane-${index}`}
                  className="settings-subagent-lane"
                >
                  <span>#{index + 1}</span>
                  <select
                    aria-label={`Lane ${index + 1} model`}
                    value={laneValue(lane)}
                    disabled={offline || plan.followSessionModel}
                    onChange={(event) => setLane(index, laneFromValue(event.target.value))}
                  >
                    <option value="">inherit — routing / session model</option>
                    {(modelOptions ?? []).map((option) => (
                      <option
                        key={`${option.provider}/${option.model}`}
                        value={`${option.provider}/${option.model}`}
                      >
                        {option.provider}/{option.model}
                      </option>
                    ))}
                    {/* A lane pinned elsewhere (TUI, WebUI) — to a tier, a profile, or a
                        concrete pair this catalog does not contain — keeps its
                        value visible instead of silently reading as "inherit". */}
                    <PassthroughOption
                      value={laneValue(lane)}
                      offered={modelOptionValues(modelOptions)}
                    />
                  </select>
                </div>
              ))}
            </div>
            <ToggleRow
              label="Tool Coach"
              hint="Suggest enabled tools during tasks and guide recovery after tool errors. On by default."
              checked={prefs.featureToolCoach}
              disabled={offline}
              onChange={(featureToolCoach) => onPrefChange({ featureToolCoach })}
              settingId="session.toolCoach"
              hidden={rowHidden('session.toolCoach')}
            />
            <ToggleRow
              label="Model reasoning"
              hint="Show the model's thinking and reasoning in the chat."
              checked={prefs.showModelReasoning}
              disabled={offline}
              onChange={(showModelReasoning) => onPrefChange({ showModelReasoning })}
              settingId="session.showModelReasoning"
              hidden={rowHidden('session.showModelReasoning')}
            />
            <ToggleRow
              label="Message timestamps"
              hint="Show the local time next to each chat message."
              checked={prefs.showTimestamps}
              disabled={offline}
              onChange={(showTimestamps) => onPrefChange({ showTimestamps })}
              settingId="session.showTimestamps"
              hidden={rowHidden('session.showTimestamps')}
            />
            <ToggleRow
              label="Tab title activity"
              hint="Reflect runs and unread mailbox mail in the browser tab title."
              checked={prefs.showTabTitle}
              disabled={offline}
              onChange={(showTabTitle) => onPrefChange({ showTabTitle })}
              settingId="session.showTabTitle"
              hidden={rowHidden('session.showTabTitle')}
            />
            <ToggleRow
              label="Chime"
              hint="Play a sound when a run finishes."
              checked={prefs.chime}
              disabled={offline}
              onChange={(chime) => onPrefChange({ chime })}
              settingId="session.chime"
              hidden={rowHidden('session.chime')}
            />
            <ToggleRow
              label="Confirm exit"
              hint="Ask before quitting with a run in flight."
              checked={prefs.confirmExit}
              disabled={offline}
              onChange={(confirmExit) => onPrefChange({ confirmExit })}
              settingId="session.confirmExit"
              hidden={rowHidden('session.confirmExit')}
            />
          </section>

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
                onChange={(event) =>
                  onPrefChange({ tgPollIntervalSec: Number(event.target.value) })
                }
              >
                {presetOptions(TG_POLL_INTERVAL_PRESETS, prefs.tgPollIntervalSec, 1).map(
                  (seconds) => (
                    <option key={seconds} value={String(seconds)}>
                      {seconds === 1 ? '1 second' : `${seconds} seconds`}
                    </option>
                  ),
                )}
              </select>
              <small className="settings-hint">
                How often the bot checks Telegram for new messages. Lower is more responsive but
                makes more API calls.
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

          {isFiltering && !hasResults && (
            <p className="settings-empty" role="status" aria-live="polite">
              No settings match “{query.trim()}”.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
