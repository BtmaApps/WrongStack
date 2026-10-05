import { GOVERNANCE_EVIDENCE_CANDIDATE_MAX_PAGE_SIZE } from './evidence-candidate.js';
import {
  enumValue,
  exactKeys,
  type GovernanceProtocolDecodeIssue,
  integerValue,
  issue,
  type MutableIssues,
  observationPageWindow,
  plainRecord,
  stringValue,
  validateCommand,
  validateObservation,
} from './protocol-decode-validation.js';
import {
  GOVERNANCE_RUNTIME_MODEL_CAPABILITIES,
  GOVERNANCE_SERVICE_CAPABILITIES,
  GOVERNANCE_SERVICE_PROTOCOL_VERSION,
  type GovernanceServiceRequest,
} from './service-protocol.js';

type GovernanceServiceRequestDecodeResult =
  | { readonly decoded: true; readonly request: GovernanceServiceRequest }
  | { readonly decoded: false; readonly issues: readonly GovernanceProtocolDecodeIssue[] };

function boundedString(
  value: unknown,
  path: string,
  issues: MutableIssues,
  maxLength: number,
): void {
  stringValue(value, path, issues);
  if (typeof value === 'string' && value.length > maxLength) {
    issue(issues, 'resource_limit', path, `${path} exceeds the ${maxLength}-character limit.`);
  }
}

/**
 * Shared body for the two capability arrays. Both are enumerations of a fixed,
 * tiny allowed set, so an array longer than that set is already rejected — and
 * once it is rejected there is nothing to learn from walking it. Returning here
 * (the way {@link arrayValue} already does for its own limit) is what keeps a
 * multi-million entry array from being iterated at all, which in turn keeps the
 * per-entry `enumValue` reports and the `seen` set from being built.
 */
function boundedCapabilityArray(
  value: unknown,
  allowed: readonly string[],
  noun: string,
  path: string,
  issues: MutableIssues,
): void {
  if (!Array.isArray(value)) {
    issue(issues, 'expected_array', path, `${path} must be an array.`);
    return;
  }
  if (value.length === 0 || value.length > allowed.length) {
    issue(
      issues,
      'resource_limit',
      path,
      `${path} must contain between 1 and ${allowed.length} ${noun}.`,
    );
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entryPath = `${path}[${index}]`;
    enumValue(value[index], allowed, entryPath, issues);
    if (typeof value[index] === 'string') {
      if (seen.has(value[index])) {
        issue(issues, 'semantic_invalid', entryPath, `${entryPath} duplicates a capability.`);
      }
      seen.add(value[index]);
    }
  }
}

function capabilityArray(value: unknown, path: string, issues: MutableIssues): void {
  boundedCapabilityArray(value, GOVERNANCE_SERVICE_CAPABILITIES, 'capabilities', path, issues);
}

