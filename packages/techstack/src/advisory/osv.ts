/**
 * TechStack — OSV (Open Source Vulnerabilities) advisory client.
 *
 * Uses the OSV /v1/querybatch endpoint to batch-query vulnerability
 * information for lists of PackageURLs. Chunks requests into batches
 * of at most 500 packages per the OSV API limits.
 *
 * @see https://osv.dev/docs/
 */

import { parseJsonResponse, requestWithRetry } from '../registry/http-fetch.js';
import type { Evidence } from '../types.js';
import { cvssBaseScore } from './cvss.js';

// ── Types ─────────────────────────────────────────────────────────────────

/** OSV query batch request shape */
interface OsvQueryBatchRequest {
  readonly queries: ReadonlyArray<{
    readonly package: {
      readonly purl: string;
    };
  }>;
}

/** OSV query batch response shape */
interface OsvQueryBatchResponse {
  readonly results: ReadonlyArray<{
    readonly vulns?: ReadonlyArray<{
      readonly id: string;
      readonly summary?: string;
      readonly details?: string;
      readonly aliases?: readonly string[];
      readonly severity?: ReadonlyArray<{
        readonly type: string;
        readonly score: string;
      }>;
      readonly database_specific?: {
        readonly severity?: string;
      };
      readonly affected?: ReadonlyArray<{
        readonly database_specific?: {
          readonly severity?: string;
        };
      }>;
    }>;
  }>;
}

/**
 * One OSV record as returned by /v1/querybatch (stub: id + modified) and
 * /v1/vulns/{id} (full: summary/details/severity vectors/database_specific).
 */
type OsvVulnRecord = NonNullable<OsvQueryBatchResponse['results'][number]['vulns']>[number];

/** Parsed advisory for a single package */
export interface OsvAdvisory {
  readonly id: string;
  readonly summary: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly aliases: readonly string[];
}

/** Result of querying OSV for a batch of packages */
export interface OsvBatchResult {
  /** Map from PURL to advisories found for that package */
  readonly advisories: Map<string, readonly OsvAdvisory[]>;
  readonly evidence: Evidence;
}

// ── Constants ──────────────────────────────────────────────────────────────

const OSV_API_BASE = 'api.osv.dev';
const OSV_QUERY_BATCH_PATH = '/v1/querybatch';
const MAX_BATCH_SIZE = 500;

// ── Severity mapping ───────────────────────────────────────────────────────

function mapSeverity(
  osvSeverity?: ReadonlyArray<{ readonly type: string; readonly score: string }>,
  databaseSeverity?: string,
): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  // Check CVSS score first. OSV `score` is either a plain number or the full
  // CVSS vector string (`CVSS:3.1/...`); parseFloat on a vector yields NaN,
  // so vectors are computed to their base score (see cvss.ts).
  if (osvSeverity && osvSeverity.length > 0) {
    for (const s of osvSeverity) {
      if (s.type === 'CVSS_V3' || s.type === 'CVSS_V2') {
        const direct = Number(s.score);
        const score =
          s.score.trim() !== '' && Number.isFinite(direct)
            ? direct
            : cvssBaseScore(s.type, s.score);
        if (score === undefined || Number.isNaN(score)) continue;
        if (score >= 9.0) return 'critical';
        if (score >= 7.0) return 'high';
        if (score >= 4.0) return 'medium';
        if (score >= 0.1) return 'low';
      }
    }
  }

  // Check database_specific severity
  if (databaseSeverity) {
    const ds = databaseSeverity.toLowerCase();
    if (ds === 'critical') return 'critical';
    if (ds === 'high') return 'high';
    if (ds === 'medium' || ds === 'moderate') return 'medium';
    if (ds === 'low') return 'low';
  }

  return 'info';
}

const OSV_VULN_PATH_PREFIX = '/v1/vulns/';
/** Cap on GET /v1/vulns/{id} hydration lookups per call (cache hits are free). */
const DEFAULT_MAX_VULN_LOOKUPS = 25;

/** Process-level hydration cache: one GET per vuln id per process. */
const vulnDetailCache = new Map<string, OsvVulnRecord>();

export interface OsvBatchOptions {
  readonly signal?: AbortSignal | undefined;
  /**
   * Cap on GET /v1/vulns/{id} lookups per call for severity/summary
   * hydration. Cache hits are free; 0 disables hydration and degrades every
   * advisory to the querybatch stub mapping (severity 'info').
   */
  readonly maxSeverityLookups?: number | undefined;
}

/**
 * Fetch the full OSV record for one vuln id (GET /v1/vulns/{id}).
 * Best-effort: any failure (404, transport, malformed body) resolves to
 * undefined so the querybatch stub mapping still applies.
 */
async function fetchVulnDetail(
  id: string,
  signal?: AbortSignal,
): Promise<OsvVulnRecord | undefined> {
  try {
    const response = await requestWithRetry({
      hostname: OSV_API_BASE,
      path: `${OSV_VULN_PATH_PREFIX}${encodeURIComponent(id)}`,
      method: 'GET',
      headers: { 'User-Agent': 'WrongStack-TechStack/1.0' },
      signal,
      timeoutMs: 30_000,
      maxAttempts: 2,
    });
    if (response.statusCode !== 200) return undefined;
    return parseJsonResponse<OsvVulnRecord>(response, `api.osv.dev${OSV_VULN_PATH_PREFIX}${id}`);
  } catch {
    return undefined;
  }
}

