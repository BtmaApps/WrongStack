import { expect, it } from 'vitest';
import { sameSessionProcess, sessionProcesses } from '../src/session-process-model';

const owner = '2026-10-27/sess_process',
  row = {
    pid: 17,
    command: 'watch project',
    tool: 'bash',
    startedAt: 1000,
    status: 'running',
    sessionId: owner,
    background: true,
    hasOutput: true,
    protected: false,
  };
it('projects only the owned process metadata and distinguishes reused PIDs', () => {
  const proc = sessionProcesses(
    { sessionId: owner, processes: [{ ...row, logFile: 'PRIVATE' }] },
    owner,
  )[0]!;
  expect(proc).not.toHaveProperty('logFile');
  expect(proc.background).toBe(true);
  expect(sameSessionProcess(proc, { ...proc })).toBe(true);
  expect(sameSessionProcess(proc, { ...proc, startedAt: 2000 })).toBe(false);
  expect(sameSessionProcess(proc, { ...proc, command: 'other' })).toBe(false);
});
it('refuses mismatched envelope/record owners and malformed process metadata', () => {
  expect(() => sessionProcesses({ sessionId: 'other', processes: [row] }, owner)).toThrow(
    'another',
  );
  for (const patch of [
    { sessionId: 'other' },
    { pid: -1 },
    { startedAt: NaN },
    { startedAt: 1e100 },
    { status: 'unknown' },
  ])
    expect(() =>
      sessionProcesses({ sessionId: owner, processes: [{ ...row, ...patch }] }, owner),
    ).toThrow('unrecognized');
});
