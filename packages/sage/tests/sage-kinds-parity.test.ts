import { SAGE_MEMORY_KINDS } from '@wrongstack/core/utils/sage-kinds';
import { describe, expect, it } from 'vitest';
import { VALID_KINDS } from '../src/memory-input-validation.js';
import { SAGE_KINDS } from '../src/memory-model.js';

/**
 * The CLI, TUI and WebUI validate / offer kinds from the browser-safe core list
 * `SAGE_MEMORY_KINDS`. The engine validates writes against `VALID_KINDS`. Three
 * hand-copied 12-kind UI lists once drifted from the engine's 20 kinds, so a
 * kind the engine accepted was rejected (CLI/TUI) or unpickable (WebUI). Pin
 * the shared list to the engine from both sides.
 */
describe('SAGE kind vocabulary parity', () => {
  it('core SAGE_MEMORY_KINDS equals the engine VALID_KINDS set', () => {
    expect([...SAGE_MEMORY_KINDS].sort()).toEqual([...VALID_KINDS].sort());
  });

  it('core SAGE_MEMORY_KINDS equals the engine SAGE_KINDS list', () => {
    expect([...SAGE_MEMORY_KINDS]).toEqual([...SAGE_KINDS]);
  });

  it('has no duplicate entries', () => {
    expect(new Set(SAGE_MEMORY_KINDS).size).toBe(SAGE_MEMORY_KINDS.length);
  });
});
