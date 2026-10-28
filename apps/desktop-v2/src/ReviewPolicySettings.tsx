import { Bug, ScanEye } from 'lucide-react';
import { record } from './engine-values';
import {
  ModelCatalog,
  ModelReference,
  type PolicyProps,
  ProfileSelect,
} from './ModelPolicySettings';
import { reviewChainPreview, reviewModelChange, reviewModelReference } from './review-policy-model';

export function ReviewPolicySettings({
  draft,
  saved,
  change,
  command,
}: PolicyProps & { saved: Record<string, unknown> }) {
  const preview = reviewChainPreview(saved, draft);
  const model = (prefix: 'chimera' | 'autoReview', value: string) => {
    for (const [key, next] of Object.entries(reviewModelChange(prefix, value))) change(key, next);
  };
  const number = (key: string, label: string, min: number, help: string, max?: number) => (
    <label>
      {label}
      <input
        type="number"
        aria-label={label}
        required
        min={min}
        max={max}
        step={1}
        value={typeof draft[key] === 'number' ? draft[key] : ''}
        onChange={(event) =>
          change(key, event.target.value === '' ? undefined : Number(event.target.value))
        }
      />
      <span>{help}</span>
    </label>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={String(draft[key] ?? '')}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="" disabled>
          Not reported by this engine
        </option>
        {options.map(([value, title]) => (
          <option key={value} value={value}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
  const enabled = (key: string, label: string) => (
    <label className="policy-toggle">
      <input
        type="checkbox"
        checked={draft[key] === true}
        onChange={(event) => change(key, event.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <div className="model-policy-settings review-policy-settings">
      <ModelCatalog command={command} />
      <article className="policy-profile">
        <header>
          <Bug size={19} />
          <div>
            <span className="eyebrow">AFTER THE RUN</span>
            <h3>Chimera review</h3>
          </div>
        </header>
        <p className="field-help">
          Review the completed work with a separate reviewer. Findings and operator decisions appear
          in the project’s Chimera Reviews workspace.
        </p>
        {enabled('chimeraEnabled', 'Enable Chimera reviews')}
        <div className="policy-field-grid">
          <ModelReference
            label="Chimera reviewer model"
            value={reviewModelReference(draft, 'chimera')}
            onChange={(value) => model('chimera', value)}
          />
          {number(
            'chimeraMaxFiles',
            'Chimera file limit',
            1,
            'Maximum changed files included in a review.',
          )}
          {select('chimeraAutoFix', 'Chimera follow-up policy', [
            ['off', 'Report only'],
            ['ask', 'Ask before fixes'],
            ['auto', 'Automatic fixes'],
          ])}
        </div>
        <p className="field-help">
          Leave the model empty to use the run’s model. A provider/model reference overrides both; a
          model alone inherits the provider. Automatic fixes can change project files under the
          engine’s permission policy.
        </p>
      </article>
      <article className="policy-profile">
        <header>
          <ScanEye size={19} />
          <div>
            <span className="eyebrow">DURING THE RUN</span>
            <h3>Continuous review</h3>
          </div>
        </header>
        <p className="field-help">
          Review batches of changed files while the agent works. Batch size, delay and concurrency
          determine how much review work can run alongside it.
        </p>
        {enabled('autoReviewEnabled', 'Enable continuous reviews')}
        <div className="policy-field-grid">
          <ProfileSelect
            label="Continuous review fallback profile"
            profiles={record(draft['fallbackProfiles'])}
            value={draft['autoReviewFallbackProfile']}
            onChange={(value) => {
              change('autoReviewFallbackProfile', value);
              if (value) {
                change('autoReviewProvider', '');
                change('autoReviewModel', '');
              }
            }}
          />
          <ModelReference
            label="Continuous reviewer model"
            value={reviewModelReference(draft, 'autoReview')}
            onChange={(value) => model('autoReview', value)}
          />
          {select('autoReviewModelSelection', 'Review model rotation', [
            ['round-robin', 'Round robin'],
            ['random', 'Random'],
          ])}
          {select('autoReviewCascadeOn', 'Cascade review threshold', [
            ['off', 'No cascade'],
            ['high', 'High and critical findings'],
            ['critical', 'Critical findings only'],
          ])}
          {number(
            'autoReviewDebounceMs',
            'Review batch delay',
            0,
            'Milliseconds to collect changes before a review.',
            2_147_483_647,
          )}
          {number(
            'autoReviewMaxFilesPerBatch',
            'Review batch file limit',
            1,
            'Maximum files per review batch.',
          )}
          {number(
            'autoReviewMaxConcurrentReviews',
            'Concurrent review limit',
            1,
            'Maximum simultaneous automatic reviews.',
          )}
        </div>
        <p className="field-help">
          Choosing a named profile clears the explicit model; editing the model clears the profile.
          Empty overrides inherit the engine’s effective fallback configuration.
        </p>
        {preview.missing && (
          <p className="session-error" role="status">
            This saved fallback profile is missing. Choose an existing profile or inherit.
          </p>
        )}
        <div className="review-chain-evidence">
          <h4>Last saved effective fallback chain</h4>
          {preview.stale && (
            <p role="status">
              Routing edits are not reflected here until settings are saved and read back.
            </p>
          )}
          {preview.chain.length ? (
            <ol>
              {preview.chain.map((item, index) => (
                <li key={`${index}-${item}`}>
                  <code>{item}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p>No fallback chain reported by the engine.</p>
          )}
        </div>
      </article>
      <p className="settings-defaults-note">
        Saved review settings apply when a new engine session loads its plugins. Existing runs keep
        their loaded review configuration.
      </p>
    </div>
  );
}
