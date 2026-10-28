import { useEffect, useMemo, useRef, useState } from 'react';
import { DraftWriter } from './draft-storage';
import {
  emptyRequirementDraft,
  parseRequirementDraft,
  type RequirementDraft,
  type RequirementDraftSnapshot,
  type RequirementDraftStorage,
} from './requirement-draft';

export function useRequirementDraft(storage?: RequirementDraftStorage) {
  const [value, setValue] = useState<RequirementDraft>(emptyRequirementDraft);
  const current = useRef(value);
  const [ready, setReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'conflict' | 'error'>(
    'loading',
  );
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);
  const resolutionInFlight = useRef(false);
  const [review, setReview] = useState<{
    snapshot: RequirementDraftSnapshot;
    draft: RequirementDraft;
  } | null>(null);
  const blocked = useRef(false);
  const loaded = useRef(false);
  const sequence = useRef(0);
  const writer = useMemo(
    () =>
      new DraftWriter(async (_id, text, revision) => {
        if (!storage) throw Error('Native requirement draft storage is unavailable.');
        return storage.save(text ? parseRequirementDraft(JSON.parse(text)) : null, revision);
      }),
    [storage],
  );
  useEffect(() => {
    let active = true;
    loaded.current = false;
    blocked.current = false;
    setReady(false);
    setStatus('loading');
    if (!storage)
      return () => {
        active = false;
      };
    void storage
      .get()
      .then((snapshot) => {
        const restored = parseRequirementDraft(snapshot.value);
        if (!active) return;
        writer.initialize('requirements-new', snapshot.revision);
        current.current = restored;
        setValue(restored);
        loaded.current = true;
        setReady(true);
        setStatus('saved');
        setError('');
      })
      .catch((e) => {
        if (active) {
          setStatus('error');
          setError(String(e));
        }
      });
    return () => {
      active = false;
    };
  }, [storage, writer, loadAttempt]);
  const persist = async (next: RequirementDraft | null) => {
    if (!loaded.current) throw Error('The saved requirement draft is still loading.');
    if (blocked.current)
      throw Error('Resolve the saved draft conflict before recording this requirement.');
    const seq = ++sequence.current;
    setStatus('saving');
    setError('');
    try {
      await writer.write('requirements-new', next ? JSON.stringify(next) : '');
      if (seq === sequence.current && !blocked.current) setStatus('saved');
    } catch (e) {
      if (String(e).includes('DRAFT_CONFLICT')) {
        blocked.current = true;
        setStatus('conflict');
      } else if (seq === sequence.current) setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  const update = (change: (previous: RequirementDraft) => RequirementDraft) => {
    if (!loaded.current) return;
    const next = { ...change(current.current), attempt: null };
    current.current = next;
    setValue(next);
    if (!blocked.current) void persist(next).catch(() => {});
  };
  const prepare = async (fingerprint: string) => {
    if (!storage || blocked.current)
      throw Error('Resolve the saved draft conflict before recording this requirement.');
    const attempt =
      current.current.attempt?.fingerprint === fingerprint
        ? current.current.attempt
        : { fingerprint, key: `desktop-${crypto.randomUUID()}` };
    const next = { ...current.current, attempt };
    current.current = next;
    setValue(next);
    await persist(next);
    if (current.current.attempt !== attempt)
      throw Error(
        'The requirement draft changed before recording it. Review the current form and try again.',
      );
    const latest = await storage.get();
    if (latest.revision !== writer.revision('requirements-new')) {
      blocked.current = true;
      setStatus('conflict');
      setError('This requirement draft changed in another window.');
      throw Error(
        'This requirement draft changed in another window. Compare the saved version before recording it.',
      );
    }
    return attempt.key;
  };
  const clearSubmitted = async (fingerprint: string) => {
    if (current.current.attempt?.fingerprint !== fingerprint) return false;
    await persist(null);
    if (current.current.attempt?.fingerprint !== fingerprint) return false;
    current.current = emptyRequirementDraft();
    setValue(current.current);
    return true;
  };
  const compare = async () => {
    if (!storage) return;
    await writer.drain('requirements-new');
    try {
      const snapshot = await storage.get();
      setReview({ snapshot, draft: parseRequirementDraft(snapshot.value) });
    } catch (e) {
      setError(String(e));
    }
  };
  const resolve = async (choice: 'saved' | 'local') => {
    if (!storage || !review || resolutionInFlight.current) return;
    resolutionInFlight.current = true;
    setResolving(true);
    await writer.drain('requirements-new');
    try {
      const latest = await storage.get();
      if (latest.revision !== review.snapshot.revision) {
        setReview(null);
        throw Error('The saved draft changed again. Compare the latest version before choosing.');
      }
      writer.initialize('requirements-new', latest.revision);
      blocked.current = false;
      sequence.current++;
      if (choice === 'saved') {
        current.current = parseRequirementDraft(latest.value);
        setValue(current.current);
        setStatus('saved');
        setError('');
      } else await persist(current.current);
      setReview(null);
    } catch (e) {
      blocked.current = true;
      setStatus('conflict');
      setError(String(e));
    } finally {
      resolutionInFlight.current = false;
      setResolving(false);
    }
  };
  return {
    retryLoad: () => setLoadAttempt((attempt) => attempt + 1),
    value,
    ready,
    status,
    error,
    review,
    resolving,
    update,
    prepare,
    clearSubmitted,
    compare,
    resolve,
  };
}
