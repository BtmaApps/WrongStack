import { KanbanLifecycleError } from '@wrongstack/kanban';
import { describe, expect, it } from 'vitest';
import {
  formatLifecycleDiagnosis,
  parseTaskEvidenceFlags,
  resolveColumnReference,
} from '../../src/slash-commands/kanban-lifecycle-diagnostics.js';

function lifecycleError(
  code: string,
  field?: string,
  message = 'guard said no',
): KanbanLifecycleError {
  return new KanbanLifecycleError('transition rejected', [
    { code, ...(field !== undefined ? { field } : {}), message } as never,
  ]);
}

describe('parseTaskEvidenceFlags', () => {
  it('returns positional tokens untouched when no flags are present', () => {
    expect(parseTaskEvidenceFlags(['board', 'task'])).toEqual({
      attachment: undefined,
      note: undefined,
      tickChecks: [],
      positional: ['board', 'task'],
      warnings: [],
    });
  });

  it.each(['--attachment', '--evidence', '--link'])('reads %s in split and inline form', (key) => {
    expect(parseTaskEvidenceFlags([key, 'https://a.test']).attachment).toBe('https://a.test');
    expect(parseTaskEvidenceFlags([`${key}=https://b.test?x=1`]).attachment).toBe(
      'https://b.test?x=1',
    );
  });

  it('collects a multi-word note until the next -- flag', () => {
    const parsed = parseTaskEvidenceFlags([
      'b1',
      '--note',
      'ran',
      'the',
      '-v',
      'suite',
      '--attachment',
      'https://a.test',
      't1',
    ]);
    expect(parsed.note).toBe('ran the -v suite');
    expect(parsed.attachment).toBe('https://a.test');
    expect(parsed.positional).toEqual(['b1', 't1']);
  });

  it('stops a note at a lone dash', () => {
    const parsed = parseTaskEvidenceFlags(['--comment', 'looks', 'good', '-', 'tail']);
    expect(parsed.note).toBe('looks good');
    expect(parsed.positional).toEqual(['-', 'tail']);
  });

  it('accepts inline notes and warns on empty ones', () => {
    expect(parseTaskEvidenceFlags(['--action=approved']).note).toBe('approved');
    expect(parseTaskEvidenceFlags(['--note=', 'x'])).toMatchObject({
      note: undefined,
      positional: ['x'],
      warnings: ['--note expects text but none was provided'],
    });
    expect(parseTaskEvidenceFlags(['--note']).warnings).toEqual([
      '--note expects text but none was provided',
    ]);
  });

  it('does not swallow the following flag when an attachment value is missing', () => {
    const parsed = parseTaskEvidenceFlags(['--attachment', '--note', 'fixed', 'it']);
    expect(parsed.attachment).toBeUndefined();
    expect(parsed.note).toBe('fixed it');
    expect(parsed.positional).toEqual([]);
    expect(parsed.warnings).toEqual(['--attachment expects a URL but none was provided']);
  });

  it('does not swallow the following flag when a tick-check value is missing', () => {
    const parsed = parseTaskEvidenceFlags(['--tick-check', '--attachment', 'https://a.test']);
    expect(parsed.attachment).toBe('https://a.test');
    expect(parsed.tickChecks).toEqual([]);
    expect(parsed.warnings).toEqual([
      '--tick-check expects <checkId>=<status> but none was provided',
    ]);
  });

  it('warns on a trailing attachment flag and an empty inline attachment', () => {
    expect(parseTaskEvidenceFlags(['t1', '--link']).warnings).toEqual([
      '--link expects a URL but none was provided',
    ]);
    const inline = parseTaskEvidenceFlags(['--evidence=', 't1']);
    expect(inline.attachment).toBeUndefined();
    expect(inline.positional).toEqual(['t1']);
  });

  it('parses tick checks, splitting on the last = so ids may contain =', () => {
    const parsed = parseTaskEvidenceFlags([
      '--tick-check',
      'c1=passed',
      '--tick-checks=a=b=failed',
      '--tick-check',
      ' c3 = skipped ',
    ]);
    expect(parsed.tickChecks).toEqual([
      { checkId: 'c1', checkStatus: 'passed' },
      { checkId: 'a=b', checkStatus: 'failed' },
      { checkId: 'c3', checkStatus: 'skipped' },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it.each(['c1', '=passed', 'c1=', 'c1=PASSED', 'c1=done'])(
    'rejects malformed tick check %j and consumes its value',
    (raw) => {
      const parsed = parseTaskEvidenceFlags(['--tick-check', raw, 'board']);
      expect(parsed.tickChecks).toEqual([]);
      expect(parsed.positional).toEqual(['board']);
      expect(parsed.warnings).toEqual([
        `--tick-check expects <checkId>=<status> where status is passed|failed|skipped (got "${raw}")`,
      ]);
    },
  );

  it('keeps the last value when a flag repeats', () => {
    const parsed = parseTaskEvidenceFlags(['--link', 'https://1', '--link', 'https://2']);
    expect(parsed.attachment).toBe('https://2');
  });

  it('treats unknown --key=value tokens as positional', () => {
    expect(parseTaskEvidenceFlags(['--other=1']).positional).toEqual(['--other=1']);
  });
});

describe('formatLifecycleDiagnosis', () => {
  it('falls back to the raw message for non-lifecycle errors', () => {
    expect(formatLifecycleDiagnosis(new Error('disk full'), 'move')).toBe(
      '❌ /kanban task move rejected: disk full',
    );
    expect(formatLifecycleDiagnosis('plain string', 'done')).toBe(
      '❌ /kanban task done rejected: plain string',
    );
  });

  it('decodes issues from an IPC-reconstructed plain error message', () => {
    const original = lifecycleError('transition-skipped');
    const wire = new Error(original.message);
    expect(formatLifecycleDiagnosis(wire, 'move')).toContain('skipped a managed lifecycle stage');
  });

  it.each([
    ['description', 'needs a task description first'],
    ['assignee', 'needs an assignee'],
    ['childTaskIds', 'atomic parent with no persisted children'],
    ['successCriteria', 'needs explicit acceptance criteria'],
    ['actor', 'internal audit requirement (actor)'],
    ['comment', 'internal audit requirement (comment)'],
  ])('explains task-detail-missing for field %s', (field, expected) => {
    expect(
      formatLifecycleDiagnosis(lifecycleError('task-detail-missing', field), 'start'),
    ).toContain(expected);
  });

  it('uses the generic guard message for an unhandled task-detail-missing field', () => {
    expect(formatLifecycleDiagnosis(lifecycleError('task-detail-missing', 'labels'), 'start')).toBe(
      '❌ /kanban task start rejected by lifecycle guard (task-detail-missing, labels): guard said no',
    );
    expect(formatLifecycleDiagnosis(lifecycleError('task-detail-missing'), 'start')).toContain(
      '(task-detail-missing, lifecycle)',
    );
  });

  it('distinguishes review-evidence-missing by action and field', () => {
    const verifyDone = formatLifecycleDiagnosis(
      lifecycleError('review-evidence-missing', 'verificationReport'),
      'done',
    );
    expect(verifyDone).toContain('/kanban task done requires a passing verification report');
    expect(
      formatLifecycleDiagnosis(lifecycleError('review-evidence-missing', 'attachments'), 'done'),
    ).toContain('--attachment <url> --note <text>');
    expect(
      formatLifecycleDiagnosis(
        lifecycleError('review-evidence-missing', 'verificationReport'),
        'move',
      ),
    ).toContain('/kanban task move requires a passing verification report');
    expect(
      formatLifecycleDiagnosis(lifecycleError('review-evidence-missing', 'result'), 'move'),
    ).toContain('needs a persisted implementation result');
  });

  it.each([
    ['parent-child-incomplete', 'blocked by incomplete children: guard said no'],
    ['stage-mismatch', 'repair_managed_task_projection'],
    ['managed-policy-invalid', 'cannot run on this board: guard said no.'],
    ['acceptance-criteria-incomplete', 'unpassed acceptance criteria: guard said no'],
    ['something-new', 'rejected by lifecycle guard (something-new, lifecycle): guard said no'],
  ])('explains %s', (code, expected) => {
    expect(formatLifecycleDiagnosis(lifecycleError(code), 'move')).toContain(expected);
  });
});

describe('resolveColumnReference', () => {
  const managed = {
    columns: [{ id: 'col-backlog' }, { id: 'In-Progress' }, { id: 'col-done' }],
    lifecycle: {
      mode: 'managed',
      columns: { backlog: 'col-backlog', running: 'In-Progress', done: 'col-done' },
    },
  } as never;

  it('prefers an exact id, then a case-insensitive id', () => {
    expect(resolveColumnReference(managed, 'col-done')).toBe('col-done');
    expect(resolveColumnReference(managed, 'IN-PROGRESS')).toBe('In-Progress');
  });

  it.each([
    ['running', 'In-Progress'],
    ['inprogress', 'In-Progress'],
    [' Completed ', 'col-done'],
    ['BACKLOG', 'col-backlog'],
  ])('maps managed stage alias %j', (requested, expected) => {
    expect(resolveColumnReference(managed, requested)).toBe(expected);
  });

  it('returns null for an alias whose stage is not mapped or an unknown name', () => {
    expect(resolveColumnReference(managed, 'review')).toBeNull();
    expect(resolveColumnReference(managed, 'nowhere')).toBeNull();
  });

  it('ignores stage aliases on unmanaged boards', () => {
    const freeform = { columns: [{ id: 'col-done' }] } as never;
    expect(resolveColumnReference(freeform, 'done')).toBeNull();
  });
});
