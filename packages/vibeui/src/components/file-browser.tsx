'use client';

import { ChevronRight, FileCode2, Folder, Paperclip, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SessionController } from '../lib/use-session';
import { type FileNode, matchingFiles } from '../lib/workspace-model';
import { MarkdownContent } from './markdown-content';

export function FileBrowser({
  controller,
  onReference,
}: {
  controller: SessionController;
  onReference: () => void;
}) {
  const { state, connection, loadFileTree } = controller;
  const [query, setQuery] = useState('');
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
  const previewBody = preview && (
    <>
      <div className="file-preview-path" title={preview.artifact.path}>
        {preview.artifact.path}
      </div>
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
      ) : /\.md$/i.test(preview.artifact.path) ? (
        <MarkdownContent text={preview.content} />
      ) : (
        <pre className="source-preview">
          <code>{preview.content}</code>
        </pre>
      )}
    </>
  );
  return (
    <div className="files-layout">
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
          <FileCode2 size={28} />
          <h3>Choose a file</h3>
          <p>Select a project file from the directory on the right.</p>
        </section>
      )}
      {preview && (
        <section className="file-content artifact-preview file-preview">
          <div className="panel-section-heading">
            <h3>{preview.artifact.title}</h3>
            <div>
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
