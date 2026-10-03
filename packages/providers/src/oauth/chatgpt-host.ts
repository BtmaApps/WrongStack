import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { withFileLock } from '@wrongstack/core/utils';

/** One opaque ID per local host, shared by profiles; no tokens live in this file. */
export async function chatGPTHostId(
  path = join(homedir(), '.wrongstack', 'chatgpt-host-id'),
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const hostId = await withFileLock(path, async () => {
    try {
      await writeFile(path, `urn:uuid:${randomUUID()}`, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return (await readFile(path, 'utf8')).trim();
  });
  if (
    !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(hostId)
  ) {
    throw new Error('Invalid saved ChatGPT host ID. Restore ~/.wrongstack/chatgpt-host-id.');
  }
  return hostId;
}
