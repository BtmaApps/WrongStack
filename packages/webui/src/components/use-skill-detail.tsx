import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useWebSocket } from '@/hooks/useWebSocket';
import { i18n, useAppTranslation } from '@/i18n';
import { showPanel } from '@/lib/view-navigation';
import { useUIStore } from '@/stores/ui-store';

export function useSkillDetail({ className }: { className?: string }) {
  const { t } = useAppTranslation();
  const { client } = useWebSocket();
  const skillsState = useUIStore((s) => s.skillsState);
  const setSkillsState = useUIStore((s) => s.setSkillsState);

  const selectedSkill = skillsState.selectedSkill;
  const navHistory = skillsState.navHistory;
  const historyIndex = skillsState.historyIndex;

  const [skillContent, setSkillContent] = useState<SkillContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Scroll-position hook must be called unconditionally — calling it inside
  // JSX within the isEditing/skillContent/contentError ternary violates the
  // Rules of Hooks (React error 310) when skillContent toggles between null
  // and non-null.
  const skillScrollRef = useScrollPosition<HTMLDivElement>('skill-detail', Boolean(skillContent));

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState(false);

  // Draft state
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const lastSavedDraftRef = useRef<string>('');

  // Update check state
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [updateResult, setUpdateResult] = useState<{
    updated: Array<{ name: string; oldRef: string; newRef: string }>;
    unchanged: string[];
    errors: Array<{ name: string; error: string }>;
  } | null>(null);

  // Copy source URL feedback
  const [copiedSourceUrl, setCopiedSourceUrl] = useState(false);

  // Uninstall state
  const [uninstallConfirmSkill, setUninstallConfirmSkill] = useState<typeof selectedSkill>(null);
  const [uninstalling, setUninstalling] = useState(false);

  // Skills list (for finding related skills)
  const [skills, setSkills] = useState<
    Array<{
      name: string;
      description: string;
      version: string;
      source: string;
      sourceUrl: string;
      ref: string;
      path: string;
      trigger: string;
      scope: string[];
    }>
  >([]);
  const skillsStateRef = useRef(skillsState);
  skillsStateRef.current = skillsState;

  const isNavigatingBack = useRef(false);

  // Edit stats
  const editStats = useMemo(() => {
    if (!editContent) return { lines: 0, words: 0, chars: 0 };
    const lines = editContent.split('\n').length;
    const words = editContent.trim() ? editContent.trim().split(/\s+/).length : 0;
    const chars = editContent.length;
    return { lines, words, chars };
  }, [editContent]);

  // localStorage warning
  const charsWarning = useMemo((): null | {
    level: 'warn' | 'critical';
    used: number;
    limit: number;
  } => {
    if (!editContent) return null;
    const LOCALSTORAGE_LIMIT = 5 * 1024 * 1024;
    const SOFT_LIMIT = 4 * 1024 * 1024;
    const sizeBytes = new Blob([editContent]).size;
    if (sizeBytes >= LOCALSTORAGE_LIMIT)
      return { level: 'critical', used: sizeBytes, limit: LOCALSTORAGE_LIMIT };
    if (sizeBytes >= SOFT_LIMIT)
      return { level: 'warn', used: sizeBytes, limit: LOCALSTORAGE_LIMIT };
    return null;
  }, [editContent]);

  // Clear draftSavedAt after 2 seconds
  useEffect(() => {
    if (!draftSavedAt) return;
    const t = setTimeout(() => setDraftSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [draftSavedAt]);

  // Auto-save draft to localStorage every 5 seconds while editing
  useEffect(() => {
    if (!editMode || !selectedSkill) return;
    const interval = setInterval(() => {
      if (editContent && editContent !== lastSavedDraftRef.current) {
        lastSavedDraftRef.current = editContent;
        localStorage.setItem(
          `skills_draft_${selectedSkill.name}`,
          JSON.stringify({ content: editContent, savedAt: Date.now() }),
        );
        setDraftSavedAt(Date.now());
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [editMode, editContent, selectedSkill]);

  // Restore draft from localStorage
  useEffect(() => {
    if (!selectedSkill || !editMode) return;
    const raw = localStorage.getItem(`skills_draft_${selectedSkill.name}`);
    if (raw) {
      try {
        const { content } = JSON.parse(raw) as { content: string; savedAt: number };
        if (content && content !== editContent && content !== lastSavedDraftRef.current) {
          setEditContent(content);
          lastSavedDraftRef.current = content;
          setDraftRestored(true);
        }
      } catch {
        // ignore malformed draft
      }
    }
  }, [selectedSkill?.name, editMode]);

  // Fetch skill content when selected skill changes
  useEffect(() => {
    if (!client || !selectedSkill) return;
    setContentLoading(true);
    setSkillContent(null);
    setContentError(null);

    // Timeout after 10 seconds
    const timeoutId = setTimeout(() => {
      setContentLoading(false);
      setContentError(i18n.t('activity:skillDetail.timeoutError'));
    }, 10000);

    const handleSkillsContent = (msg: unknown) => {
      clearTimeout(timeoutId);
      const m = msg as {
        payload: {
          name: string;
          body: string;
          path: string;
          source: string;
          relatedFiles: string[];
          references: string[];
          error?: string;
        };
      };
      if (m.payload.error) {
        setContentError(m.payload.error);
      } else if (m.payload.name) {
        setSkillContent(m.payload);
      }
      setContentLoading(false);
    };

    const handleSkillsUpdated = (msg: unknown) => {
      const m = msg as {
        payload: {
          success: boolean;
          error: string | null;
          updated?: Array<{ name: string; oldRef: string; newRef: string }>;
          unchanged?: string[];
          errors?: Array<{ name: string; error: string }>;
        };
      };
      setCheckingForUpdates(false);
      const currentState = skillsStateRef.current;
      if (m.payload.success) {
        const newKnownRefs = { ...currentState.knownRefs };
        for (const u of m.payload.updated ?? []) {
          newKnownRefs[u.name] = u.newRef;
        }
        setSkillsState({
          ...currentState,
          knownRefs: newKnownRefs,
          updateAvailableCount: 0,
        });
        setUpdateResult({
          updated: m.payload.updated ?? [],
          unchanged: m.payload.unchanged ?? [],
          errors: m.payload.errors ?? [],
        });
        client.send({ type: 'skills.list' }, { echoToChat: false });
      } else {
        setUpdateResult({
          updated: [],
          unchanged: [],
          errors: [
            { name: '', error: m.payload.error ?? i18n.t('activity:skillDetail.updateFailed') },
          ],
        });
      }
    };

    const handleSkillsList = (msg: unknown) => {
      const m = msg as { payload: { enabled: boolean; skills: typeof skills } };
      if (m.payload.skills) setSkills(m.payload.skills);
    };

    client.on('skills.content', handleSkillsContent as (msg: unknown) => void);
    client.on('skills.updated', handleSkillsUpdated as (msg: unknown) => void);
    client.on('skills.list', handleSkillsList as (msg: unknown) => void);
    client.send({
      type: 'skills.content',
      payload: { name: selectedSkill.name, source: selectedSkill.source },
    });

    return () => {
      clearTimeout(timeoutId);
      client.off('skills.content', handleSkillsContent as (msg: unknown) => void);
      client.off('skills.updated', handleSkillsUpdated as (msg: unknown) => void);
      client.off('skills.list', handleSkillsList as (msg: unknown) => void);
    };
  }, [client, selectedSkill?.name, selectedSkill?.source]);

  // Reset edit mode when navigating away
  useEffect(() => {
    if (editMode) {
      setEditMode(false);
      setEditContent('');
      setEditError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkill?.name]);

  // Find a skill by name (case-insensitive)
  const findSkillByName = useCallback(
    (name: string) => skills.find((s) => s.name.toLowerCase() === name.toLowerCase()),
    [skills],
  );

  // Navigate to a skill by name
  const handleNavigateToSkill = useCallback(
    (name: string) => {
      const skill = findSkillByName(name);
      if (skill) {
        isNavigatingBack.current = false;
        const newHistory = navHistory.slice(0, historyIndex + 1);
        newHistory.push(skill);
        setSkillsState({
          ...skillsStateRef.current,
          selectedSkill: skill,
          navHistory: newHistory,
          historyIndex: newHistory.length - 1,
        });
        setEditMode(false);
        setEditContent('');
        setUpdateResult(null);
      }
    },
    [findSkillByName, navHistory, historyIndex, setSkillsState],
  );

  // Breadcrumb navigation
  const handleBreadcrumbBack = useCallback(() => {
    if (historyIndex <= 0) return;
    isNavigatingBack.current = true;
    const newIndex = historyIndex - 1;
    const skill = navHistory[newIndex];
    setSkillsState({
      ...skillsStateRef.current,
      selectedSkill: skill,
      historyIndex: newIndex,
    });
    setEditMode(false);
    setEditContent('');
    setUpdateResult(null);
  }, [historyIndex, navHistory, setSkillsState]);

  const handleBreadcrumbForward = useCallback(() => {
    if (historyIndex >= navHistory.length - 1) return;
    isNavigatingBack.current = true;
    const newIndex = historyIndex + 1;
    const skill = navHistory[newIndex];
    setSkillsState({
      ...skillsStateRef.current,
      selectedSkill: skill,
      historyIndex: newIndex,
    });
    setEditMode(false);
    setEditContent('');
    setUpdateResult(null);
  }, [historyIndex, navHistory, setSkillsState]);

  // Close detail and go back to chat
  const handleClose = useCallback(() => {
    showPanel('chat');
  }, []);

  // Start editing
  const handleStartEdit = useCallback(() => {
    if (!skillContent) return;
    setEditContent(skillContent.body);
    lastSavedDraftRef.current = skillContent.body;
    setDraftRestored(false);
    setEditError(null);
    setEditMode(true);
    setSplitPreview(false);
  }, [skillContent]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditContent('');
    setEditError(null);
    setSplitPreview(false);
    setDraftRestored(false);
    if (selectedSkill) localStorage.removeItem(`skills_draft_${selectedSkill.name}`);
  }, [selectedSkill]);

  // Discard draft
  const handleDiscardDraft = useCallback(() => {
    if (!selectedSkill || !skillContent) return;
    setDraftRestored(false);
    setEditContent(skillContent.body);
    lastSavedDraftRef.current = skillContent.body;
    if (selectedSkill) localStorage.removeItem(`skills_draft_${selectedSkill.name}`);
  }, [selectedSkill, skillContent]);

  // Save edited content
  const handleSaveEdit = useCallback(() => {
    if (!client || !selectedSkill || !editContent.trim()) return;
    setEditSaving(true);
    setEditError(null);

    const handler = (msg: unknown) => {
      const m = msg as { payload: { success: boolean; error: string | null } };
      setEditSaving(false);
      if (m.payload.success) {
        lastSavedDraftRef.current = '';
        localStorage.removeItem(`skills_draft_${selectedSkill.name}`);
        setDraftRestored(false);
        setEditMode(false);
        client.send({
          type: 'skills.content',
          payload: { name: selectedSkill.name, source: selectedSkill.source },
        });
        client.send({ type: 'skills.list' }, { echoToChat: false });
      } else {
        setEditError(m.payload.error ?? i18n.t('activity:skillDetail.saveFailed'));
      }
      client.off('skills.edited', handler as (msg: unknown) => void);
    };

    client.on('skills.edited', handler as (msg: unknown) => void);
    client.editSkill(selectedSkill.name, editContent);
  }, [client, selectedSkill, editContent]);

  // Check for updates
  const handleCheckForUpdates = useCallback(() => {
    if (!client || !selectedSkill) return;
    setCheckingForUpdates(true);
    setUpdateResult(null);
    client.checkForUpdates(selectedSkill.name, selectedSkill.source === 'user');
  }, [client, selectedSkill]);

  // Copy source URL
  const handleCopySourceUrl = useCallback(() => {
    if (!selectedSkill?.sourceUrl) return;
    navigator.clipboard.writeText(selectedSkill.sourceUrl).then(() => {
      setCopiedSourceUrl(true);
      setTimeout(() => setCopiedSourceUrl(false), 2000);
    });
  }, [selectedSkill]);

  // Export single skill
  const handleExportSkill = useCallback(() => {
    if (!skillContent?.body) return;
    const blob = new Blob([skillContent.body], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skillContent.name.replace(/\//g, '_')}-SKILL.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [skillContent]);

  // Uninstall skill
  const handleUninstallSkill = useCallback(
    async (skill: typeof selectedSkill) => {
      if (!client || !skill) return;
      setUninstalling(true);

      const handler = (msg: unknown) => {
        const m = msg as { payload: { success: boolean; error: string | null } };
        setUninstalling(false);
        if (m.payload.success) {
          setUninstallConfirmSkill(null);
          client.send({ type: 'skills.list' }, { echoToChat: false });
          handleClose();
        } else {
          setEditError(m.payload.error ?? i18n.t('activity:skillDetail.uninstallFailed'));
        }
        client.off('skills.uninstalled', handler as (msg: unknown) => void);
      };

      client.on('skills.uninstalled', handler as (msg: unknown) => void);
      client.uninstallSkill(skill.name, skill.source === 'user');
    },
    [client, handleClose],
  );
  return {
    selectedSkill,
    t,
    handleClose,
    className,
    handleCopySourceUrl,
    copiedSourceUrl,
    updateResult,
    handleCheckForUpdates,
    checkingForUpdates,
    editMode,
    handleExportSkill,
    handleStartEdit,
    setUninstallConfirmSkill,
    navHistory,
    handleBreadcrumbBack,
    historyIndex,
    handleBreadcrumbForward,
    isNavigatingBack,
    setSkillsState,
    skillsStateRef,
    setEditMode,
    setEditContent,
    setUpdateResult,
    skillContent,
    findSkillByName,
    handleNavigateToSkill,
    contentLoading,
    editStats,
    charsWarning,
    draftSavedAt,
    draftRestored,
    editError,
    handleDiscardDraft,
    handleCancelEdit,
    setSplitPreview,
    splitPreview,
    handleSaveEdit,
    editSaving,
    editContent,
    skillScrollRef,
    contentError,
    client,
    setContentLoading,
    setContentError,
    uninstallConfirmSkill,
    uninstalling,
    handleUninstallSkill,
  };
}

export interface SkillContent {
  name: string;
  body: string;
  path: string;
  source: string;
  relatedFiles: string[];
  references: string[];
}
