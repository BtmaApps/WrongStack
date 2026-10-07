/**
 * Best-effort cross-session mailbox delivery for TaskAuctioneer. Split out
 * of task-auctioneer.ts. Both helpers no-op without a mailbox and never
 * reject: a failed send must not fail the auction step that triggered it.
 */
import type { Mailbox } from './mailbox-types.js';

export interface AuctionBroadcastMessage {
  type: 'note' | 'broadcast' | 'result' | 'assign';
  subject: string;
  body: string;
  taskContext?: Record<string, unknown>;
}

export interface AuctionAgentMessage {
  type: 'assign' | 'note';
  subject: string;
  body: string;
  taskContext?: Record<string, unknown>;
}

export async function publishAuctionBroadcast(
  mailbox: Mailbox | undefined,
  from: string,
  msg: AuctionBroadcastMessage,
): Promise<void> {
  if (!mailbox) return;
  try {
    await mailbox.send({
      from,
      to: '*',
      type: msg.type,
      subject: msg.subject,
      body: msg.body,
      priority: 'normal',
    });
  } catch {
    /* best-effort */
  }
}

export async function notifyAuctionAgent(
  mailbox: Mailbox | undefined,
  from: string,
  agentId: string,
  msg: AuctionAgentMessage,
): Promise<void> {
  if (!mailbox) return;
  try {
    await mailbox.send({
      from,
      to: agentId,
      type: msg.type,
      subject: msg.subject,
      body: msg.body,
      priority: 'high',
      taskContext: msg.taskContext as Parameters<Mailbox['send']>[0]['taskContext'],
    });
  } catch {
    /* best-effort */
  }
}
