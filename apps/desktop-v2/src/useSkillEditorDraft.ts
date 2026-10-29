import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DurableFormDraft, type FormDraftSnapshot } from './durable-form-draft';
import type { EngineCommand } from './engine-operations';
import { verifyModelProfile } from './ModelCatalogProfile';
import { request } from './platform';
import { type SkillEditorDraft, skillEditorCodec, skillEditorKey } from './skill-editor-draft';

export type SkillDraftScope = { kind: 'project'; projectId: string } | { kind: 'profile' };
const drafts = new Map<string, DurableFormDraft<SkillEditorDraft>>();

/**
 * Durable SKILL.md edits. Project skills live in that project's native storage;
 * profile skills are keyed by the verified runtime profile and stay unavailable
 * (editing still works, without recovery) when no identity is reported.
 */
export function useSkillEditorDraft(
  command: EngineCommand,
  scope: SkillDraftScope,
  skill: { name: string; source: string } | null,
) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState('');
  useEffect(() => {
    if (scope.kind !== 'profile') return;
    let active = true;
    void verifyModelProfile(command)
      .then((profile) => {
        if (active) setProfileId(profile.id);
      })
      .catch((error) => {
        if (active) setIdentityError(String(error instanceof Error ? error.message : error));
      });
    return () => {
      active = false;
    };
  }, [command, scope.kind]);
  const projectId = scope.kind === 'project' ? scope.projectId : '';
  const controller = useMemo(() => {
    if (!skill) return null;
    if (scope.kind === 'profile' && !profileId) return null;
    const owner = {
      name: skill.name,
      source: skill.source,
      ...(scope.kind === 'profile' && profileId ? { profileId } : {}),
    };
    const id = JSON.stringify([
      scope.kind,
      projectId,
      owner.profileId ?? '',
      owner.source,
      owner.name,
    ]);
    let draft = drafts.get(id);
    if (!draft) {
      const formKey = skillEditorKey(owner);
      const [getMethod, saveMethod] =
        scope.kind === 'project'
          ? ['form-draft.get', 'form-draft.save']
          : ['profile-draft.get', 'profile-draft.save'];
      const place = scope.kind === 'project' ? { projectId } : {};
      draft = new DurableFormDraft(
        {
          get: async () =>
            request<FormDraftSnapshot>(getMethod, { ...place, formKey: await formKey }),
          save: async (value, expectedRevision) =>
            (
              await request<{ revision: number }>(saveMethod, {
                ...place,
                formKey: await formKey,
                value,
                expectedRevision,
              })
            ).revision,
        },
        skillEditorCodec(owner),
      );
      drafts.set(id, draft);
    }
    return draft;
  }, [skill?.name, skill?.source, scope.kind, projectId, profileId]);
  return {
    controller,
    unavailable: scope.kind === 'profile' && !profileId ? identityError || 'pending' : '',
  };
}

const empty = () => () => {};
const none = () => null;
export function useDraftState<T>(controller: DurableFormDraft<T> | null) {
  return useSyncExternalStore(controller?.subscribe ?? empty, controller?.snapshot ?? none);
}
