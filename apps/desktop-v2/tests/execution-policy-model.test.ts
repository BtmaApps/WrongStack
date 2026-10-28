import { describe, expect, it } from 'vitest';
import {
  ALL_DESTRUCTIVE_KINDS,
  LOCKED_DESTRUCTIVE_KINDS,
} from '../../../packages/core/src/security/yolo-risk';
import {
  confirmationKinds,
  confirmationMap,
  executionMode,
  executionModeValues,
  lockedConfirmationKinds,
  prepareExecutionPolicyPatch,
} from '../src/execution-policy-model';
import { prepareSettingsPatch } from '../src/settings-save-model';

describe('Execution confirmation policy', () => {
  it('matches canonical destructive categories and protects the two locked kinds', () => {
    expect(confirmationKinds.map((row) => row.kind)).toEqual([...ALL_DESTRUCTIVE_KINDS]);
    expect([...lockedConfirmationKinds]).toEqual([...LOCKED_DESTRUCTIVE_KINDS]);
    expect(
      confirmationMap({
        publish: false,
        'agent-state': false,
        'credential-bind': false,
        future: true,
      }),
    ).toMatchObject({
      publish: false,
      'agent-state': true,
      'credential-bind': true,
      'disk-wipe': true,
      future: true,
    });
  });
  it('treats the two permission mode flags as one choice and refuses cross-field races', () => {
    const base = { yolo: true, yoloPlus: false },
      draft = { yolo: true, yoloPlus: true },
      current = { yolo: false, yoloPlus: false };
    expect(() =>
      prepareExecutionPolicyPatch(base, draft, current, prepareSettingsPatch(base, draft, current)),
    ).toThrow(/mode changed elsewhere/);
    expect(prepareExecutionPolicyPatch(base, draft, base, { yoloPlus: true })).toEqual({
      yolo: true,
      yoloPlus: true,
    });
    expect(prepareExecutionPolicyPatch(draft, { yolo: false, yoloPlus: false }, draft, {})).toEqual(
      { yolo: false, yoloPlus: false },
    );
    expect(() =>
      prepareExecutionPolicyPatch(base, { yolo: false, yoloPlus: true }, base, {}),
    ).toThrow(/requires YOLO/);
    expect(executionModeValues('yolo-plus')).toEqual(draft);
    expect(executionMode(draft)).toBe('yolo-plus');
    expect(() => executionModeValues('unknown' as never)).toThrow(/valid tool confirmation mode/);
  });
  it('preserves independent confirmation edits while refusing same-category conflicts', () => {
    const base = { yoloConfirm: confirmationMap({}) },
      draft = { yoloConfirm: { ...base.yoloConfirm, publish: false } },
      current = { yoloConfirm: { ...base.yoloConfirm, 'bulk-delete': false } };
    expect(
      prepareExecutionPolicyPatch(base, draft, current, prepareSettingsPatch(base, draft, current)),
    ).toHaveProperty('yoloConfirm', confirmationMap({ publish: false, 'bulk-delete': false }));
    const original = { yoloConfirm: { publish: true } },
      edited = { yoloConfirm: { publish: false } },
      deleted = { yoloConfirm: {} };
    expect(() => prepareSettingsPatch(original, edited, deleted)).toThrow(/changed elsewhere/);
  });
});
