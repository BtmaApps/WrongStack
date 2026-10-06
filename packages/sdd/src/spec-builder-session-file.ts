/**
 * Legacy file persistence for `AISpecBuilder` sessions (`sessionPath`), used
 * when no durable `sessionPersistence` owner is configured. Modules load
 * lazily, as before.
 */
import { type AISpecSession, isAISpecSession } from './sdd-session-types.js';

export async function writeAISpecSessionFile(
  sessionPath: string,
  snapshot: AISpecSession,
): Promise<void> {
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  const { atomicWrite } = await import('@wrongstack/core/utils');
  await fsp.mkdir(path.dirname(sessionPath), { recursive: true });
  // atomicWrite: torn save would corrupt the SDD session JSON and the
  // next load would silently fall back to a fresh session.
  await atomicWrite(sessionPath, JSON.stringify(snapshot, null, 2));
}

/** The saved session, or undefined when missing, unreadable or invalid. */
export async function readAISpecSessionFile(
  sessionPath: string,
): Promise<AISpecSession | undefined> {
  try {
    const fsp = await import('node:fs/promises');
    const raw = await fsp.readFile(sessionPath, 'utf8');
    const loaded = JSON.parse(raw) as AISpecSession;
    if (isAISpecSession(loaded)) return loaded;
  } catch {
    // No saved session or invalid file
  }
  return undefined;
}

export async function deleteAISpecSessionFile(sessionPath: string): Promise<void> {
  try {
    const fsp = await import('node:fs/promises');
    await fsp.unlink(sessionPath);
  } catch {
    // File might not exist
  }
}
