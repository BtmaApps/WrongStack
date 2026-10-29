import { DurableFormDraft } from './durable-form-draft';
import { projectFormDraftStorage } from './platform';
import {
  type RosterDocumentDraft,
  type RosterDocumentOwner,
  rosterDocumentCodec,
  rosterDocumentDraftKey,
} from './roster-document-draft';
import { type RosterInputDraft, rosterInputCodec } from './roster-input-draft';
import {
  type RosterRuntimeDraft,
  rosterRuntimeCodec,
  rosterRuntimeDraftKey,
} from './roster-runtime-draft';

const drafts = new Map<string, DurableFormDraft<RosterDocumentDraft>>();
/** One durable controller per project role document in this window. */
export function rosterDocumentDraft(projectId: string, owner: RosterDocumentOwner) {
  const id = JSON.stringify([projectId, owner.role, owner.kind, owner.skill]);
  let draft = drafts.get(id);
  if (!draft) {
    const key = rosterDocumentDraftKey(owner);
    draft = new DurableFormDraft(
      {
        get: async () => projectFormDraftStorage(projectId, await key).get(),
        save: async (value, expected) =>
          projectFormDraftStorage(projectId, await key).save(value, expected),
      },
      rosterDocumentCodec(owner),
    );
    drafts.set(id, draft);
  }
  return draft;
}

const runtimes = new Map<string, DurableFormDraft<RosterRuntimeDraft>>();
/** One durable controller per project role runtime override in this window. */
export function rosterRuntimeDraft(projectId: string, role: string) {
  const id = JSON.stringify([projectId, role]);
  let draft = runtimes.get(id);
  if (!draft) {
    const key = rosterRuntimeDraftKey(role);
    draft = new DurableFormDraft(
      {
        get: async () => projectFormDraftStorage(projectId, await key).get(),
        save: async (value, expected) =>
          projectFormDraftStorage(projectId, await key).save(value, expected),
      },
      rosterRuntimeCodec(role),
    );
    runtimes.set(id, draft);
  }
  return draft;
}

const inputs = new Map<string, DurableFormDraft<RosterInputDraft>>();
/** Unsent per-role roster text inputs for one project in this window. */
export function rosterInputDraft(projectId: string) {
  let draft = inputs.get(projectId);
  if (!draft) {
    draft = new DurableFormDraft(
      projectFormDraftStorage(projectId, 'roster-inputs'),
      rosterInputCodec,
    );
    inputs.set(projectId, draft);
  }
  return draft;
}
