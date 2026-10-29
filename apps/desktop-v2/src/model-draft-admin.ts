import { record } from './engine-values';
import { modelDraftKey } from './model-draft-key';

/** Ownership summary of a parked model-editor draft, as listed by native storage. */
export interface ListedModelDraft {
  formKey: string;
  revision: number;
  updatedAt: number;
  bytes: number;
  supported: boolean;
  providerId: string | null;
  profileId: string | null;
  profileName: string | null;
  originalId: string | null;
  modelId: string | null;
}
export type ModelDraftStanding =
  | 'editable'
  | 'orphaned'
  | 'other-profile'
  | 'unassigned'
  | 'unverified';
export interface ClassifiedModelDraft extends ListedModelDraft {
  standing: ModelDraftStanding;
  /** True when its provider connection is saved in the current profile. */
  providerSaved: boolean;
}
export interface ModelDraftListing {
  drafts: ListedModelDraft[];
  limit: number;
  truncated: boolean;
}

const nullableText = (value: unknown) => value === null || typeof value === 'string';
export function readModelDraftListing(value: unknown): ModelDraftListing {
  const listing = record(value);
  const drafts = listing['drafts'];
  if (
    !Array.isArray(drafts) ||
    typeof listing['truncated'] !== 'boolean' ||
    !Number.isSafeInteger(listing['limit'])
  )
    throw Error('Native storage returned an unsupported model draft listing.');
  return {
    limit: listing['limit'] as number,
    truncated: listing['truncated'],
    drafts: drafts.map((value) => {
      const row = record(value);
      if (
        typeof row['formKey'] !== 'string' ||
        !/^model-editor:[a-f0-9]{64}$/.test(row['formKey']) ||
        !['revision', 'updatedAt', 'bytes'].every(
          (key) => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0,
        ) ||
        typeof row['supported'] !== 'boolean' ||
        !['providerId', 'profileId', 'profileName', 'originalId', 'modelId'].every((key) =>
          nullableText(row[key]),
        )
      )
        throw Error('Native storage returned an unsupported model draft listing.');
      return row as unknown as ListedModelDraft;
    }),
  };
}

/**
 * Decide what the current profile may do with each listed draft. Ownership is
 * trusted only when the stored owner hashes back to the row's own storage key.
 */
export async function classifyModelDrafts(
  drafts: ListedModelDraft[],
  profileId: string,
  savedProviders: readonly string[],
): Promise<ClassifiedModelDraft[]> {
  return Promise.all(
    drafts.map(async (draft): Promise<ClassifiedModelDraft> => {
      const providerSaved = !!draft.providerId && savedProviders.includes(draft.providerId);
      const owner = draft.profileId ?? undefined;
      let verified = draft.supported && !!draft.providerId;
      if (verified && owner !== undefined && !/^[a-f0-9]{64}$/.test(owner)) verified = false;
      if (verified && (await modelDraftKey(draft.providerId!, owner)) !== draft.formKey)
        verified = false;
      const standing: ModelDraftStanding = !verified
        ? 'unverified'
        : owner === undefined
          ? 'unassigned'
          : owner !== profileId
            ? 'other-profile'
            : providerSaved
              ? 'editable'
              : 'orphaned';
      return { ...draft, standing, providerSaved };
    }),
  );
}

/** Drafts the editor cannot reach on its own come first; reachable ones last. */
export const standingOrder: ModelDraftStanding[] = [
  'orphaned',
  'unassigned',
  'other-profile',
  'unverified',
  'editable',
];
export const standingLabel: Record<ModelDraftStanding, string> = {
  orphaned: 'Connection removed',
  unassigned: 'Earlier unassigned draft',
  'other-profile': 'Another profile',
  unverified: 'Unrecognized draft',
  editable: 'This profile',
};
export function standingDetail(draft: ClassifiedModelDraft): string {
  switch (draft.standing) {
    case 'orphaned':
      return 'Its provider connection is no longer saved in this profile. Keep it to resume after re-adding the same connection, or discard it.';
    case 'unassigned':
      return draft.providerSaved
        ? 'This draft predates profile ownership. Open its provider to review and copy it into this profile.'
        : 'This draft predates profile ownership and its provider is not saved here, so it cannot be copied.';
    case 'other-profile':
      return 'Owned by a profile this runtime has not opened. It cannot be edited here, and this window cannot confirm whether that profile still exists.';
    case 'unverified':
      return 'Its stored owner is missing, malformed or does not match its storage key, so it is never loaded into an editor.';
    case 'editable':
      return 'Open its provider to resume, compare or discard it in the editor.';
  }
}
/** Only drafts the editor cannot already manage are discarded from here. */
export function canDiscardHere(draft: ClassifiedModelDraft): boolean {
  return (
    draft.standing === 'orphaned' ||
    draft.standing === 'other-profile' ||
    draft.standing === 'unverified' ||
    (draft.standing === 'unassigned' && !draft.providerSaved)
  );
}
export function canOpenProvider(draft: ClassifiedModelDraft): boolean {
  return draft.providerSaved && (draft.standing === 'editable' || draft.standing === 'unassigned');
}

export interface ModelDraftAdminStorage {
  list(): Promise<unknown>;
  save(formKey: string, value: null, expectedRevision: number): Promise<{ revision: number }>;
}
/** Revision-checked removal: a draft written after it was listed is never erased. */
export async function discardListedDraft(
  storage: ModelDraftAdminStorage,
  draft: ListedModelDraft,
): Promise<void> {
  let reply: { revision: number };
  try {
    reply = await storage.save(draft.formKey, null, draft.revision);
  } catch (error) {
    if (String(error).includes('DRAFT_CONFLICT'))
      throw Error('This draft changed after it was listed. Refresh and review it again.');
    throw error;
  }
  if (reply.revision !== draft.revision + 1)
    throw Error('Native storage did not acknowledge removing this draft. Refresh before retrying.');
}
