import { describe, expect, it } from 'vitest';
import {
  CODEBASE_INDEX_READ_TOOLS,
  CODEBASE_INDEX_WRITE_TOOLS,
  selectCodebaseIndexMcpTools,
} from '../src/policy.js';

describe('Codebase Index MCP policy', () => {
  it('is read-only by default', () => {
    expect(selectCodebaseIndexMcpTools()).toEqual(CODEBASE_INDEX_READ_TOOLS);
    for (const writeTool of CODEBASE_INDEX_WRITE_TOOLS) {
      expect(selectCodebaseIndexMcpTools()).not.toContain(writeTool);
    }
  });

  it('adds the write/execution tools only when explicitly writable', () => {
    expect(selectCodebaseIndexMcpTools({ writable: true })).toEqual([
      ...CODEBASE_INDEX_READ_TOOLS,
      ...CODEBASE_INDEX_WRITE_TOOLS,
    ]);
  });
});