// ── Core function ──────────────────────────────────────────────────────────

/**
 * Query OSV for advisories matching a list of PackageURLs.
 *
 * Chunks requests into batches of at most 500 PURLs per the OSV API limits.
 * The querybatch endpoint returns ID+modified stubs only (captured live,
 * 2026-09-22), so each unique vuln id is hydrated via GET /v1/vulns/{id} —
 * bounded by `maxSeverityLookups` and cached in-process — to feed real
 * severities and summaries into the advisories. Hydration is best-effort:
 * budget exhaustion or failed lookups degrade to the stub mapping.
 *
 * Returns a map from each queried PURL to its list of advisories (empty array
 * means no advisories found).
 */
export async function queryOsvBatch(
  purls: readonly string[],
  options: OsvBatchOptions = {},
): Promise<OsvBatchResult> {
  const advisories = new Map<string, readonly OsvAdvisory[]>();
  const stubsByPurl = new Map<string, readonly OsvVulnRecord[]>();

  // Initialize empty arrays for all PURLs
  for (const purl of purls) {
    advisories.set(purl, []);
  }

  // Chunk PURLs into batches
  const batches: string[][] = [];
  for (let i = 0; i < purls.length; i += MAX_BATCH_SIZE) {
    batches.push(purls.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const batch of batches) {
    const requestBody: OsvQueryBatchRequest = {
      queries: batch.map((purl) => ({
        package: { purl },
      })),
    };

    const jsonBody = JSON.stringify(requestBody);

    const response = await requestWithRetry({
      hostname: OSV_API_BASE,
      path: OSV_QUERY_BATCH_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody).toString(),
        'User-Agent': 'WrongStack-TechStack/1.0',
      },
      body: jsonBody,
      signal: options.signal,
      timeoutMs: 30_000,
      maxAttempts: 3,
    });
    if (response.statusCode !== 200) {
      throw new Error(`OSV API returned ${response.statusCode}: ${response.body}`);
    }
    const result = parseJsonResponse<OsvQueryBatchResponse>(response, 'api.osv.dev/v1/querybatch');
    for (let i = 0; i < result.results.length; i++) {
      const purl = batch[i];
      if (!purl) continue;
      const vulns = result.results[i]?.vulns;
      if (!vulns || vulns.length === 0) continue;
      stubsByPurl.set(purl, vulns);
    }
  }

  // Hydrate each unique vuln id with its full record. /v1/querybatch returns
  // ID+modified stubs only (captured live, 2026-09-22): without hydration the
  // advisories carry no severity signal at all and every finding surfaces as
  // 'info'. Budget + cache bound the cost; hydration failures degrade to the
  // stub mapping without throwing.
  const budget = Math.max(0, options.maxSeverityLookups ?? DEFAULT_MAX_VULN_LOOKUPS);
  const detailsById = new Map<string, OsvVulnRecord>();
  let lookups = 0;
  for (const stubs of stubsByPurl.values()) {
    for (const vuln of stubs) {
      if (detailsById.has(vuln.id)) continue;
      const cached = vulnDetailCache.get(vuln.id);
      if (cached) {
        detailsById.set(vuln.id, cached);
        continue;
      }
      if (lookups >= budget) continue;
      lookups++;
      const detail = await fetchVulnDetail(vuln.id, options.signal);
      if (detail) {
        vulnDetailCache.set(vuln.id, detail);
        detailsById.set(vuln.id, detail);
      }
    }
  }
  for (const [purl, vulns] of stubsByPurl) {
    advisories.set(
      purl,
      vulns.map((vuln) => {
        const record = detailsById.get(vuln.id) ?? vuln;
        return {
          id: vuln.id,
          summary:
            record.summary ??
            record.details ??
            vuln.summary ??
            vuln.details ??
            'No summary available',
          severity: mapSeverity(
            record.severity ?? vuln.severity,
            record.database_specific?.severity ??
              record.affected?.[0]?.database_specific?.severity ??
              vuln.database_specific?.severity ??
              vuln.affected?.[0]?.database_specific?.severity,
          ),
          aliases: record.aliases ?? vuln.aliases ?? [],
        };
      }),
    );
  }

  const evidence: Evidence = {
    kind: 'osv',
    source: 'https://api.osv.dev/v1/querybatch',
    retrievedAt: new Date().toISOString(),
    detail: `Queried ${purls.length} packages in ${batches.length} batch(es)`,
  };

  return { advisories, evidence };
}

/**
 * Query OSV for a single PURL.
 * Convenience wrapper around queryOsvBatch.
 */
export async function queryOsvSingle(
  purl: string,
  options: OsvBatchOptions = {},
): Promise<readonly OsvAdvisory[]> {
  const result = await queryOsvBatch([purl], options);
  return result.advisories.get(purl) ?? [];
}
