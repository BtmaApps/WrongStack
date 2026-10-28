import { entries, record } from './engine-values';

function reference(value: unknown): string {
  if (typeof value === 'string') return value;
  const entry = record(value);
  return [entry['provider'], entry['model']].filter(Boolean).join('/') || 'Inherit runtime model';
}
const conditionLabels: Record<string, string> = {
  source: 'Request source',
  risk: 'Risk',
  minRisk: 'Minimum risk',
  maxRisk: 'Maximum risk',
  fallback: 'Caller fallback',
  hasOptions: 'Requires choices',
  offersOption: 'Required choice',
  question: 'Question pattern',
  context: 'Context pattern',
  notQuestion: 'Excluded question pattern',
  notContext: 'Excluded context pattern',
};
export function BrainPolicyEvidence({ snapshot }: { snapshot: Record<string, unknown> }) {
  const council = record(snapshot['council']),
    ledger = record(snapshot['ledger']),
    trace = record(snapshot['trace']);
  return (
    <>
      <section className="brain-policy-card" aria-label="Effective decision models">
        <h3>Models & council seats</h3>
        <p>
          Saved references and resolved runtime targets are shown separately. Unsaved edits remain
          in the model and council editor until you save the Brain policy.
        </p>
        <h4>Configured model pool</h4>
        {entries(snapshot['models']).length ? (
          <ol>
            {entries(snapshot['models']).map((model, index) => (
              <li key={index}>{reference(model)}</li>
            ))}
          </ol>
        ) : (
          <p>Inherit the runtime’s model selection.</p>
        )}
        <h4>Resolved model pool</h4>
        <p>
          {Array.isArray(snapshot['poolLabels']) && snapshot['poolLabels'].length
            ? snapshot['poolLabels'].map(String).join(' · ')
            : 'No resolved pool targets reported.'}
        </p>
        <h4>Configured voters</h4>
        {entries(council['voters']).length ? (
          <ol>
            {entries(council['voters']).map((voter, index) => (
              <li key={index}>
                <strong>{reference(voter)}</strong>
                <p>
                  {String(voter['persona'] ?? 'Default decision lens')} · vote weight{' '}
                  {String(voter['weight'] ?? 1)}
                  {voter['veto'] === true
                    ? ' · veto enabled'
                    : voter['veto'] === false
                      ? ' · veto disabled'
                      : ' · inherit seat / lens veto'}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p>Seats may be derived from the model pool.</p>
        )}
        <h4>Configured seat defaults</h4>
        {entries(council['seats']).length ? (
          <ol>
            {entries(council['seats']).map((seat, index) => (
              <li key={index}>
                {String(seat['persona'])} ·{' '}
                {seat['veto'] === true
                  ? 'veto enabled'
                  : seat['veto'] === false
                    ? 'veto disabled'
                    : 'use lens veto default'}
              </li>
            ))}
          </ol>
        ) : (
          <p>Built-in rotation: executor, skeptic (veto enabled), auditor.</p>
        )}
        <h4>Effective seats & judge</h4>
        <p>
          {Array.isArray(snapshot['councilLabels']) && snapshot['councilLabels'].length
            ? snapshot['councilLabels'].map(String).join(' · ')
            : 'No active council seats reported.'}
        </p>
        <p>
          Configured judge:{' '}
          {council['judge'] ? reference(council['judge']) : 'Derived from the pool'}
        </p>
        <p>
          Effective judge: {String(snapshot['judgeLabel'] ?? 'No active judge')}
          {snapshot['judgeIsVoter'] === true ? ' · also a voting member' : ''}
        </p>
      </section>
      <section className="brain-policy-card" aria-label="Configured Brain rules">
        <h3>Deterministic rules</h3>
        <p>Read-only rules in evaluation order; the first match wins.</p>
        {entries(snapshot['rules']).length ? (
          <ol className="brain-rules">
            {entries(snapshot['rules']).map((rule, index) => {
              const action = record(rule['then']);
              return (
                <li key={index}>
                  <h4>
                    {String(rule['id'] ?? `Rule ${index + 1}`)} ·{' '}
                    {rule['enabled'] === false ? 'Disabled' : 'Enabled'}
                  </h4>
                  {typeof rule['description'] === 'string' && <p>{rule['description']}</p>}
                  <dl>
                    {Object.entries(record(rule['when'])).map(([key, value]) => (
                      <div key={key}>
                        <dt>{conditionLabels[key] ?? key}</dt>
                        <dd>
                          {Array.isArray(value) ? value.map(String).join(', ') : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Decision: <strong>{String(action['action'] ?? 'Not reported')}</strong>
                  </p>
                  {['optionId', 'text', 'rationale', 'reason', 'prompt']
                    .filter((key) => typeof action[key] === 'string')
                    .map((key) => (
                      <p key={key}>
                        {key === 'optionId'
                          ? 'Choice'
                          : key === 'rationale'
                            ? 'Rationale'
                            : key === 'reason'
                              ? 'Reason'
                              : key === 'prompt'
                                ? 'Operator prompt'
                                : 'Answer'}
                        : {String(action[key])}
                      </p>
                    ))}
                  {rule['maxHits'] !== undefined && (
                    <p>
                      Maximum {String(rule['maxHits'])} matches per{' '}
                      {String(rule['windowMs'] ?? 60000)} ms.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p>No explicit rules were returned by this runtime.</p>
        )}
        {Array.isArray(snapshot['ruleErrors']) &&
          snapshot['ruleErrors'].map((error, index) => (
            <p key={index} className="session-error">
              {String(error)}
            </p>
          ))}
      </section>
      <section className="brain-policy-card" aria-label="Brain evidence locations">
        <h3>Evidence locations</h3>
        <dl>
          <dt>Decision ledger</dt>
          <dd>{String(ledger['path'] ?? 'No location reported')}</dd>
          <dt>Replay trace</dt>
          <dd>{String(trace['path'] ?? 'No location reported')}</dd>
        </dl>
        <p>
          These locations belong to this profile runtime; project runtimes record their own
          evidence.
        </p>
      </section>
    </>
  );
}
