import { describe, expect, it } from 'vitest';
import {
  SAGE_DISPATCH_FIELD_SPECS,
  type SageFieldKind,
  SageInvalidArgsError,
  type SageServerOperationName,
  validateDispatchArgs,
} from '../src/project-server-protocol.js';

/**
 * H9 malformed-args matrix (docs/sage-phase4-design.md): every operation's
 * required-args spec in SAGE_DISPATCH_FIELD_SPECS is exercised for —
 * minimal-valid acceptance, unknown-field tolerance, missing args object,
 * per-field omission, and per-field wrong type — plus the
 * `InvalidSageRequestArgs` wire name the transport catch stamps onto the
 * response frame.
 *
 * The matrix is generated FROM the spec table itself, so an operation added
 * without correct validation fails here automatically.
 */

function sampleFor(kind: SageFieldKind): unknown {
  switch (kind) {
    case 'string':
      return 'sample';
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'string[]':
      return ['sample'];
    case 'object':
      return {};
    case 'any':
      return 'sample';
  }
}

function wrongValueFor(kind: SageFieldKind): unknown {
  switch (kind) {
    case 'string':
      return 5;
    case 'number':
      return 'not-a-number';
    case 'boolean':
      return 'yes';
    case 'string[]':
      return 'not-an-array';
    case 'object':
      return [];
    case 'any':
      return null; // 'any' accepts everything — caller skips this case
  }
}

const OPS = Object.keys(SAGE_DISPATCH_FIELD_SPECS) as SageServerOperationName[];

function minimalValidArgs(op: SageServerOperationName): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [field, kind] of SAGE_DISPATCH_FIELD_SPECS[op]) args[field] = sampleFor(kind);
  return args;
}

describe('SAGE dispatch args validation (H9)', () => {
  it('accepts minimal valid args for every operation', () => {
    for (const op of OPS) {
      expect(validateDispatchArgs(op, minimalValidArgs(op)), op).toBeNull();
    }
  });

  it('tolerates unknown extra fields on every operation', () => {
    for (const op of OPS) {
      const args = minimalValidArgs(op);
      args.unrelatedJunk = { nested: true };
      expect(validateDispatchArgs(op, args), op).toBeNull();
    }
  });

  it('accepts a missing args object only for ops with no required fields', () => {
    for (const op of OPS) {
      const result = validateDispatchArgs(op, undefined);
      if (SAGE_DISPATCH_FIELD_SPECS[op].length === 0) expect(result, op).toBeNull();
      else expect(result, op).toContain('missing args object');
    }
  });

  it('names the first missing required field for every operation', () => {
    for (const op of OPS) {
      const spec = SAGE_DISPATCH_FIELD_SPECS[op];
      if (spec.length === 0) continue;
      const result = validateDispatchArgs(op, {});
      expect(result, op).toContain(`missing required arg "${spec[0]?.[0]}"`);
    }
  });

  it('rejects wrong-type values naming the field and kind', () => {
    for (const op of OPS) {
      for (const [field, kind] of SAGE_DISPATCH_FIELD_SPECS[op]) {
        const wrong = wrongValueFor(kind);
        if (wrong === null) continue; // 'any' accepts everything
        const args = minimalValidArgs(op);
        args[field] = wrong;
        const result = validateDispatchArgs(op, args);
        expect(result, `${op}: ${field}`).toContain(`arg "${field}" must be of type ${kind}`);
      }
    }
  });

  it('rejects a non-object args payload for ops with required fields', () => {
    expect(validateDispatchArgs('remember', 'just-text')).toContain('args must be an object');
    expect(validateDispatchArgs('remember', ['text'])).toContain('args must be an object');
  });

  it('carries the InvalidSageRequestArgs wire name', () => {
    expect(new SageInvalidArgsError('bad args').name).toBe('InvalidSageRequestArgs');
  });
});
