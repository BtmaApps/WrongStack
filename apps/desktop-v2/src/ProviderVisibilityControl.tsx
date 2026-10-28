import { useState } from 'react';
import { Modal } from './Modal';
import { providerDisabled, providerVisibilityPatch } from './model-visibility';

export function ProviderVisibilityControl({
  provider,
  draft,
  change,
}: {
  provider: string;
  draft: Record<string, unknown>;
  change: (key: string, value: unknown) => void;
}) {
  const [review, setReview] = useState(false);
  if (!provider) return null;
  const off = providerDisabled(draft['disabledProviders'], provider);
  return (
    <section className="provider-visibility-control" aria-label="Provider visibility">
      <div className="provider-visibility-copy">
        <strong>{provider}</strong>
        <p>
          {off
            ? 'Disabled across model catalogs and fallback selection.'
            : 'Available for model catalogs and fallback selection.'}
        </p>
        <p className="field-help">
          Saved credentials, model definitions, favorites and fallback references are retained.
          Existing runs keep their current connection.
        </p>
      </div>
      <button type="button" className="button secondary" onClick={() => setReview(true)}>
        {off ? 'Enable provider' : 'Disable provider'}
      </button>
      {review && (
        <Modal onClose={() => setReview(false)}>
          <h2 id="dialog-title">{off ? 'Enable this provider' : 'Disable this provider'}</h2>
          <p>
            <strong>{provider}</strong>
          </p>
          <p>
            {off
              ? 'Restore this connection to model catalogs and fallback selection. Individually disabled models remain excluded.'
              : 'Exclude every model from this connection, including models discovered later. Saved favorites and fallback chains remain stored; the engine skips the disabled provider.'}
          </p>
          <p className="field-help">
            This changes your settings draft. Save settings to apply it to the profile.
          </p>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setReview(false)}>
              Keep provider unchanged
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                const patch = providerVisibilityPatch(draft, provider, !off);
                change('disabledProviders', patch.disabledProviders);
                setReview(false);
              }}
            >
              Apply provider change to draft
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