function runtimeModelCapabilityArray(value: unknown, path: string, issues: MutableIssues): void {
  boundedCapabilityArray(
    value,
    GOVERNANCE_RUNTIME_MODEL_CAPABILITIES,
    'model-safe capabilities',
    path,
    issues,
  );
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function decodeGovernanceServiceRequest(
  input: unknown,
): GovernanceServiceRequestDecodeResult {
  const issues: MutableIssues = [];
  const record = plainRecord(input, '$', issues);
  if (!record) return { decoded: false, issues: Object.freeze(issues) };

  if (record.protocolVersion !== GOVERNANCE_SERVICE_PROTOCOL_VERSION) {
    issue(
      issues,
      'invalid_value',
      '$.protocolVersion',
      `Only protocol version ${GOVERNANCE_SERVICE_PROTOCOL_VERSION} is supported.`,
    );
  }
  stringValue(record.requestId, '$.requestId', issues);

  switch (record.type) {
    case 'health':
      exactKeys(record, ['protocolVersion', 'requestId', 'type'], '$', issues);
      break;
    case 'read_task':
    case 'read_events':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'taskId'], '$', issues);
      stringValue(record.taskId, '$.taskId', issues);
      break;
    case 'read_receipt':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'commandId'], '$', issues);
      stringValue(record.commandId, '$.commandId', issues);
      break;
    case 'read_observations':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'taskId', 'afterSequence', 'limit'],
        '$',
        issues,
      );
      if (record.taskId !== undefined) stringValue(record.taskId, '$.taskId', issues);
      observationPageWindow(record, issues);
      break;
    case 'read_evidence_candidates':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'taskId', 'afterSequence', 'limit'],
        '$',
        issues,
      );
      boundedString(record.taskId, '$.taskId', issues, 512);
      if (record.afterSequence !== undefined) {
        integerValue(record.afterSequence, '$.afterSequence', issues);
      }
      if (record.limit !== undefined) {
        integerValue(record.limit, '$.limit', issues, 1);
        if (
          typeof record.limit === 'number' &&
          record.limit > GOVERNANCE_EVIDENCE_CANDIDATE_MAX_PAGE_SIZE
        ) {
          issue(
            issues,
            'resource_limit',
            '$.limit',
            `$.limit must not exceed ${GOVERNANCE_EVIDENCE_CANDIDATE_MAX_PAGE_SIZE}.`,
          );
        }
      }
      break;
    case 'read_audit_observations':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'afterSequence', 'limit'],
        '$',
        issues,
      );
      observationPageWindow(record, issues);
      break;
    case 'read_own_capability_grant':
    case 'read_daemon_status':
      exactKeys(record, ['protocolVersion', 'requestId', 'type'], '$', issues);
      break;
    case 'request_daemon_shutdown':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'expectedInstanceId', 'reason'],
        '$',
        issues,
      );
      boundedString(record.expectedInstanceId, '$.expectedInstanceId', issues, 128);
      if (
        typeof record.expectedInstanceId === 'string' &&
        !/^[A-Za-z0-9_-]{1,128}$/u.test(record.expectedInstanceId)
      ) {
        issue(
          issues,
          'invalid_value',
          '$.expectedInstanceId',
          '$.expectedInstanceId must be a token-safe identifier.',
        );
      }
      if (record.reason !== undefined) boundedString(record.reason, '$.reason', issues, 512);
      break;
    case 'submit_command':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'command'], '$', issues);
      validateCommand(record.command, '$.command', issues);
      break;
    case 'record_observation':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'observation'], '$', issues);
      validateObservation(record.observation, '$.observation', issues);
      break;
    case 'record_workspace_snapshot':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'manifestHash'], '$', issues);
      boundedString(record.manifestHash, '$.manifestHash', issues, 64);
      if (typeof record.manifestHash === 'string' && !/^[a-f0-9]{64}$/u.test(record.manifestHash)) {
        issue(
          issues,
          'invalid_value',
          '$.manifestHash',
          '$.manifestHash must be a lowercase SHA-256 digest.',
        );
      }
      break;
    case 'issue_capability_grant':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'clientId', 'capabilities', 'ttlMs'],
        '$',
        issues,
      );
      boundedString(record.clientId, '$.clientId', issues, 512);
      capabilityArray(record.capabilities, '$.capabilities', issues);
      integerValue(record.ttlMs, '$.ttlMs', issues, 1);
      break;
    case 'claim_runtime_attachment':
      exactKeys(
        record,
        [
          'protocolVersion',
          'requestId',
          'type',
          'controlClientId',
          'modelClientId',
          'modelCapabilities',
          'ttlMs',
        ],
        '$',
        issues,
      );
      boundedString(record.controlClientId, '$.controlClientId', issues, 512);
      boundedString(record.modelClientId, '$.modelClientId', issues, 512);
      runtimeModelCapabilityArray(record.modelCapabilities, '$.modelCapabilities', issues);
      integerValue(record.ttlMs, '$.ttlMs', issues, 1);
      if (
        typeof record.controlClientId === 'string' &&
        record.controlClientId === record.modelClientId
      ) {
        issue(
          issues,
          'semantic_invalid',
          '$.modelClientId',
          '$.modelClientId must differ from $.controlClientId.',
        );
      }
      break;
    case 'release_runtime_attachment':
      exactKeys(record, ['protocolVersion', 'requestId', 'type'], '$', issues);
      break;
    case 'list_capability_grants':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'cursor', 'limit'], '$', issues);
      if (record.cursor !== undefined) {
        boundedString(record.cursor, '$.cursor', issues, 128);
        if (typeof record.cursor === 'string' && !/^[A-Za-z0-9_-]{1,128}$/.test(record.cursor)) {
          issue(issues, 'invalid_value', '$.cursor', '$.cursor must be a token-safe identifier.');
        }
      }
      if (record.limit !== undefined) {
        integerValue(record.limit, '$.limit', issues, 1);
        if (typeof record.limit === 'number' && record.limit > 100) {
          issue(issues, 'resource_limit', '$.limit', '$.limit must not exceed 100.');
        }
      }
      break;
    case 'revoke_capability_grant':
      exactKeys(record, ['protocolVersion', 'requestId', 'type', 'grantId', 'reason'], '$', issues);
      boundedString(record.grantId, '$.grantId', issues, 128);
      if (typeof record.grantId === 'string' && !/^[A-Za-z0-9_-]{1,128}$/.test(record.grantId)) {
        issue(issues, 'invalid_value', '$.grantId', '$.grantId must be a token-safe identifier.');
      }
      if (record.reason !== undefined) boundedString(record.reason, '$.reason', issues, 512);
      break;
    case 'rotate_capability_grant':
      exactKeys(
        record,
        ['protocolVersion', 'requestId', 'type', 'grantId', 'ttlMs', 'reason'],
        '$',
        issues,
      );
      boundedString(record.grantId, '$.grantId', issues, 128);
      if (typeof record.grantId === 'string' && !/^[A-Za-z0-9_-]{1,128}$/.test(record.grantId)) {
        issue(issues, 'invalid_value', '$.grantId', '$.grantId must be a token-safe identifier.');
      }
      integerValue(record.ttlMs, '$.ttlMs', issues, 1);
      if (record.reason !== undefined) boundedString(record.reason, '$.reason', issues, 512);
      break;
    default:
      issue(issues, 'invalid_value', '$.type', '$.type is not a supported request type.');
  }

  if (issues.length > 0) return { decoded: false, issues: Object.freeze(issues) };
  return {
    decoded: true,
    request: deepFreeze(structuredClone(record)) as unknown as GovernanceServiceRequest,
  };
}
