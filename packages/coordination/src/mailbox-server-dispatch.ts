/**
 * The mailbox project server's operation table: each wire operation mapped
 * onto the SQLite owner's store, with credential secrets redacted on reads.
 */
import {
  type IssueCredentialOptions,
  redactMailboxCredential,
} from './mailbox-credential-store.js';
import type {
  MailboxServerOperationName,
  MailboxServerOperations,
} from './mailbox-project-server-protocol.js';
import type { SqliteMailbox } from './sqlite-mailbox.js';

function reviveCredentialOptions(
  options: IssueCredentialOptions | Partial<IssueCredentialOptions>,
): IssueCredentialOptions | Partial<IssueCredentialOptions> {
  const wireNotBefore = (options as { notBefore?: unknown }).notBefore;
  if (wireNotBefore === undefined || wireNotBefore instanceof Date) return options;
  if (typeof wireNotBefore !== 'string') {
    throw new Error('Credential notBefore must be an ISO date-time string');
  }
  const notBefore = new Date(wireNotBefore);
  if (!Number.isFinite(notBefore.getTime())) {
    throw new Error('Credential notBefore must be an ISO date-time string');
  }
  return { ...options, notBefore };
}

/**
 * Run one mailbox wire operation against the owner's store. `ping` is the
 * server's own status and is answered by the caller.
 */
export async function dispatchMailboxOperation(
  activeMailbox: SqliteMailbox,
  op: Exclude<MailboxServerOperationName, 'ping'>,
  rawArgs: unknown,
): Promise<unknown> {
  switch (op) {
    case 'send': {
      const args = rawArgs as MailboxServerOperations['send']['args'];
      return activeMailbox.send(args.input);
    }
    case 'sendRuntimeControl': {
      const args = rawArgs as MailboxServerOperations['sendRuntimeControl']['args'];
      return activeMailbox.sendRuntimeControl(args.input);
    }
    case 'query': {
      const args = rawArgs as MailboxServerOperations['query']['args'];
      return activeMailbox.query(args.query);
    }
    case 'ack': {
      const args = rawArgs as MailboxServerOperations['ack']['args'];
      return activeMailbox.ack(args.input);
    }
    case 'ackMany': {
      const args = rawArgs as MailboxServerOperations['ackMany']['args'];
      return activeMailbox.ackMany(args.input);
    }
    case 'unreadCount': {
      const args = rawArgs as MailboxServerOperations['unreadCount']['args'];
      return activeMailbox.unreadCount(args.forAgentId, args.sessionId);
    }
    case 'softDelete': {
      const args = rawArgs as MailboxServerOperations['softDelete']['args'];
      return activeMailbox.softDelete(args.mailId, args.by);
    }
    case 'restore': {
      const args = rawArgs as MailboxServerOperations['restore']['args'];
      return activeMailbox.restore(args.mailId);
    }
    case 'registerAgent': {
      const args = rawArgs as MailboxServerOperations['registerAgent']['args'];
      return activeMailbox.registerAgent(args.input);
    }
    case 'deregisterAgent': {
      const args = rawArgs as MailboxServerOperations['deregisterAgent']['args'];
      return activeMailbox.deregisterAgent(args.agentId);
    }
    case 'heartbeat': {
      const args = rawArgs as MailboxServerOperations['heartbeat']['args'];
      return activeMailbox.heartbeat(args.input);
    }
    case 'getAgentStatuses':
      return activeMailbox.getAgentStatuses();
    case 'getOnlineAgents':
      return activeMailbox.getOnlineAgents();
    case 'purgeAgents': {
      const args = rawArgs as MailboxServerOperations['purgeAgents']['args'];
      return activeMailbox.purgeAgents(args.maxAgeMs);
    }
    case 'registerClient': {
      const args = rawArgs as MailboxServerOperations['registerClient']['args'];
      return activeMailbox.registerClient(args.input);
    }
    case 'deregisterClient': {
      const args = rawArgs as MailboxServerOperations['deregisterClient']['args'];
      return activeMailbox.deregisterClient(args.clientId);
    }
    case 'clientHeartbeat': {
      const args = rawArgs as MailboxServerOperations['clientHeartbeat']['args'];
      return activeMailbox.clientHeartbeat(args.input);
    }
    case 'getClientStatuses':
      return activeMailbox.getClientStatuses();
    case 'purgeClients':
      return activeMailbox.purgeClients();
    case 'clearAll':
      return activeMailbox.clearAll();
    case 'purgeStale': {
      const args = rawArgs as MailboxServerOperations['purgeStale']['args'];
      return activeMailbox.purgeStale(args.options);
    }
    case 'autoCompact': {
      const args = rawArgs as MailboxServerOperations['autoCompact']['args'];
      return activeMailbox.autoCompact(args.options);
    }
    case 'credentialIssue': {
      const args = rawArgs as MailboxServerOperations['credentialIssue']['args'];
      return activeMailbox.credentialIssue(
        reviveCredentialOptions(args.options) as IssueCredentialOptions,
      );
    }
    case 'credentialVerify': {
      const args = rawArgs as MailboxServerOperations['credentialVerify']['args'];
      return Promise.resolve(activeMailbox.credentialVerify(args.credentialId, args.secret)).then(
        (result) =>
          result.valid
            ? {
                ...result,
                credential: result.credential
                  ? redactMailboxCredential(result.credential)
                  : undefined,
              }
            : { valid: false, reason: result.reason },
      );
    }
    case 'credentialRevoke': {
      const args = rawArgs as MailboxServerOperations['credentialRevoke']['args'];
      return activeMailbox.credentialRevoke(args.credentialId, args.reason, args.by);
    }
    case 'credentialRotate': {
      const args = rawArgs as MailboxServerOperations['credentialRotate']['args'];
      return activeMailbox.credentialRotate(
        args.credentialId,
        args.options === undefined
          ? undefined
          : (reviveCredentialOptions(args.options) as Partial<IssueCredentialOptions>),
      );
    }
    case 'credentialGet': {
      const args = rawArgs as MailboxServerOperations['credentialGet']['args'];
      // WS-025: the same `redactMailboxCredential` the MCP read surface uses.
      // A second local copy of this would drift — which is the shape of
      // several findings in this audit, including this one's sibling WS-066.
      return Promise.resolve(activeMailbox.credentialGet(args.credentialId)).then((credential) =>
        credential ? redactMailboxCredential(credential) : null,
      );
    }
    case 'credentialList':
      return Promise.resolve(activeMailbox.credentialList()).then((credentials) =>
        credentials.map(redactMailboxCredential),
      );
    case 'credentialStatusCounts':
      return activeMailbox.credentialStatusCounts();
  }
}
