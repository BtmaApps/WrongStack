/** Canonical policy key. Paths remain paths and require explicit trusted opt-in. */
export function normalizeExecCommandName(
  command: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const name = command.trim();
  return platform === 'win32' ? name.toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '') : name;
}

/** Configured executable paths must still receive the binary's argument guards. */
export function execSafetyCommandName(command: string): string {
  const name = normalizeExecCommandName(command);
  return process.platform === 'win32' ? name.replace(/^.*[/\\]/, '') : name.replace(/^.*\//, '');
}
