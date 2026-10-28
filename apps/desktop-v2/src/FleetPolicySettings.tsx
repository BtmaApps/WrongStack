import type { LucideIcon } from 'lucide-react';
import { BookOpen, Brain, Compass, Layers3, ListChecks, Sparkles } from 'lucide-react';
import './fleet-policy.css';

export function FleetPolicySettings({
  draft,
  change,
}: {
  draft: Record<string, unknown>;
  change: (key: string, value: unknown) => void;
}) {
  const toggle = (key: string, label: string, description: string, Icon: LucideIcon) => {
    const known = typeof draft[key] === 'boolean';
    return (
      <label className="fleet-policy-switch" key={key}>
        <Icon size={19} />
        <span>
          <strong>{label}</strong>
          <small>{description}</small>
          <em>
            {known
              ? draft[key]
                ? 'Enabled in profile'
                : 'Disabled in profile'
              : 'Not reported by this engine'}
          </em>
        </span>
        <input
          type="checkbox"
          aria-label={label}
          disabled={!known}
          checked={draft[key] === true}
          onChange={(event) => change(key, event.target.checked)}
        />
      </label>
    );
  };
  return (
    <div className="fleet-policy-settings">
      <article className="fleet-capacity-card">
        <header>
          <Layers3 size={23} />
          <div>
            <span className="eyebrow">SHARED EXECUTION</span>
            <h3>Fleet capacity</h3>
          </div>
        </header>
        <p>
          Set the profile’s agent concurrency limit. Individual agent budgets and role models remain
          separate controls.
        </p>
        <div className="fleet-capacity-fields">
          <label>
            <strong>Concurrent agents</strong>
            <input
              aria-label="Concurrent agents"
              type="number"
              required
              min={1}
              step={1}
              value={typeof draft['maxConcurrent'] === 'number' ? draft['maxConcurrent'] : ''}
              onChange={(event) =>
                change(
                  'maxConcurrent',
                  event.target.value === '' ? undefined : Number(event.target.value),
                )
              }
            />
            <small>A positive whole number; no desktop-imposed upper cap.</small>
          </label>
          <label>
            <strong>Fleet chat detail</strong>
            <select
              aria-label="Fleet chat detail"
              value={String(draft['fleetChatVerbosity'] ?? '')}
              onChange={(event) => change('fleetChatVerbosity', event.target.value)}
            >
              <option value="" disabled>
                Not reported
              </option>
              <option value="off">Quiet</option>
              <option value="full">Detailed</option>
            </select>
            <small>
              Shared chat-detail preference for clients that support it. Desktop run activity
              remains available independently.
            </small>
          </label>
        </div>
      </article>
      <section className="fleet-companions" aria-label="Companion policy">
        <header>
          <div>
            <span className="eyebrow">ALONGSIDE THE LEADER</span>
            <h3>Companion agents</h3>
          </div>
          <p>
            These switches configure eligibility, not a live running state. Runtime activity is
            shown in the project’s Live fleet workspace.
          </p>
        </header>
        {toggle(
          'memoryCompanionEnabled',
          'Memory Companion',
          'Preserve durable project knowledge through the background memory companion.',
          Brain,
        )}
        {toggle(
          'exploreCompanionEnabled',
          'Explore Companion',
          'Run read-only code exploration alongside the leader and return findings as same-session notes.',
          Compass,
        )}
        {toggle(
          'skillCompanionEnabled',
          'Skill Companion',
          'Recommend relevant skills as work changes, without replacing the leader’s skill choices.',
          BookOpen,
        )}
      </section>
      <section className="fleet-next-step-policy" aria-label="Next-step policy">
        <header>
          <span className="eyebrow">AFTER A RESPONSE</span>
          <h3>Next-step guidance</h3>
          <p>
            Guidance and tool availability do not select automatic continuation. Configure
            continuation mode under Execution & permissions.
          </p>
        </header>
        {toggle(
          'nextPrediction',
          'Next-step prediction',
          'Enable the engine’s prediction of useful follow-up work.',
          Sparkles,
        )}
        {toggle(
          'nextStepsTool',
          'Next-steps tool',
          'Make the engine’s nextsteps tool available for structured follow-up choices.',
          ListChecks,
        )}
      </section>
    </div>
  );
}
