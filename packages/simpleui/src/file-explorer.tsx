import { Folder } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileManagerContentPane } from './file-explorer-content.js';
import {
  defaultFileListOpen,
  type FileNode,
  persistSelectedPath,
  readSelectedPath,
} from './file-explorer-model.js';
import { FileExplorerToolbar } from './file-explorer-toolbar.js';
import { FileTreeNode } from './file-explorer-tree.js';
import { useFocusTrap } from './hooks/use-focus-trap.js';
import { onPresentArtifact } from './lib/artifact-presentation.js';
import { dispatchSimplePanel, onPanelActivation, onSimplePanel } from './lib/panel-events.js';
import { type SocketRequestHandle, socketRequest } from './lib/socket-request.js';
import type { SimpleSocket } from './lib/ws.js';

interface FileExplorerProps {
  sessionId?: string | null | undefined;
  socketRef: React.RefObject<SimpleSocket | null>;
}

export function FileExplorer({ socketRef, sessionId }: FileExplorerProps) {
  const [open, setOpen] = useState(false);
  const [fileListOpen, setFileListOpen] = useState(defaultFileListOpen);
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(readSelectedPath);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const presentedRef = useRef(new Set<string>());
  const currentSessionRef = useRef(sessionId);
  currentSessionRef.current = sessionId;
  useFocusTrap(dialogRef, open);
  // In-flight tree/content/save requests. A new request (or an unmount)
  // cancels the previous one so a stale timer can't later fire setState
  // against fresh or unmounted state.
  const pendingTreeRef = useRef<SocketRequestHandle | null>(null);
  const pendingContentRef = useRef<SocketRequestHandle | null>(null);
  const pendingSaveRef = useRef<SocketRequestHandle | null>(null);
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      pendingTreeRef.current?.cancel();
      pendingContentRef.current?.cancel();
      pendingSaveRef.current?.cancel();
      if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isEditing) {
          setIsEditing(false);
          setEditedContent(null);
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isEditing]);

  const loadTree = useCallback(() => {
    setLoading(true);
    setError(null);
    const socket = socketRef.current;
    if (!socket) {
      setLoading(false);
      return;
    }

    pendingTreeRef.current?.cancel();
    const handle = socketRequest({
      socket,
      sendType: 'files.tree',
      payload: {},
      expectType: 'files.tree',
    });
    pendingTreeRef.current = handle;
    void handle.promise.then((payload) => {
      if (pendingTreeRef.current !== handle) return;
      pendingTreeRef.current = null;
      setLoading(false);
      if (!payload) return; // timed out — empty tree renders the failure note
      if (Array.isArray(payload['tree'])) {
        setTree(payload['tree'] as FileNode[]);
      } else {
        setError('Failed to load file tree.');
      }
    });
  }, [socketRef]);

  const loadFileContent = useCallback(
    (filePath: string) => {
      setContentLoading(true);
      setError(null);
      setFileContent(null);
      setEditedContent(null);
      setIsEditing(false);
      setSaved(false);

      const socket = socketRef.current;
      if (!socket) {
        setContentLoading(false);
        return;
      }

      pendingContentRef.current?.cancel();
      const ownerSession = currentSessionRef.current;
      const handle = socketRequest({
        socket,
        sendType: 'files.read',
        payload: { filePath, ...(ownerSession ? { sessionId: ownerSession } : {}) },
        expectType: 'files.read',
        accept: (frame) => {
          const returned = frame.payload as { filePath?: unknown } | undefined;
          return returned?.filePath === filePath;
        },
      });
      pendingContentRef.current = handle;
      void handle.promise.then((payload) => {
        if (pendingContentRef.current !== handle) return;
        pendingContentRef.current = null;
        setContentLoading(false);
        if (currentSessionRef.current !== ownerSession) return;
        if (!payload) return; // timed out — null content renders the failure note
        if (typeof payload['content'] === 'string') {
          setFileContent(payload['content']);
          setEditedContent(null);
        } else {
          setFileContent(null);
          setError(payload['error'] ? String(payload['error']) : 'Failed to read file.');
        }
      });
    },
    [socketRef, sessionId],
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      persistSelectedPath(path);
      loadFileContent(path);
    },
    [loadFileContent],
  );

  useEffect(
    () =>
      onPresentArtifact((artifact) => {
        if (artifact.kind && artifact.kind !== 'text') return;
        if (artifact.sessionId !== sessionId || presentedRef.current.has(artifact.id)) return;
        presentedRef.current.add(artifact.id);
        if (presentedRef.current.size > 128)
          presentedRef.current.delete(presentedRef.current.values().next().value!);
        if (isEditing && editedContent !== fileContent) return;
        if (
          [...document.querySelectorAll('[aria-modal="true"]')].some(
            (element) =>
              element !== dialogRef.current && element.getAttribute('aria-hidden') !== 'true',
          )
        )
          return;
        dispatchSimplePanel('open-file-explorer');
        setOpen(true);
        setFileListOpen(defaultFileListOpen());
        if (artifact.path !== selectedPath) handleSelectFile(artifact.path);
        else if (fileContent === null) loadFileContent(artifact.path);
        if (!tree) loadTree();
      }),
    [
      sessionId,
      isEditing,
      editedContent,
      fileContent,
      selectedPath,
      handleSelectFile,
      loadFileContent,
      tree,
      loadTree,
    ],
  );

  const handleSave = useCallback(() => {
    if (!selectedPath || editedContent == null) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const socket = socketRef.current;
    if (!socket) {
      setSaving(false);
      return;
    }

    if (savedBadgeTimerRef.current) {
      clearTimeout(savedBadgeTimerRef.current);
      savedBadgeTimerRef.current = null;
    }
    pendingSaveRef.current?.cancel();
    const handle = socketRequest({
      socket,
      sendType: 'files.write',
      payload: { filePath: selectedPath, content: editedContent },
      expectType: 'files.written',
      accept: (frame) => {
        const returned = frame.payload as { filePath?: unknown } | undefined;
        return returned?.filePath === selectedPath;
      },
    });
    pendingSaveRef.current = handle;
    void handle.promise.then((payload) => {
      if (pendingSaveRef.current !== handle) return;
      pendingSaveRef.current = null;
      setSaving(false);
      if (!payload) {
        setError('Failed to save file (timed out).');
        return;
      }
      if (payload['success']) {
        setFileContent(editedContent);
        setEditedContent(null);
        setIsEditing(false);
        setSaved(true);
        savedBadgeTimerRef.current = setTimeout(() => {
          setSaved(false);
          savedBadgeTimerRef.current = null;
        }, 2000);
      } else {
        setError(payload['error'] ? String(payload['error']) : 'Failed to save file.');
      }
    });
  }, [selectedPath, editedContent, socketRef]);

  const handleTreeReload = useCallback(() => {
    setTree(null);
    loadTree();
  }, [loadTree]);

  const openExplorer = useCallback(() => {
    setOpen(true);
    setFileListOpen(defaultFileListOpen());
    if (!tree) loadTree();
    if (selectedPath && fileContent === null && !contentLoading) {
      loadFileContent(selectedPath);
    }
  }, [tree, selectedPath, fileContent, contentLoading, loadTree, loadFileContent]);

  useEffect(() => {
    const onOpen = () => openExplorer();
    const unsubOpen = onSimplePanel('open-file-explorer', onOpen);
    const unsubActivation = onPanelActivation((panel) => {
      if (panel !== 'open-file-explorer') {
        setOpen(false);
        setIsEditing(false);
        setEditedContent(null);
      }
    });
    return () => {
      unsubOpen();
      unsubActivation();
    };
  }, [openExplorer]);

  // ── Tab key handling — insert 2 spaces instead of changing focus ──
  // These hooks must live before the `if (!open)` early return so React's
  // hook ordering stays stable across renders.
  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const current = editedContent ?? fileContent ?? '';
        const newValue = current.slice(0, start) + '  ' + current.slice(end);
        setEditedContent(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
      // Ctrl+S / Cmd+S → save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) handleSave();
      }
    },
    [editedContent, fileContent, saving, handleSave],
  );

  // ── Sync scroll position between textarea and highlight overlay ──
  const syncScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const pre = ta.previousElementSibling as HTMLElement | null;
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }, []);

  // Open the panel — load tree on first open
  if (!open) {
    return (
      <button
        type="button"
        className="file-explorer-trigger"
        aria-label="Open file manager"
        title="Project file manager"
        onClick={openExplorer}
      >
        <Folder size={13} aria-hidden="true" />
      </button>
    );
  }

  const content = isEditing ? (editedContent ?? fileContent ?? '') : (fileContent ?? '');
  const fileName = selectedPath?.split(/[\\/]/).pop() ?? '';

  return (
    <>
      <button
        type="button"
        className="settings-overlay"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <aside
        className="file-explorer file-manager"
        role="dialog"
        aria-modal="true"
        aria-label="File manager"
        ref={dialogRef}
        tabIndex={-1}
      >
        <FileExplorerToolbar
          fileListOpen={fileListOpen}
          setFileListOpen={setFileListOpen}
          searchRef={searchRef}
          closeRef={closeRef}
          onReload={handleTreeReload}
          onClose={() => setOpen(false)}
          filter={filter}
          setFilter={setFilter}
        />
        <div className={`file-manager-split${fileListOpen ? '' : ' file-list-collapsed'}`}>
          {fileListOpen && (
            <div className="file-explorer-body">
              {loading && <p className="file-explorer-empty">Loading…</p>}
              {!loading && !tree && !error && (
                <p className="file-explorer-empty">Failed to load file tree.</p>
              )}
              {error && !selectedPath && (
                <p className="file-explorer-empty file-explorer-error">{error}</p>
              )}
              {tree?.map((node) => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  onSelect={handleSelectFile}
                  selectedPath={selectedPath}
                  filter={filter}
                />
              ))}
            </div>
          )}
          <FileManagerContentPane
            selectedPath={selectedPath}
            contentLoading={contentLoading}
            fileContent={fileContent}
            error={error}
            fileName={fileName}
            saved={saved}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            setEditedContent={setEditedContent}
            editorRef={editorRef}
            saving={saving}
            handleSave={handleSave}
            content={content}
            handleEditorKeyDown={handleEditorKeyDown}
            syncScroll={syncScroll}
            setFileListOpen={setFileListOpen}
          />
        </div>
      </aside>
    </>
  );
}
