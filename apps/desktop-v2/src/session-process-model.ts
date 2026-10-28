import { entries } from './engine-values';
export interface SessionProcess {
  pid: number;
  command: string;
  tool: string;
  startedAt: number;
  status: string;
  protected: boolean;
  background: boolean;
  hasOutput: boolean;
}
export function sessionProcesses(
  payload: Record<string, unknown>,
  sessionId: string,
): SessionProcess[] {
  if (payload['sessionId'] !== sessionId || !Array.isArray(payload['processes']))
    throw Error('Process list belongs to another conversation or has no process records.');
  const rows = entries(payload['processes']);
  if (
    rows.length !== payload['processes'].length ||
    rows.some(
      (row) =>
        row['sessionId'] !== sessionId ||
        !Number.isSafeInteger(row['pid']) ||
        Number(row['pid']) < 1 ||
        typeof row['command'] !== 'string' ||
        typeof row['tool'] !== 'string' ||
        typeof row['startedAt'] !== 'number' ||
        !Number.isFinite(row['startedAt']) ||
        !Number.isFinite(new Date(row['startedAt']).getTime()) ||
        !['running', 'killed', 'exited'].includes(String(row['status'])),
    )
  )
    throw Error('The engine returned an unrecognized or differently owned process.');
  return rows.map((row) => ({
    pid: Number(row['pid']),
    command: String(row['command']),
    tool: String(row['tool']),
    startedAt: Number(row['startedAt']),
    status: String(row['status']),
    protected: row['protected'] === true,
    background: row['background'] === true,
    hasOutput: row['hasOutput'] === true,
  }));
}
export function sameSessionProcess(left: SessionProcess, right: SessionProcess): boolean {
  return (
    left.pid === right.pid &&
    left.startedAt === right.startedAt &&
    left.command === right.command &&
    left.tool === right.tool
  );
}
