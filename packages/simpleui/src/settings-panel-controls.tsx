import type { AutonomyMode, SubagentLane } from './lib/prefs-model.js';

/** Default lane count shown before the server has stored a plan. */
export const DEFAULT_SUBAGENT_LANES = 8;

/** `provider/model` for a pinned lane, or '' for an unpinned one. */
export function laneValue(lane: SubagentLane | undefined): string {
  if (lane?.provider && lane.model) return `${lane.provider}/${lane.model}`;
  if (lane?.tier) return `tier:${lane.tier}`;
  if (lane?.fallbackProfile) return `profile:${lane.fallbackProfile}`;
  return '';
}

export function laneFromValue(value: string): SubagentLane {
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
export type ModelOption = { provider: string; model: string };

/** Option values the provider/model selects already offer.
 *  `modelOptions` is an optional prop, so both the refiner and the lane
 *  selects must tolerate it being absent — a catalog that has not loaded
 *  offers nothing but the "inherit"/"Session model" entry. */
export function modelOptionValues(options: ModelOption[] | undefined): string[] {
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
export function PassthroughOption({
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

export const AUTONOMY_HINT: Record<AutonomyMode, string> = {
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
export function presetOptions(
  presets: readonly number[],
  current: number,
  floor: number,
): number[] {
  if (!Number.isInteger(current) || current < floor) return [...presets];
  return presets.includes(current) ? [...presets] : [...presets, current].sort((a, b) => a - b);
}

/** Presets for the pre-refine grace countdown (seconds). 0 = skip. A subset of
 *  the TUI's `PRE_REFINE_SECONDS_PRESETS = [0, 2, 3, 5, 8, 10]`, whose 2 and 8
 *  `presetOptions` covers by unioning in the stored value. */
export const PRE_REFINE_COUNTDOWN_PRESETS = [0, 3, 5, 10] as const;

/** Presets for the Telegram bot polling interval (seconds). 1–60, the range the
 *  server validator enforces. */
export const TG_POLL_INTERVAL_PRESETS = [1, 2, 5, 10, 30, 60] as const;

export interface ToggleRowProps {
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

export function ToggleRow({
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
export function GroupCount({ groupId, label }: { groupId: string; label: string | null }) {
  if (label === null) return null;
  return (
    <span className="settings-group-count" data-group-count={groupId} aria-live="polite">
      {label}
    </span>
  );
}
