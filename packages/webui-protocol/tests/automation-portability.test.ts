import { describe, expect, it } from 'vitest';
import type { AutomationJobInput } from '../src/automation.js';
import { exportAutomationJob, importAutomationJob } from '../src/automation-portability.js';

const job: AutomationJobInput = {
  name: 'test',
  image: 'trusted:1',
  prompt: 'Review',
  enabled: true,
  yolo: true,
  timeoutMs: 60000,
  envNames: ['KEY'],
  credentials: [{ profile: 'work', provider: 'alias', keyLabel: 'primary', envName: 'OTHER_KEY' }],
  template: { id: 'test-triage', version: 1 },
};
describe('portable automation definitions', () => {
  it.each([null, undefined, [], 'document', 1])('rejects an invalid document %s', (document) => {
    expect(() => importAutomationJob(document)).toThrow('Invalid automation document');
  });
  it.each([null, undefined, [], 'spec', 1])('rejects an invalid spec %s', (spec) => {
    expect(() => importAutomationJob({ type: 'wrongstack.automation', version: 1, spec })).toThrow(
      'Invalid automation spec',
    );
  });
  it.each([null, 'ref', {}, [null], ['ref'], [[]]])(
    'rejects malformed credential references %s',
    (credentials) => {
      expect(() =>
        importAutomationJob({
          type: 'wrongstack.automation',
          version: 1,
          spec: { ...job, credentials },
        }),
      ).toThrow('Credential values cannot');
    },
  );
  it('supports jobs without credential references', () => {
    const { credentials: _credentials, ...withoutCredentials } = job;
    expect(
      importAutomationJob(exportAutomationJob(withoutCredentials)).credentials,
    ).toBeUndefined();
  });
  it('refuses a wrong document type and unknown envelope fields', () => {
    expect(() => importAutomationJob({ type: 'other', version: 1, spec: job })).toThrow(
      'Unsupported',
    );
    expect(() =>
      importAutomationJob({
        type: 'wrongstack.automation',
        version: 1,
        spec: job,
        token: 'secret',
      }),
    ).toThrow('Unsupported');
  });
  it('drops machine/project identity and disables imported dispatch/permissions', () => {
    const document = exportAutomationJob({
      ...job,
      id: 'machine',
      projectRoot: 'private',
      revision: 8,
    } as AutomationJobInput);
    expect(JSON.stringify(document)).not.toContain('private');
    expect(importAutomationJob(document)).toMatchObject({
      enabled: false,
      yolo: false,
      credentials: job.credentials,
      template: job.template,
    });
  });
  it.each(['projectRoot', 'apiKey', 'token', 'id'])(
    'refuses a foreign or secret spec field %s',
    (field) => {
      expect(() =>
        importAutomationJob({
          type: 'wrongstack.automation',
          version: 1,
          spec: { ...job, [field]: 'secret' },
        }),
      ).toThrow('unsupported or secret');
    },
  );
  it('rejects unsupported document versions', () => {
    expect(() =>
      importAutomationJob({ type: 'wrongstack.automation', version: 2, spec: job }),
    ).toThrow('Unsupported');
  });
  it('never exports or imports a value smuggled into a credential reference', () => {
    const tainted = { ...job, credentials: [{ ...job.credentials![0]!, apiKey: 'SECRET_VALUE' }] };
    expect(JSON.stringify(exportAutomationJob(tainted))).not.toContain('SECRET_VALUE');
    expect(() =>
      importAutomationJob({ type: 'wrongstack.automation', version: 1, spec: tainted }),
    ).toThrow('values cannot');
  });
});
