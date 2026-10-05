import type { IntakeOperation } from './authorization.js';
import { type IntakeStatus, MAX_SUGGESTIONS } from './constants.js';
import { IntakeSuggestionError, IntakeValidationError } from './errors.js';
import type { IntakeLogger } from './logger.js';
import type { IntakeMetrics } from './metrics.js';
import type { RequirementIntakeStore, StoreUpdateOptions } from './store.js';
import {
  type LlmSuggestionGenerator,
  toProposals,
  validateLlmSuggestionOutput,
} from './suggestions.js';
import type {
  IntakeContext,
  IntakeEvent,
  IntakeEventName,
  LlmSuggestionProposal,
  RequirementIntakeRecord,
} from './types.js';
export interface IntakeSuggestionsHost {
  requireRecord(
    id: string,
    ctx: IntakeContext,
    operation: IntakeOperation,
  ): Promise<RequirementIntakeRecord>;
  assertMutable(record: RequirementIntakeRecord, action: string): void;
  generator: LlmSuggestionGenerator | undefined;
  metrics: IntakeMetrics;
  logger: IntakeLogger;
  store: RequirementIntakeStore;
  emit(event: IntakeEventName, data: Omit<IntakeEvent, 'event' | 'timestamp'>): void;
  findSuggestion(record: RequirementIntakeRecord, proposalId: string): LlmSuggestionProposal;
  updateMeta(
    ctx: IntakeContext,
    action: string,
    fields: string[],
    expectedVersion?: number | undefined,
  ): StoreUpdateOptions;
  applyProposal(record: RequirementIntakeRecord, proposal: LlmSuggestionProposal): void;
  afterMutation(record: RequirementIntakeRecord, ctx: IntakeContext, event: IntakeEventName): void;
}

export async function generateSuggestions(
  host: IntakeSuggestionsHost,
  id: string,
  ctx: IntakeContext,
  focus?: string[] | undefined,
): Promise<LlmSuggestionProposal[]> {
  const record = await host.requireRecord(id, ctx, 'suggest');
  host.assertMutable(record, 'generateSuggestions');
  if (!host.generator) {
    throw new IntakeSuggestionError('No LLM suggestion generator is configured on this service');
  }
  host.metrics.increment('intake.suggestions.requested');

  let output;
  try {
    output = await host.generator.generate({ record, focus });
  } catch (error) {
    host.metrics.increment('intake.suggestions.failed');
    host.logger.error('intake', 'intake.suggestions.failed', {
      intakeId: record.id,
      projectId: record.projectId,
      actorId: ctx.id,
    });
    throw new IntakeSuggestionError('LLM suggestion generation failed', { cause: error });
  }

  let proposals: LlmSuggestionProposal[];
  try {
    proposals = toProposals(validateLlmSuggestionOutput(output));
  } catch (error) {
    host.metrics.increment('intake.suggestions.failed');
    throw error instanceof IntakeSuggestionError
      ? error
      : new IntakeSuggestionError('LLM suggestion output could not be validated', {
          cause: error,
        });
  }
  if (proposals.length === 0) {
    host.metrics.increment('intake.suggestions.failed');
    throw new IntakeSuggestionError('LLM suggestion output contained no usable proposals');
  }

  const hadQuestions = proposals.some((proposal) => proposal.kind === 'question');
  let previousStatus: IntakeStatus = record.status;
  const updateOptions: StoreUpdateOptions = {
    actorId: ctx.id,
    actorType: ctx.type,
    action: hadQuestions ? 'information_requested' : 'suggestions_added',
  };

  const updated = await host.store.update(id, updateOptions, (next) => {
    host.assertMutable(next, 'generateSuggestions');
    previousStatus = next.status;
    if (next.status === 'draft') {
      updateOptions.from = 'draft';
      updateOptions.to = 'collecting_information';
      next.status = 'collecting_information';
    }
    next.llmSuggestions.push(...proposals);
    if (next.llmSuggestions.length > MAX_SUGGESTIONS) {
      next.llmSuggestions = next.llmSuggestions.slice(next.llmSuggestions.length - MAX_SUGGESTIONS);
    }
  });

  host.metrics.increment('intake.suggestions.succeeded');
  host.logger.info('intake', 'intake.suggestions.succeeded', {
    intakeId: updated.id,
    projectId: updated.projectId,
    actorId: ctx.id,
    count: proposals.length,
  });
  host.emit(hadQuestions ? 'RequirementIntakeInformationRequested' : 'RequirementIntakeUpdated', {
    intakeId: updated.id,
    projectId: updated.projectId,
    actorId: ctx.id,
    actorType: ctx.type,
    previousStatus,
    status: updated.status,
  });
  return proposals;
}

export async function acceptSuggestion(
  host: IntakeSuggestionsHost,
  id: string,
  proposalId: string,
  ctx: IntakeContext,
  expectedVersion?: number | undefined,
): Promise<RequirementIntakeRecord> {
  const record = await host.requireRecord(id, ctx, 'accept_suggestion');
  host.assertMutable(record, 'acceptSuggestion');
  const proposal = host.findSuggestion(record, proposalId);
  if (proposal.status !== 'pending') {
    throw new IntakeValidationError([
      { field: 'suggestionId', message: `suggestion is already ${proposal.status}` },
    ]);
  }

  return host.store
    .update(
      id,
      host.updateMeta(ctx, 'suggestion_accepted', [proposal.kind], expectedVersion),
      (next) => {
        host.assertMutable(next, 'acceptSuggestion');
        const target = next.llmSuggestions.find((candidate) => candidate.id === proposalId);
        if (!target) {
          throw new IntakeValidationError([
            { field: 'suggestionId', message: `suggestion not found: ${proposalId}` },
          ]);
        }
        host.applyProposal(next, target);
        target.status = 'accepted';
        target.resolvedAt = Date.now();
      },
    )
    .then((updated) => {
      host.afterMutation(updated, ctx, 'RequirementIntakeUpdated');
      return updated;
    });
}

export async function rejectSuggestion(
  host: IntakeSuggestionsHost,
  id: string,
  proposalId: string,
  ctx: IntakeContext,
  expectedVersion?: number | undefined,
): Promise<RequirementIntakeRecord> {
  const record = await host.requireRecord(id, ctx, 'reject_suggestion');
  host.assertMutable(record, 'rejectSuggestion');
  host.findSuggestion(record, proposalId);

  return host.store
    .update(
      id,
      host.updateMeta(ctx, 'suggestion_rejected', [proposalId], expectedVersion),
      (next) => {
        host.assertMutable(next, 'rejectSuggestion');
        const target = next.llmSuggestions.find((candidate) => candidate.id === proposalId);
        if (!target) {
          throw new IntakeValidationError([
            { field: 'suggestionId', message: `suggestion not found: ${proposalId}` },
          ]);
        }
        if (target.status !== 'pending') {
          throw new IntakeValidationError([
            { field: 'suggestionId', message: `suggestion is already ${target.status}` },
          ]);
        }
        target.status = 'rejected';
        target.resolvedAt = Date.now();
      },
    )
    .then((updated) => {
      host.afterMutation(updated, ctx, 'RequirementIntakeUpdated');
      return updated;
    });
}
