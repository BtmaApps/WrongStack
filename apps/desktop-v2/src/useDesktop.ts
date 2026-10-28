import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ComposerAttachment, validateAttachments } from './composer-attachments';
import type { SubmitMode } from './composer-model';
import type { ComposerFileReference } from './composer-resources-model';
import { DraftWriter } from './draft-storage';
import type { InputDraft } from './input-form-model';
import { initialSnapshot, isLive, type Session, type Snapshot, visibleSessions } from './model';
import { getSnapshot, layoutKey, native, request } from './platform';
import { nextSessionAfterDetach, restoreSessionTabs } from './session-layout';
import { useAppearance } from './useAppearance';

type Section = 'fleet' | 'projects' | 'activity' | 'engine' | 'project' | 'wrongstack';
export type ProjectPage =
  | 'overview'
  | 'memory'
  | 'kanban'
  | 'atlas'
  | 'automations'
  | 'chronicle'
  | 'live-fleet'
  | 'skills'
  | 'files'
  | 'changes';
export function useDesktop() {
  useEffect(() => {
    // File drops belong to explicit workspaces; never navigate the shell away
    // from the application when a user misses the composer.
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [project, setProject] = useState<string | null>(
    new URLSearchParams(location.search).get('project'),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftModes, setDraftModes] = useState<Record<string, SubmitMode>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [draftRetry, setDraftRetry] = useState(0);
  const draftWriter = useMemo(
    () => new DraftWriter((id, text) => request('draft.save', { id, text }).then(() => {})),
    [],
  );
  const referenceWriter = useMemo(
    () =>
      new DraftWriter((id, text) =>
        request('draft.save', { id, part: 'references', text }).then(() => {}),
      ),
    [],
  );
  const attachmentWriter = useMemo(
    () =>
      new DraftWriter((id, text) =>
        request('draft.save', { id, part: 'attachments', text }).then(() => {}),
      ),
    [],
  );
  const modeWriter = useMemo(
    () =>
      new DraftWriter((id, text) =>
        request('draft.save', { id, part: 'mode', text }).then(() => {}),
      ),
    [],
  );
  const [composerAttachments, setComposerAttachments] = useState<
    Record<string, ComposerAttachment[]>
  >({});
  const [composerReferences, setComposerReferences] = useState<
    Record<string, ComposerFileReference[]>
  >({});
  const [inputDrafts, setInputDrafts] = useState<Record<string, InputDraft>>({});
  const setInputDraft = useCallback(
    (id: string, draft: InputDraft | null) =>
      setInputDrafts((current) => {
        if (draft) return { ...current, [id]: draft };
        if (!Object.hasOwn(current, id)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }),
    [],
  );
  const [section, setSection] = useState<Section>(
    new URLSearchParams(location.search).has('project') ? 'project' : 'fleet',
  );
  const [projectPage, setProjectPage] = useState<ProjectPage>('overview');
  const [settingsReturnSession, setSettingsReturnSession] = useState<string | null>(null);
  const openProjectPage = (id: string, page: ProjectPage = 'overview') => {
    setProject(id);
    setProjectPage(page);
    setSection('project');
    setSelected(null);
  };
  const openWrongStackSettings = (sessionId?: string) => {
    setSettingsReturnSession(sessionId ?? null);
    setSection('wrongstack');
  };
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [restored, setRestored] = useState(false);
  const [dialog, setDialog] = useState<'session' | 'palette' | 'preview' | null>(null);
  const [pending, setPending] = useState(false);
  const [sessionProject, setSessionProject] = useState('');
  const [kind, setKind] = useState<'agent' | 'terminal'>('agent');
  const [title, setTitle] = useState('');
  const [workdir, setWorkdir] = useState('');
  const [preview, setPreview] = useState('http://localhost:3000');
  const restoredRef = useRef(false);
  const reportError = useCallback(
    (e: unknown) => setError(String(e instanceof Error ? e.message : e)),
    [],
  );
  const setAttachments = useCallback(
    (id: string, items: ComposerAttachment[]) => {
      setComposerAttachments((current) => ({ ...current, [id]: items }));
      return native
        ? attachmentWriter.write(id, JSON.stringify(items)).then(
            () => true,
            () => {
              reportError(new Error('Could not save draft attachments for restart.'));
              return false;
            },
          )
        : Promise.resolve(true);
    },
    [attachmentWriter, reportError],
  );
  const setComposerRefs = useCallback(
    (id: string, refs: ComposerFileReference[]) => {
      setComposerReferences((current) => ({ ...current, [id]: refs }));
      return native
        ? referenceWriter.write(id, JSON.stringify(refs)).then(
            () => true,
            () => {
              reportError(new Error('Could not save draft file references for restart.'));
              return false;
            },
          )
        : Promise.resolve(true);
    },
    [referenceWriter, reportError],
  );
  const appearance = useAppearance(snapshot.appearance, reportError);
  const setDraftMode = useCallback(
    (id: string, mode: SubmitMode) => {
      setDraftModes((current) => ({ ...current, [id]: mode }));
      if (native)
        void modeWriter
          .write(id, mode)
          .catch(() => reportError(new Error('Could not save delivery mode for restart.')));
    },
    [modeWriter, reportError],
  );
  const refresh = useCallback(async () => {
    try {
      const next = await getSnapshot();
      setSnapshot(next);
      setConnected(true);
      if (!restoredRef.current) {
        restoredRef.current = true;
        try {
          const layout: unknown = next.layout ? JSON.parse(next.layout) : null;
          if (layout && typeof layout === 'object') {
            const saved = layout as Record<string, unknown>;
            if (
              !location.search &&
              ['fleet', 'projects', 'activity', 'engine', 'project', 'wrongstack'].includes(
                String(saved['section']),
              )
            )
              setSection(saved['section'] as Section);
            if (
              [
                'overview',
                'memory',
                'kanban',
                'atlas',
                'automations',
                'chronicle',
                'live-fleet',
                'skills',
                'files',
                'changes',
              ].includes(String(saved['projectPage']))
            )
              setProjectPage(saved['projectPage'] as ProjectPage);
            setOpenSessionIds(restoreSessionTabs(saved, next.sessions));
            if (
              !location.search &&
              typeof saved['project'] === 'string' &&
              next.projects.some((p) => p.id === saved['project'])
            )
              setProject(saved['project']);
            if (
              !location.search &&
              typeof saved['selected'] === 'string' &&
              next.sessions.some((s) => s.id === saved['selected'])
            )
              setSelected(saved['selected']);
          }
        } catch {
          /* Invalid saved UI layout never prevents registry recovery. */
        }
        setRestored(true);
      }
    } catch (e) {
      setConnected(false);
      reportError(e);
    }
  }, [reportError]);
  useEffect(() => {
    if (!native) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!restored || !native) return;
    const timer = setTimeout(() => {
      void request('settings.save', {
        key: layoutKey,
        value: JSON.stringify({ project, selected, openSessionIds, section, projectPage }),
      }).catch(reportError);
    }, 400);
    return () => clearTimeout(timer);
  }, [project, selected, openSessionIds, section, projectPage, restored, reportError]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setDialog((d) => (d === 'palette' ? null : 'palette'));
      }
      if (event.key === 'Escape') {
        setDialog(null);
        setSearch('');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      reportError(e);
    } finally {
      setPending(false);
    }
  };
  const newSession = (preferred?: string, sessionKind: 'agent' | 'terminal' = 'agent') => {
    setSessionProject(preferred ?? project ?? snapshot.projects[0]?.id ?? '');
    setKind(sessionKind);
    setTitle('');
    setWorkdir('');
    setDialog('session');
  };
  const currentProject = snapshot.projects.find((p) => p.id === project);
  const active = snapshot.sessions.filter(isLive);
  const attention = snapshot.sessions.filter(
    (s) => s.status === 'error' || s.status === 'interrupted',
  );
  const sessions = useMemo(
    () => visibleSessions(snapshot, project, search, filter),
    [snapshot, project, search, filter],
  );
  const currentSession = snapshot.sessions.find((s) => s.id === selected);
  const sessionKind = currentSession?.kind;
  useEffect(() => {
    if (!selected || sessionKind !== 'agent' || Object.hasOwn(drafts, selected)) return;
    let active = true;
    void request<{
      text: string;
      references: ComposerFileReference[];
      attachments: ComposerAttachment[];
      mode: SubmitMode;
    }>('draft.get', { id: selected })
      .then(({ text, references, attachments, mode }) => {
        if (!active) return;
        if (
          !Array.isArray(references) ||
          references.some((ref) => !ref || typeof ref.path !== 'string' || !ref.path)
        )
          throw Error('Saved file references are invalid.');
        if (
          !Array.isArray(attachments) ||
          attachments.some(
            (item) =>
              !item ||
              typeof item.id !== 'string' ||
              typeof item.name !== 'string' ||
              typeof item.data !== 'string' ||
              typeof item.mediaType !== 'string' ||
              typeof item.bytes !== 'number',
          )
        )
          throw Error('Saved attachments are invalid.');
        validateAttachments(attachments);
        if (!['btw', 'queue', 'steer'].includes(mode))
          throw Error('Saved delivery mode is invalid.');
        setComposerReferences((current) => ({ ...current, [selected]: references }));
        setComposerAttachments((current) => ({ ...current, [selected]: attachments }));
        setDraftModes((current) => ({ ...current, [selected]: mode }));
        setDrafts((current) => ({ ...current, [selected]: text }));
        setDraftErrors((current) => ({ ...current, [selected]: '' }));
      })
      .catch((error: unknown) => {
        if (active)
          setDraftErrors((current) => ({
            ...current,
            [selected]: error instanceof Error ? error.message : String(error),
          }));
      });
    return () => {
      active = false;
    };
  }, [selected, sessionKind, draftRetry, drafts]);
  const jumpToSession = (s: Session) => {
    setOpenSessionIds((ids) => (ids.includes(s.id) ? ids : [...ids, s.id]));
    setSelected(s.id);
    setProject(s.projectId);
    setSection('fleet');
    setDialog(null);
  };
  const closeSessionTab = (id: string) => {
    const next = nextSessionAfterDetach(openSessionIds, selected, id);
    setOpenSessionIds((ids) => ids.filter((candidate) => candidate !== id));
    setSelected(next);
    const session = snapshot.sessions.find((s) => s.id === next);
    if (session) setProject(session.projectId);
  };
  const getDraft = (id: string) => drafts[id] ?? '';
  const setDraft = (id: string, text: string) => {
    setDrafts((current) => ({ ...current, [id]: text }));
    return native
      ? draftWriter.write(id, text).then(
          () => true,
          () => {
            reportError(
              new Error(
                'Could not save this draft for restart. Keep the application open or copy your text.',
              ),
            );
            return false;
          },
        )
      : Promise.resolve(true);
  };
  const showFleet = () => {
    setSelected(null);
    setProject(null);
    setSection('fleet');
  };
  const createSession = () =>
    run(async () => {
      const opened = await request<Session>('session.open', {
        projectId: sessionProject,
        kind,
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(workdir.trim() ? { workdir: workdir.trim() } : {}),
      });
      jumpToSession(opened);
    });

  return {
    projectPage,
    setProjectPage,
    openProjectPage,
    openWrongStackSettings,
    settingsReturnSession,
    setSettingsReturnSession,
    ...appearance,
    snapshot,
    project,
    setProject,
    selected,
    openSessionIds,
    closeSessionTab,
    showFleet,
    drafts,
    draftModes,
    setDraftMode,
    getDraft,
    draftErrors,
    retryDraft: () => setDraftRetry((value) => value + 1),
    composerReferences,
    composerAttachments,
    setAttachments,
    setComposerRefs,
    setDraft,
    inputDrafts,
    setInputDraft,
    setSelected,
    section,
    setSection,
    filter,
    setFilter,
    search,
    setSearch,
    error,
    setError,
    connected,
    dialog,
    setDialog,
    pending,
    sessionProject,
    setSessionProject,
    kind,
    setKind,
    title,
    setTitle,
    workdir,
    setWorkdir,
    preview,
    setPreview,
    reportError,
    run,
    newSession,
    currentProject,
    active,
    attention,
    sessions,
    currentSession,
    jumpToSession,
    createSession,
  };
}
export type DesktopController = ReturnType<typeof useDesktop>;
