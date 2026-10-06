import { Check, FileEdit, Folder, PanelLeftOpen, Save } from 'lucide-react';
import type React from 'react';
import { highlightContent } from './file-explorer-highlight.js';

/** Right-hand pane: file viewer / overlay-highlighted editor with edit, cancel and save. */
export function FileManagerContentPane({
  selectedPath,
  contentLoading,
  fileContent,
  error,
  fileName,
  saved,
  isEditing,
  setIsEditing,
  setEditedContent,
  editorRef,
  saving,
  handleSave,
  content,
  handleEditorKeyDown,
  syncScroll,
  setFileListOpen,
}: {
  selectedPath: string | null;
  contentLoading: boolean;
  fileContent: string | null;
  error: string | null;
  fileName: string;
  saved: boolean;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  setEditedContent: (content: string | null) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  saving: boolean;
  handleSave: () => void;
  content: string;
  handleEditorKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  syncScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  setFileListOpen: (open: boolean) => void;
}) {
  return (
    <div className="file-manager-content">
      {selectedPath && contentLoading && <div className="file-manager-empty">Loading…</div>}
      {selectedPath && !contentLoading && fileContent === null && !error && (
        <div className="file-manager-empty">Failed to load file.</div>
      )}
      {selectedPath && error && (
        <div className="file-manager-empty file-explorer-error">{error}</div>
      )}
      {selectedPath && !contentLoading && fileContent != null && (
        <>
          <div className="file-manager-content-head">
            <code title={selectedPath}>{fileName}</code>
            <span className="file-manager-content-path">{selectedPath}</span>
            <div className="file-manager-content-actions">
              {saved && (
                <span className="file-manager-saved-badge">
                  <Check size={12} aria-hidden="true" />
                  Saved
                </span>
              )}
              {!isEditing ? (
                <button
                  type="button"
                  className="file-manager-edit-btn"
                  onClick={() => {
                    setIsEditing(true);
                    setEditedContent(fileContent);
                    setTimeout(() => editorRef.current?.focus(), 50);
                  }}
                >
                  <FileEdit size={12} aria-hidden="true" />
                  Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="file-manager-cancel-btn"
                    onClick={() => {
                      setIsEditing(false);
                      setEditedContent(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="file-manager-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save size={12} aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="file-manager-editor-wrap">
            {isEditing ? (
              <div className="file-manager-editor-container">
                <pre className="file-manager-editor-highlight" aria-hidden="true">
                  {highlightContent(content, selectedPath)}
                  {'\n'}
                </pre>
                <textarea
                  ref={editorRef}
                  className="file-manager-editor"
                  value={content}
                  onChange={(e) => setEditedContent(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={syncScroll}
                  spellCheck={false}
                  aria-label="File editor"
                />
              </div>
            ) : (
              <pre className="file-manager-viewer">{fileContent}</pre>
            )}
          </div>
        </>
      )}
      {!selectedPath && (
        <div className="file-manager-empty file-manager-welcome">
          <Folder size={22} aria-hidden="true" />
          <strong>Open a project file</strong>
          <p>Choose a file from the project tree to preview or edit it here.</p>
          <button
            type="button"
            className="file-manager-open-list-btn"
            onClick={() => setFileListOpen(true)}
          >
            <PanelLeftOpen size={13} aria-hidden="true" />
            Browse project files
          </button>
        </div>
      )}
    </div>
  );
}
