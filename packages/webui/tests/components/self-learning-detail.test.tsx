import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomRosterStats } from '../../src/components/agent-roster-data';
import { SelfLearningDetail } from '../../src/components/self-learning/SelfLearningDetail';
import type { RoleSkill } from '../../src/components/self-learning/types';
import { i18n } from '../../src/i18n';

const noop = () => {};

// The badges are identified by their tooltips rather than their text: the panel
// copy itself contains the word "loaded", so a text query matches prose too.
const LOADED_TITLE = 'Ranked high enough to be loaded into a spawn of this role';
const ADDENDUM_TITLE =
  'This role lacks the tools the skill needs; only its project addendum is delivered';
const CANT_LOAD_TITLE = 'This role lacks the tools the skill needs, so it is never loaded';

function stats(): CustomRosterStats {
  return {
    role: 'reviewer',
    exists: true,
    entryCount: 12,
    totalBytes: 512,
    lastCapture: null,
    cooldownRemainingMs: 0,
    sessionCaptureCount: 0,
    needsSummarization: false,
    hasIdentity: false,
    hasConfig: false,
    hasKnowledge: false,
    learningEnabled: true,
    lifetimeCaptureCount: 12,
    lastCaptureSource: null,
  };
}

function props(skills: RoleSkill[]) {
  return {
    selectedRole: 'reviewer',
    selectedStats: stats(),
    saving: false,
    setLearningEnabled: noop,
    optimizing: false,
    runOptimize: noop,
    autoStatus: null,
    consolidatedContent: null,
    loadConsolidated: noop,
    setConsolidatedContent: noop,
    skills,
    toggleSkillBody: noop,
    toggleSkillPin: noop,
    openSkill: null,
    retired: null,
    showRetired: false,
    setShowRetired: noop,
    loadEntries: noop,
    loadingEntries: false,
    reviewEntries: null,
    reviewDecisions: {},
    setReviewEntries: noop,
    setReviewDecisions: noop,
    applyReview: noop,
    teachInput: '',
    setTeachInput: noop,
    runTeach: noop,
    teachFeedback: null,
  };
}

describe('SelfLearningDetail — a skill this role cannot load', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => cleanup());

  // A blocked skill used to be shown as loaded beside the ones actually in
  // play, so the roster claimed a skill was in use while every spawn dropped
  // it. These cases are the whole distinction the UI now draws.

  it('says addendum only when the project developed the unloadable skill', () => {
    render(
      <SelfLearningDetail
        {...props([
          {
            skill: 'testing',
            developed: true,
            affinity: null,
            blocked: 'missing-capability',
            eager: false,
          },
        ])}
      />,
    );

    expect(screen.getByTitle(ADDENDUM_TITLE).textContent).toBe('addendum only');
    expect(screen.queryByTitle(CANT_LOAD_TITLE)).toBeNull();
    expect(screen.queryByTitle(LOADED_TITLE)).toBeNull();
  });

  it('says it cannot load when the project has nothing developed for it', () => {
    render(
      <SelfLearningDetail
        {...props([
          {
            skill: 'node-modern',
            developed: false,
            affinity: null,
            blocked: 'missing-tool',
            eager: false,
          },
        ])}
      />,
    );

    expect(screen.getByTitle(CANT_LOAD_TITLE).textContent).toBe("can't load");
    expect(screen.queryByTitle(ADDENDUM_TITLE)).toBeNull();
    expect(screen.queryByTitle(LOADED_TITLE)).toBeNull();
  });

  it('leaves a loadable skill unmarked', () => {
    render(
      <SelfLearningDetail
        {...props([{ skill: 'chimera', developed: true, affinity: null, eager: true }])}
      />,
    );

    expect(screen.getByTitle(LOADED_TITLE).textContent).toBe('loaded');
    expect(screen.queryByTitle(CANT_LOAD_TITLE)).toBeNull();
    expect(screen.queryByTitle(ADDENDUM_TITLE)).toBeNull();
  });
});
