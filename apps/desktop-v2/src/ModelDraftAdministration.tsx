import { Archive, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ModelProfileIdentity } from './ModelCatalogProfile';
import {
  type ClassifiedModelDraft,
  canDiscardHere,
  canOpenProvider,
  classifyModelDrafts,
  discardListedDraft,
  type ModelDraftAdminStorage,
  readModelDraftListing,
  standingDetail,
  standingLabel,
  standingOrder,
} from './model-draft-admin';
import { request } from './platform';

const nativeStorage: ModelDraftAdminStorage = {
  list: () => request<unknown>('profile-draft.list', {}),
  save: (formKey, value, expectedRevision) =>
    request<{ revision: number }>('profile-draft.save', { formKey, value, expectedRevision }),
};
const kib = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KiB`;

/** Review parked model-editor drafts that the provider editor cannot reach on its own. */
export function ModelDraftAdministration({
  profile,
  savedProviders,
  disabled,
  onOpenProvider,
  storage = nativeStorage,
}: {
  profile: ModelProfileIdentity;
  savedProviders: readonly string[];
  disabled: boolean;
  onOpenProvider: (providerId: string) => void;
  storage?: ModelDraftAdminStorage;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Archive size={14} />
        Saved drafts
      </button>
      {open && (
        <ModelDraftAdministrationDialog
          profile={profile}
          savedProviders={savedProviders}
          storage={storage}
          onClose={() => setOpen(false)}
          onOpenProvider={(providerId) => {
            setOpen(false);
            onOpenProvider(providerId);
          }}
        />
      )}
    </>
  );
}

function ModelDraftAdministrationDialog({
  profile,
  savedProviders,
  storage,
  onClose,
  onOpenProvider,
}: {
  profile: ModelProfileIdentity;
  savedProviders: readonly string[];
  storage: ModelDraftAdminStorage;
  onClose: () => void;
  onOpenProvider: (providerId: string) => void;
}) {
  const [drafts, setDrafts] = useState<ClassifiedModelDraft[] | null>(null);
  const [truncated, setTruncated] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  // Leaves any shown error in place: a refused discard must stay visible after the refresh.
  const load = useCallback(async () => {
    try {
      const listing = readModelDraftListing(await storage.list());
      setDrafts(await classifyModelDrafts(listing.drafts, profile.id, savedProviders));
      setTruncated(listing.truncated ? listing.limit : null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [storage, profile.id, savedProviders]);
  useEffect(() => {
    void load();
  }, [load]);
  const discard = async (draft: ClassifiedModelDraft) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await discardListedDraft(storage, draft);
      setNotice(
        `Discarded the ${draft.modelId || 'unnamed'} draft for ${draft.providerId ?? 'an unknown connection'}.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setConfirm('');
      await load();
      setBusy(false);
    }
  };
  const groups = standingOrder
    .map((standing) => ({
      standing,
      items: (drafts ?? []).filter((draft) => draft.standing === standing),
    }))
    .filter((group) => group.items.length);
  return (
    <Modal onClose={onClose}>
      <header>
        <div>
          <span className="eyebrow">{profile.name} · native drafts</span>
          <h2 id="dialog-title">Saved model drafts</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close saved model drafts"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="model-draft-admin">
        <p>
          Unfinished model definitions saved on this computer for any profile or connection.
          Discarding removes only the parked draft; provider settings are never changed here.
        </p>
        <div className="model-tier-actions">
          <button
            type="button"
            className="button secondary small"
            disabled={busy}
            onClick={() => {
              setNotice('');
              setError('');
              void load();
            }}
          >
            <RefreshCw size={14} />
            Refresh drafts
          </button>
        </div>
        {error && (
          <p role="alert" className="session-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {truncated !== null && (
          <p role="status">
            Showing the {truncated} most recently changed drafts. Older drafts remain stored.
          </p>
        )}
        {drafts === null && !error && <p role="status">Reading saved drafts…</p>}
        {drafts?.length === 0 && <p>No unfinished model drafts are saved.</p>}
        {groups.map(({ standing, items }) => (
          <section key={standing} aria-label={standingLabel[standing]}>
            <h3>
              {standingLabel[standing]} <span className="model-draft-count">{items.length}</span>
            </h3>
            <ul className="model-draft-admin-list">
              {items.map((draft) => (
                <li key={draft.formKey}>
                  <div className="model-draft-admin-row">
                    <div>
                      <strong>{draft.modelId || draft.originalId || 'Unnamed new model'}</strong>
                      <span>
                        {draft.providerId ?? 'Unknown connection'} ·{' '}
                        {draft.standing === 'other-profile'
                          ? draft.profileName
                            ? `${draft.profileName} (name when saved)`
                            : 'Unnamed profile'
                          : draft.standing === 'editable' || draft.standing === 'orphaned'
                            ? profile.name
                            : draft.standing === 'unverified'
                              ? 'Owner not verified'
                              : 'No profile owner'}{' '}
                        ·{' '}
                        {draft.updatedAt
                          ? new Date(draft.updatedAt).toLocaleString()
                          : 'Time unknown'}{' '}
                        · {kib(draft.bytes)}
                      </span>
                    </div>
                    <div className="model-tier-actions">
                      {canOpenProvider(draft) && (
                        <button
                          type="button"
                          className="button secondary small"
                          disabled={busy}
                          onClick={() => onOpenProvider(draft.providerId!)}
                        >
                          Open {draft.providerId}
                        </button>
                      )}
                      {canDiscardHere(draft) &&
                        (confirm === draft.formKey ? (
                          <>
                            <button
                              type="button"
                              className="button danger small"
                              disabled={busy}
                              onClick={() => {
                                void discard(draft);
                              }}
                            >
                              Confirm discard
                            </button>
                            <button
                              type="button"
                              className="button secondary small"
                              disabled={busy}
                              onClick={() => setConfirm('')}
                            >
                              Keep draft
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button secondary small"
                            disabled={busy}
                            onClick={() => setConfirm(draft.formKey)}
                          >
                            Discard draft
                          </button>
                        ))}
                    </div>
                  </div>
                  <p>{standingDetail(draft)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
