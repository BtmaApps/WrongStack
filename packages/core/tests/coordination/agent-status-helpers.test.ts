import { describe, expect, it } from 'vitest';
import {
  addToolActivity,
  completedToolReceipt,
} from '../../src/coordination/agent-status-helpers.js';

const totalsFor = (name: string) => addToolActivity(undefined, completedToolReceipt({ name }));

describe('addToolActivity tool classification', () => {
  it('counts shell tools (bash, exec, powershell) as terminal calls', () => {
    expect(totalsFor('bash').terminalCalls).toBe(1);
    expect(totalsFor('exec').terminalCalls).toBe(1);
    expect(totalsFor('powershell').terminalCalls).toBe(1);
  });

  it('counts the pwsh tool as a terminal call, not other', () => {
    // `pwsh` is the registered name of the PowerShell tool
    // (packages/tools/src/pwsh.ts) — the classifier accepted only the legacy
    // `powershell` spelling, so every pwsh execution landed in otherCalls.
    const totals = totalsFor('pwsh');
    expect(totals.terminalCalls).toBe(1);
    expect(totals.otherCalls).toBe(0);
  });

  it('keeps web and search tools in their own categories', () => {
    expect(totalsFor('fetch').webCalls).toBe(1);
    expect(totalsFor('grep').searches).toBe(1);
  });

  it('accumulates terminal calls onto existing totals', () => {
    let totals = totalsFor('pwsh');
    totals = addToolActivity(totals, completedToolReceipt({ name: 'bash' }));
    expect(totals.terminalCalls).toBe(2);
  });
});
