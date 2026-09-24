/**
 * Build-provenance check for a downloaded standalone executable.
 *
 * SHA256SUMS comes from the same release as the binary, so it catches a
 * corrupted download but not a forged one: whoever can upload the binary can
 * upload a matching SHA256SUMS. The release workflow also attests every
 * binary (`actions/attest-build-provenance`), and GitHub serves those
 * attestations by digest. A binary is accepted only if one of them says this
 * exact digest was built by `binaries.yml`, called from `release.yml`, for the
 * push of the tag `v<version>` in this repository, on a GitHub-hosted runner.
 * A build from a branch or a manual run is not a release and does not count.
 *
 * The Sigstore signature over the statement is not verified here: the
 * statement is trusted as served by GitHub's API over TLS.
 */

/** GitHub repository the standalone executables are released from. */
export const RELEASES_REPO = 'WrongStack/WrongStack';
/** `WrongStack/WrongStack`'s numeric id: survives a rename, unlike the name. */
const RELEASES_REPO_ID = 1237163046;
const REPO_URL = `https://github.com/${RELEASES_REPO}`;
const IN_TOTO_PAYLOAD = 'application/vnd.in-toto+json';
const IN_TOTO_STATEMENT = 'https://in-toto.io/Statement/v1';
const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1';

export interface AttestationSubject {
  /** Release asset name, e.g. `wstack-windows-x64.exe`. */
  assetName: string;
  /** Lowercase hex SHA-256 of the downloaded bytes. */
  sha256: string;
  /** Release version without the `v`, e.g. `1.0.25`. */
  version: string;
}

type Json = Record<string, unknown>;

const obj = (value: unknown): Json | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;

function statementOf(attestation: Json): Json | undefined {
  const envelope = obj(obj(attestation['bundle'])?.['dsseEnvelope']);
  if (envelope?.['payloadType'] !== IN_TOTO_PAYLOAD) return undefined;
  const payload = envelope['payload'];
  if (typeof payload !== 'string') return undefined;
  try {
    return obj(JSON.parse(Buffer.from(payload, 'base64').toString('utf8')));
  } catch {
    return undefined;
  }
}

function vouches(attestation: Json, subject: AttestationSubject): boolean {
  if (attestation['repository_id'] !== RELEASES_REPO_ID) return false;
  const statement = statementOf(attestation);
  if (statement?.['_type'] !== IN_TOTO_STATEMENT) return false;
  if (statement['predicateType'] !== SLSA_PROVENANCE) return false;
  const subjects = Array.isArray(statement['subject']) ? statement['subject'] : [];
  const named = subjects.some((entry) => {
    const s = obj(entry);
    return s?.['name'] === subject.assetName && obj(s['digest'])?.['sha256'] === subject.sha256;
  });
  if (!named) return false;

  const tag = `refs/tags/v${subject.version}`;
  const predicate = obj(statement['predicate']);
  const build = obj(predicate?.['buildDefinition']);
  const workflow = obj(obj(build?.['externalParameters'])?.['workflow']);
  const github = obj(obj(build?.['internalParameters'])?.['github']);
  const builder = obj(obj(predicate?.['runDetails'])?.['builder']);
  return (
    workflow?.['repository'] === REPO_URL &&
    workflow['path'] === '.github/workflows/release.yml' &&
    workflow['ref'] === tag &&
    builder?.['id'] === `${REPO_URL}/.github/workflows/binaries.yml@${tag}` &&
    github?.['event_name'] === 'push' &&
    github['runner_environment'] === 'github-hosted'
  );
}

/** True when the attestations API response vouches for `subject`. */
function attestationsVouchFor(response: unknown, subject: AttestationSubject): boolean {
  const list = obj(response)?.['attestations'];
  if (!Array.isArray(list)) return false;
  return list.some((entry) => {
    const attestation = obj(entry);
    return attestation !== undefined && vouches(attestation, subject);
  });
}

/** Throws unless GitHub holds a release attestation for `subject`. */
export async function verifyReleaseAttestation(
  subject: AttestationSubject,
  signal?: AbortSignal,
): Promise<void> {
  const url = `https://api.github.com/repos/${RELEASES_REPO}/attestations/sha256:${subject.sha256}`;
  const timeout = AbortSignal.timeout(30_000);
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wrongstack-cli' },
  });
  if (res.status === 404) {
    throw new Error(`no build attestation exists for ${subject.assetName}`);
  }
  if (!res.ok) {
    const limited = res.status === 403 || res.status === 429;
    throw new Error(
      limited
        ? 'GitHub API rate limit reached while checking the build attestation; try again later'
        : `GitHub attestations API responded ${res.status}`,
    );
  }
  if (!attestationsVouchFor(await res.json(), subject)) {
    throw new Error(
      `${subject.assetName} has no attestation from the v${subject.version} release workflow`,
    );
  }
}
