import { createHash } from 'node:crypto';
import type { KanbanBoard, KanbanCheck, KanbanTask } from '../types.js';

/** Executable assertion identity; outcomes and audit timestamps are excluded. */
export function checkInputFingerprint(check: KanbanCheck): string {
  return JSON.stringify([
    check.id,
    check.type,
    check.description,
    check.notes ?? null,
    check.escalation ?? 'none',
  ]);
}

/** Binds evidence to the work definition rather than to mutable result statuses. */
export function taskInputFingerprint(task: KanbanTask): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        task.id,
        task.title,
        task.description ?? null,
        task.atomic ?? false,
        task.childTaskIds ?? [],
        task.dependsOn ?? [],
        (task.expectedFileChanges ?? []).map((file) => [file.path, file.operation]),
        (task.successCriteria ?? []).map(checkInputFingerprint),
      ]),
    )
    .digest('hex');
}

/** Bind parent evidence to the complete persisted descendant contract/state. */
export function subtaskInputFingerprint(board: KanbanBoard, task: KanbanTask): string {
  const byId = new Map(board.tasks.map((child) => [child.id, child]));
  const visited = new Set([task.id]);
  const pending = [...(task.childTaskIds ?? [])];
  const inputs: Array<{
    id: string;
    input?: string | undefined;
    status?: string | undefined;
    leaseId?: string | undefined;
    attempt?: number | undefined;
    baseline?: string | undefined;
    checks?: Array<[string, string]> | undefined;
    verdict?: string | undefined;
  }> = [];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const child = byId.get(id);
    if (!child) {
      inputs.push({ id });
      continue;
    }
    inputs.push({
      id,
      input: taskInputFingerprint(child),
      status: child.status,
      leaseId: child.assignment?.leaseId,
      attempt: child.assignment?.attempt,
      baseline: child.assignment?.verificationBaseline?.treeHash,
      checks: (child.successCriteria ?? []).map((check) => [check.id, check.status]),
      verdict: child.verificationReport?.verdict,
    });
    pending.push(...(child.childTaskIds ?? []));
  }
  inputs.sort((left, right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

/** In-flight ownership fence. Routine liveness writes do not change the work. */
export function verificationStateFingerprint(board: KanbanBoard, task: KanbanTask): string {
  const byId = new Map(board.tasks.map((candidate) => [candidate.id, candidate]));
  const pending = [task.id];
  const visited = new Set<string>();
  const states: Array<[string, unknown]> = [];
  const taskMetadata = new Set(['updatedAt', 'notes', 'links', 'labels', 'order', 'dueDate']);
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const current = byId.get(id);
    if (!current) {
      states.push([id, null]);
      continue;
    }
    const state = Object.fromEntries(
      Object.entries(current).filter(([key]) => !taskMetadata.has(key)),
    );
    if (current.assignment) {
      state.assignment = Object.fromEntries(
        Object.entries(current.assignment).filter(
          ([key]) => key !== 'heartbeatAt' && key !== 'leaseExpiresAt',
        ),
      );
    }
    states.push([id, state]);
    pending.push(...(current.childTaskIds ?? []), ...(current.dependsOn ?? []));
  }
  states.sort(([left], [right]) => left.localeCompare(right));
  const policy = {
    id: board.id,
    version: board.version,
    lifecycle: board.lifecycle,
    completionGate: board.completionGate,
    boundary: board.boundary,
    atomicity: board.atomicity,
    contractGraph: board.contractGraph,
    requiredRequirementIds: board.requiredRequirementIds,
    requirementScopes: board.requirementScopes,
  };
  return createHash('sha256')
    .update(
      JSON.stringify([policy, states], (_key, value: unknown) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return Object.fromEntries(
            Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
          );
        }
        return value;
      }),
    )
    .digest('hex');
}
