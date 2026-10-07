import { MAX_SUBAGENT_LANES, type SimplePrefs, type SubagentLane } from './lib/prefs-model.js';
import {
  DEFAULT_SUBAGENT_LANES,
  laneFromValue,
  laneValue,
  modelOptionValues,
  PassthroughOption,
} from './settings-panel-controls.js';

/** The "Subagent models" lane editor inside the SESSION settings group. */
export function SubagentModelLanes({
  plan,
  offline,
  hidden,
  modelOptions,
  onPrefChange,
}: {
  plan: SimplePrefs['subagentModelPlan'];
  offline: boolean;
  hidden: boolean;
  /** Provider/model pairs offered by the lane selects. */
  modelOptions?: Array<{ provider: string; model: string }> | undefined;
  onPrefChange: (patch: Partial<SimplePrefs>) => void;
}) {
  // Subagent model lanes. A plan the server has never stored arrives with no
  // lanes; show the default eight so the editor has rows to pin without a
  // separate "create" step. Every write sends the WHOLE plan because the pref
  // channel replaces the value rather than deep-merging it.
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

  return (
    <div
      className="settings-subagent-models"
      data-setting-id="session.subagentModels"
      style={hidden ? { display: 'none' } : undefined}
    >
      <div className="settings-toggle-copy">
        <strong>Subagent models</strong>
        <small>
          Each running subagent takes the first free lane, so parallel workers run on different
          models. "Use my model" runs them all on this session's model instead. This session only —
          restored by resume.
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
            <PassthroughOption value={laneValue(lane)} offered={modelOptionValues(modelOptions)} />
          </select>
        </div>
      ))}
    </div>
  );
}
