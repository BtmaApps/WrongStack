import { pickShell } from '../src/_shell-pick.js';

/** Run fixture files, not inline shell programs, using the shell the tool will select. */
export function runtimeFixtureCommand(script: string, args: readonly string[] = []): string {
  const values = [process.execPath, script, ...args];
  const command = values.map((value) => `"${value}"`).join(' ');
  const shell = pickShell(process.platform, command, { get: (key) => process.env[key] });
  if (process.platform === 'win32' && shell === 'cmd') return command;
  const quoted = values
    .map((value) => `'${value.replace(/'/g, process.platform === 'win32' ? "''" : "'\\''")}'`)
    .join(' ');
  return process.platform === 'win32' ? `& ${quoted}` : quoted;
}
