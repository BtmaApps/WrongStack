import { LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  confirmationKinds,
  confirmationMap,
  type ExecutionMode,
  executionMode,
  executionModeValues,
  lockedConfirmationKinds,
} from './execution-policy-model';
import './execution-policy.css';

export function ExecutionPolicySettings({
  draft,
  change,
}: {
  draft: Record<string, unknown>;
  change: (key: string, value: unknown) => void;
}) {
  const mode = executionMode(draft),
    map = confirmationMap(draft['yoloConfirm']);
  return (
    <section className="execution-policy" aria-label="Tool confirmation policy">
      <article className="execution-mode-card">
        <header>
          <ShieldCheck size={21} />
          <div>
            <span className="eyebrow">TOOL PERMISSIONS</span>
            <h3>Tool confirmation mode</h3>
          </div>
        </header>
        <p>
          Choose the profile default for new runtimes. Existing conversations retain their own
          permission options.
        </p>
        <label>
          Confirmation mode
          <select
            aria-label="Tool confirmation mode"
            value={mode}
            onChange={(event) => {
              const next = executionModeValues(event.target.value as ExecutionMode);
              change('yolo', next.yolo);
              change('yoloPlus', next.yoloPlus);
            }}
          >
            <option value="standard">Standard approvals</option>
            <option value="yolo">YOLO · selected destructive prompts</option>
            <option value="yolo-plus">YOLO+ · bypass per-kind prompts</option>
          </select>
        </label>
        <p role="status" className="execution-mode-note">
          {mode === 'standard'
            ? 'Standard mode follows configured permission rules and approval prompts.'
            : mode === 'yolo'
              ? 'YOLO skips routine prompts and asks about the selected categories below.'
              : 'YOLO+ bypasses these per-kind prompts, including the protected categories. Explicit deny rules still refuse.'}
        </p>
      </article>
      <article className="execution-confirm-card">
        <h3>Destructive-operation confirmations</h3>
        <p>
          {mode === 'yolo'
            ? 'Checked categories require confirmation under YOLO.'
            : 'Saved YOLO preferences are shown below. Choose YOLO mode to edit them.'}
        </p>
        <div className="execution-kind-list">
          {confirmationKinds.map(({ kind, label, description }) => (
            <label key={kind} className="execution-kind">
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
                {lockedConfirmationKinds.has(kind) && (
                  <em>
                    <LockKeyhole size={11} />
                    Required in YOLO
                  </em>
                )}
              </span>
              <input
                type="checkbox"
                aria-label={`Confirm: ${label}`}
                checked={map[kind] === true}
                disabled={mode !== 'yolo' || lockedConfirmationKinds.has(kind)}
                onChange={(event) =>
                  change('yoloConfirm', { ...map, [kind]: event.target.checked })
                }
              />
            </label>
          ))}
        </div>
        <p className="execution-protection-note">
          The trusted-state and credential categories are fixed in normal YOLO. Tool availability
          and explicit deny rules are configured separately.
        </p>
      </article>
    </section>
  );
}
