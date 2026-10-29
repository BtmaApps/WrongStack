import { useCallback, useEffect, useState } from 'react';
import { record } from './engine-values';
import { ModelDraftSummary } from './ModelDraftNotice';
import { modelDraftKey } from './model-draft-key';
import {
  type ModelDraftSnapshot,
  type ModelEditorDraftStore,
  type ModelEditorState,
  parseModelEditor,
} from './model-editor-draft';
import { request } from './platform';

export function LegacyModelDraftNotice({
  providerId,
  profileName,
  controller,
  onCopied,
}: {
  providerId: string;
  profileName: string;
  controller: ModelEditorDraftStore;
  onCopied: () => void;
}) {
  const [saved, setSaved] = useState<{
    snapshot: ModelDraftSnapshot;
    editor: ModelEditorState;
  } | null>(null);
  const [error, setError] = useState(''),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    const formKey = await modelDraftKey(providerId);
    const snapshot = await request<ModelDraftSnapshot>('profile-draft.get', { formKey });
    if (snapshot.value === null) return null;
    if (record(snapshot.value)['profileId'] !== undefined)
      throw Error(
        'The earlier draft already has a profile owner; it cannot be treated as unassigned.',
      );
    const editor = parseModelEditor(snapshot.value, providerId);
    if (!editor) return null;
    return { snapshot, editor };
  }, [providerId]);
  useEffect(() => {
    let active = true;
    void read()
      .then((value) => {
        if (active) setSaved(value);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [read]);
  const act = async (choice: 'copy' | 'discard') => {
    if (busy || !saved) return;
    setBusy(true);
    setError('');
    try {
      const current = await read();
      if (!current || current.snapshot.revision !== saved.snapshot.revision) {
        setSaved(current);
        throw Error('The unassigned draft changed. Review its latest version before choosing.');
      }
      if (choice === 'copy') {
        await controller.load();
        if (
          controller.snapshot().value ||
          controller.snapshot().review ||
          controller.snapshot().dirty
        )
          throw Error(
            'Finish or discard this profile’s current draft before copying an unassigned draft.',
          );
        await controller.prepare();
        controller.edit(current.editor);
        await controller.flush();
        await controller.prepare(current.editor);
        setReview(false);
        onCopied();
      } else {
        const reply = await request<{ revision: number }>('profile-draft.save', {
          formKey: await modelDraftKey(providerId),
          value: null,
          expectedRevision: current.snapshot.revision,
        });
        if (reply.revision !== current.snapshot.revision + 1)
          throw Error('The unassigned draft removal was not acknowledged.');
        setSaved(null);
        setReview(false);
      }
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  if (!saved && !error) return null;
  return (
    <section className="model-draft-notice" aria-label="Unassigned model draft">
      <h3>Earlier model draft</h3>
      <p>
        This draft predates profile ownership. Review it before copying into {profileName}. Copying
        keeps the unassigned source and does not apply provider settings.
      </p>
      {error && (
        <p role="alert" className="session-error">
          {error}
        </p>
      )}
      {saved &&
        (!review ? (
          <button type="button" className="button secondary small" onClick={() => setReview(true)}>
            Review unassigned model draft
          </button>
        ) : (
          <>
            <ModelDraftSummary value={saved.editor} />
            <div className="model-tier-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() => {
                  void act('copy');
                }}
              >
                Copy and review in this profile
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() => {
                  void act('discard');
                }}
              >
                Discard unassigned model draft
              </button>
              <button
                type="button"
                className="button secondary small"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Keep unassigned draft
              </button>
            </div>
          </>
        ))}
    </section>
  );
}
