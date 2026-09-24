/**
 * The fixtures follow a real attestation GitHub served for the v1.0.25
 * `wstack-windows-x64.exe` (two exist for that digest: one from the tag push,
 * one from a manual run on `main`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AttestationSubject, verifyReleaseAttestation } from '../src/release-attestation.js';

const SHA = 'ef3d0f4b199f18555ed56bd5e32a68dfb853db560eb421086d219f2ccf59b2bc';
const subject: AttestationSubject = {
  assetName: 'wstack-windows-x64.exe',
  sha256: SHA,
  version: '1.0.25',
};

interface Shape {
  ref?: string;
  event?: string;
  builderRef?: string;
  builderWorkflow?: string;
  repositoryId?: number;
  repository?: string;
  subjects?: Array<{ name: string; digest: { sha256: string } }>;
  runner?: string;
}

function attestation(shape: Shape = {}): Record<string, unknown> {
  const ref = shape.ref ?? 'refs/tags/v1.0.25';
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: shape.subjects ?? [
      { name: 'SHA256SUMS', digest: { sha256: 'a'.repeat(64) } },
      { name: 'wstack-windows-x64.exe', digest: { sha256: SHA } },
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref,
            repository: shape.repository ?? 'https://github.com/WrongStack/WrongStack',
            path: '.github/workflows/release.yml',
          },
        },
        internalParameters: {
          github: {
            event_name: shape.event ?? 'push',
            runner_environment: shape.runner ?? 'github-hosted',
          },
        },
      },
      runDetails: {
        builder: {
          id: `https://github.com/WrongStack/WrongStack/.github/workflows/${shape.builderWorkflow ?? 'binaries.yml'}@${shape.builderRef ?? ref}`,
        },
      },
    },
  };
  return {
    repository_id: shape.repositoryId ?? 1237163046,
    bundle: {
      mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
      dsseEnvelope: {
        payloadType: 'application/vnd.in-toto+json',
        payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
      },
    },
  };
}

const response = (...list: unknown[]) => ({ attestations: list });

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubFetch = (status: number, body: unknown = {}) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** Whether GitHub answering `body` gets `target` accepted. */
async function attestationsVouchFor(body: unknown, target: AttestationSubject): Promise<boolean> {
  stubFetch(200, body);
  return verifyReleaseAttestation(target).then(
    () => true,
    () => false,
  );
}

describe('which attestation vouches for a download', () => {
  it('accepts the release build of the tag', async () => {
    expect(await attestationsVouchFor(response(attestation()), subject)).toBe(true);
  });

  it('finds the release attestation among others for the same digest', async () => {
    const manualRun = attestation({ ref: 'refs/heads/main', event: 'workflow_dispatch' });
    expect(await attestationsVouchFor(response(manualRun, attestation()), subject)).toBe(true);
  });

  it('refuses a build that was not the push of this version tag', async () => {
    const cases: Shape[] = [
      { ref: 'refs/heads/main', event: 'workflow_dispatch' },
      { event: 'workflow_dispatch' },
      { ref: 'refs/tags/v1.0.24' },
      { builderRef: 'refs/heads/main' },
      { builderWorkflow: 'ci.yml' },
      { runner: 'self-hosted' },
    ];
    for (const shape of cases) {
      expect(
        await attestationsVouchFor(response(attestation(shape)), subject),
        JSON.stringify(shape),
      ).toBe(false);
    }
  });

  it('refuses another repository, even under the same name', async () => {
    expect(await attestationsVouchFor(response(attestation({ repositoryId: 1 })), subject)).toBe(
      false,
    );
    expect(
      await attestationsVouchFor(
        response(attestation({ repository: 'https://github.com/someone/WrongStack' })),
        subject,
      ),
    ).toBe(false);
  });

  it('refuses when the digest belongs to another asset', async () => {
    const swapped = attestation({
      subjects: [{ name: 'wstack-linux-x64', digest: { sha256: SHA } }],
    });
    expect(await attestationsVouchFor(response(swapped), subject)).toBe(false);
    expect(
      await attestationsVouchFor(response(attestation()), { ...subject, sha256: 'b'.repeat(64) }),
    ).toBe(false);
  });

  it('refuses malformed responses', async () => {
    expect(await attestationsVouchFor(undefined, subject)).toBe(false);
    expect(await attestationsVouchFor({}, subject)).toBe(false);
    const broken = attestation();
    (broken['bundle'] as { dsseEnvelope: { payload: string } }).dsseEnvelope.payload = '%%%';
    expect(await attestationsVouchFor(response(broken), subject)).toBe(false);
  });
});

describe('verifyReleaseAttestation', () => {
  it('asks GitHub for the digest and accepts a vouching response', async () => {
    const fetchMock = stubFetch(200, response(attestation()));
    await expect(verifyReleaseAttestation(subject)).resolves.toBeUndefined();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      `https://api.github.com/repos/WrongStack/WrongStack/attestations/sha256:${SHA}`,
    );
  });

  it('says why it refused', async () => {
    stubFetch(404);
    await expect(verifyReleaseAttestation(subject)).rejects.toThrow('no build attestation exists');
    stubFetch(403);
    await expect(verifyReleaseAttestation(subject)).rejects.toThrow('rate limit');
    stubFetch(200, response(attestation({ ref: 'refs/heads/main' })));
    await expect(verifyReleaseAttestation(subject)).rejects.toThrow(
      'has no attestation from the v1.0.25 release workflow',
    );
  });
});
