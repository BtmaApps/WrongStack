'use client';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  Folder,
  Paperclip,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionController } from '../lib/use-session';
import { type FileNode, matchingFiles } from '../lib/workspace-model';
import { MarkdownContent } from './markdown-content';
import { usePresentation } from './presentation-mode';
import { EmptyArtwork } from './vibe-visuals';

export function FileBrowser({
  controller,
  onReference,
}: {
  controller: SessionController;
  onReference: () => void;
}) {
  const { state, connection, loadFileTree } = controller;
  const { mode } = usePresentation();
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const copyOwner = useRef(0);
  const matches = useMemo(() => matchingFiles(state.fileTree, query), [state.fileTree, query]);
  useEffect(() => {
    if (
      state.id &&
      connection === 'open' &&
      !state.treeLoaded &&
      !state.treeLoading &&
      !state.treeError
    )
      loadFileTree();
  }, [state.id, connection, state.treeLoaded, state.treeLoading, state.treeError, loadFileTree]);
  const open = (path: string) =>
    controller.openArtifact({
      id: `file:${path}`,
      sessionId: state.id,
      path,
      title: path.split('/').at(-1) || path,
      kind: /\.(png|jpe?g|webp|gif)$/i.test(path) ? 'image' : 'text',
    });
  const preview = state.preview;
  const lineCount = useMemo(
    () => (preview?.content ? preview.content.split('\n').length : 0),
    [preview?.content],
  );
  useEffect(() => {
    copyOwner.current++;
    setCopyStatus('');
    return () => {
      copyOwner.current++;
      clearTimeout(copyTimer.current);
    };
  }, [preview?.artifact.path]);
  const copyFile = async () => {
    if (!preview || preview.loading || preview.error) return;
    const owner = copyOwner.current;
    try {
      await navigator.clipboard.writeText(preview.content);
      if (owner !== copyOwner.current) return;
      setCopyStatus('Copied file contents.');
    } catch {
      if (owner !== copyOwner.current) return;
      setCopyStatus('Could not copy. Select the text to copy it manually.');
    }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(''), 4000);
  };
  const previewBody = preview && (
    <>
      <div className="file-preview-path" title={preview.artifact.path}>
        <FileCode2 size={13} />
        {preview.artifact.path}
      </div>
      <div className="file-preview-meta">
        <span>
          {preview.artifact.kind === 'image'
            ? 'Image preview'
            : mode === 'simple' && /\.md$/i.test(preview.artifact.path)
              ? 'Markdown preview'
              : mode === 'simple' && /\.html?$/i.test(preview.artifact.path)
                ? 'HTML preview'
                : 'Source'}
        </span>
        <span>Read only</span>
        {mode === 'extended' &&
          !preview.loading &&
          !preview.error &&
          preview.artifact.kind !== 'image' && (
            <span>
              {lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'} ·{' '}
              {preview.content.length.toLocaleString()} characters
            </span>
          )}
      </div>
      {copyStatus && (
        <p className="fine-print" role="status">
          {copyStatus}
        </p>
      )}
      {preview.loading ? (
        <p className="panel-hint" role="status">
          Loading file…
        </p>
      ) : preview.error ? (
        <p className="form-error" role="alert">
          {preview.error}
        </p>
      ) : preview.artifact.kind === 'image' ? (
        <img className="file-preview-image" src={preview.content} alt={preview.artifact.title} />
      ) : /\.html?$/i.test(preview.artifact.path) && mode === 'simple' ? (
        <iframe
          className="html-preview"
          title={`Preview ${preview.artifact.title}`}
          sandbox=""
          srcDoc={preview.content}
        />
      ) : /\.md$/i.test(preview.artifact.path) && mode === 'simple' ? (
        <MarkdownContent text={preview.content} basePath={preview.artifact.path} />
      ) : (
        <pre className="source-preview">
          <code>{preview.content}</code>
        </pre>
      )}
    </>
  );
  return (
    <div className="files-layout" data-selected={Boolean(preview)}>
      <aside className="files-directory" aria-label="Directories and files">
        <div className="panel-section-heading">
          <h2>Project files</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh project files"
            disabled={state.treeLoading || connection !== 'open'}
            onClick={loadFileTree}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <label className="file-search">
          <Search size={14} />
          <input
            aria-label="Search project files"
            placeholder="Find a file…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {state.treeLoading && (
          <p className="panel-hint" role="status">
            Reading the project…
          </p>
        )}
        {state.treeError && (
          <p className="form-error" role="alert">
            {state.treeError}
          </p>
        )}
        <nav className="file-tree" aria-label="Project file tree">
          {query
            ? matches.slice(0, 100).map((node) => (
                <button
                  type="button"
                  aria-current={preview?.artifact.path === node.path ? 'true' : undefined}
                  className="tree-row"
                  key={node.path}
                  disabled={connection !== 'open'}
                  onClick={() => open(node.path)}
                >
                  <FileCode2 size={14} />
                  <span>{node.path}</span>
                </button>
              ))
            : state.fileTree.map((node) => (
                <TreeBranch
                  key={node.path}
                  node={node}
                  depth={0}
                  selected={preview?.artifact.path || ''}
                  onOpen={open}
                  disabled={connection !== 'open'}
                />
              ))}
        </nav>
        {!state.treeLoading && state.treeLoaded && !matches.length && (
          <p className="panel-hint">
            {query ? 'No files match this search.' : 'No project files found.'}
          </p>
        )}
        {query && matches.length > 100 && (
          <p className="panel-hint">
            Showing the first 100 of {matches.length} matches. Narrow your search.
          </p>
        )}
      </aside>
      {!preview && (
        <section className="file-content file-empty">
          <EmptyArtwork kind="files" />
          <h3>Choose a file</h3>
          <p>Select a project file from the directory on the right.</p>
        </section>
      )}
      {preview && (
        <section className="file-content artifact-preview file-preview">
          <div className="panel-section-heading">
            <button
              type="button"
              className="secondary-button file-back"
              aria-label="Browse files"
              onClick={controller.closeArtifact}
            >
              <ArrowLeft size={14} /> Files
            </button>
            <h3 title={preview.artifact.title}>{preview.artifact.title}</h3>
            <div>
              {preview.artifact.kind !== 'image' && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copy file contents"
                  title="Copy file contents"
                  disabled={preview.loading || Boolean(preview.error)}
                  onClick={() => void copyFile()}
                >
                  {copyStatus === 'Copied file contents.' ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label="Reference in message"
                title="Add file to your next message"
                onClick={() => {
                  controller.referenceFile(preview.artifact.path);
                  onReference();
                }}
              >
                <Paperclip size={14} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Close selected file"
                onClick={controller.closeArtifact}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          {previewBody}
        </section>
      )}
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  selected,
  onOpen,
  disabled,
}: {
  node: FileNode;
  depth: number;
  selected: string;
  onOpen: (path: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const directory = node.type === 'directory';
  return (
    <div>
      <button
        type="button"
        aria-expanded={directory ? open : undefined}
        aria-current={!directory && selected === node.path ? 'true' : undefined}
        className={`tree-row ${open ? 'expanded' : ''}`}
        style={{ paddingLeft: 7 + depth * 13 }}
        disabled={disabled}
        onClick={() => (directory ? setOpen((value) => !value) : onOpen(node.path))}
      >
        {directory ? (
          <>
            <ChevronRight size={11} />
            <Folder size={14} />
          </>
        ) : (
          <FileCode2 size={14} />
        )}
        <span title={node.path}>{node.name}</span>
      </button>
      {directory && open && (
        <div className="tree-group">
          {node.children.map((child) => (
            <TreeBranch
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onOpen={onOpen}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
