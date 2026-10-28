import type { EngineCommand } from './engine-operations';

export async function materializeProjectTheme(
  command: EngineCommand,
  stack: string,
  outPath: string,
): Promise<Record<string, unknown> & { path: string }> {
  const response = await command(
    'design.materialize',
    { stack, ...(outPath.trim() ? { out: outPath.trim() } : {}) },
    ['design.materialize'],
    { timeoutMs: 60000 },
  );
  if (typeof response['path'] !== 'string')
    throw Error('The engine did not report a written theme path.');
  const file = await command('files.read', { filePath: response['path'] }, ['files.read']);
  if (typeof file['content'] !== 'string' || !file['content'])
    throw Error('The theme output could not be read back.');
  return { ...response, path: response['path'] };
}
