/**
 * TechStack — .NET ecosystem adapter.
 *
 * Parses .csproj files and project.assets.json to produce
 * DependencyObservation[] for .NET workspaces.
 *
 * @see docs/specs/techstack-sdd.md §6 Tier A
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { constructPurl } from '../registry/purl.js';
import type { DependencyObservation, EcosystemId, Evidence, Workspace } from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { parseXmlAttributes, xmlTagValue } from './parse-utils.js';
import { lockfileEvidence, manifestEvidence, workspaceRoot } from './paths.js';

// ── Minimal XML parser for .csproj ────────────────────────────────────────

interface CsprojPackageRef {
  readonly name: string;
  readonly version: string | undefined;
}

/**
 * Parse a .csproj file to extract PackageReference items.
 * Handles:
 *   <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
 *   <PackageReference Include="Serilog" Version="4.2.0">
 *     <PrivateAssets>all</PrivateAssets>
 *   </PackageReference>
 *   <PackageReference Include="Microsoft.AspNetCore.App" />
 *   Condition attributes are ignored.
 */
function parseCsproj(content: string): CsprojPackageRef[] {
  const refs: CsprojPackageRef[] = [];
  const regex = /<PackageReference\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PackageReference>)/gi;
  for (const match of content.matchAll(regex)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const parsedAttributes = parseXmlAttributes(attributes);
    const name = parsedAttributes.get('Include');
    if (!name) continue;
    const version = parsedAttributes.get('Version') ?? xmlTagValue(body, 'Version');
    refs.push({ name, version });
  }
  return refs;
}

/**
 * Parse project.assets.json for resolved dependency versions.
 * Format: {
 *   "libraries": {
 *     "Newtonsoft.Json/13.0.3": { ... },
 *     "Serilog/4.2.0": { ... }
 *   }
 * }
 */
function parseProjectAssetsJson(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  try {
    const json = JSON.parse(content) as {
      libraries?: Record<string, { type?: string }>;
    };
    if (json.libraries) {
      for (const key of Object.keys(json.libraries)) {
        // Format: "PackageName/Version"
        const sepIndex = key.lastIndexOf('/');
        if (sepIndex >= 0) {
          const name = key.slice(0, sepIndex);
          const version = key.slice(sepIndex + 1);
          if (name && version) {
            versions.set(name, version);
          }
        }
      }
    }
  } catch {
    // Malformed JSON
  }
  return versions;
}

// ── Adapter ────────────────────────────────────────────────────────────────

export class DotNetAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'dotnet';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const root = workspaceRoot(workspace, options);
    const seen = new Set<string>();

    // Find .csproj file via readdirSync
    let csprojPath: string | undefined;
    try {
      const files = await readdir(root);
      const csproj = files.find((f) => f.endsWith('.csproj'));
      if (csproj) csprojPath = join(root, csproj);
    } catch {
      // Can't read directory
    }

    if (!csprojPath) return [];

    let csprojContent: string;
    try {
      csprojContent = await readFile(csprojPath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(csprojPath);

    // Parse PackageReferences
    const refs = parseCsproj(csprojContent);

    // Read the NuGet restore graph for locked versions. NuGet writes it to
    // `<project>/obj/project.assets.json`; probing only the workspace root meant
    // the read never succeeded in a real layout, so `locked` silently fell back
    // to the csproj declaration and no lockfile evidence was attached — a
    // floating declaration such as `13.*` was then reported as the resolved
    // version. Discovery-reported lockfiles come first, then both known paths.
    const assetsCandidates = [
      ...workspace.lockfiles.filter((f) => f.endsWith('project.assets.json')),
      join(root, 'obj', 'project.assets.json'),
      join(root, 'project.assets.json'),
    ];
    let lockVersions = new Map<string, string>();
    let lockEv: Evidence | undefined;
    for (const candidate of assetsCandidates) {
      try {
        const assetsContent = await readFile(candidate, 'utf-8');
        lockVersions = parseProjectAssetsJson(assetsContent);
        lockEv = lockfileEvidence(candidate);
        break;
      } catch {
        // Try the next known location.
      }
    }

    for (const ref of refs) {
      if (seen.has(ref.name)) continue;
      seen.add(ref.name);

      const locked = lockVersions.get(ref.name) || ref.version;

      // .NET PackageReferences are always registry (NuGet)
      // constructPurl maps the ecosystem id to the canonical PURL type
      // (`pkg:nuget/…`); the raw id (`pkg:dotnet/…`) is unresolvable by this
      // package's own parsePurlEcosystem and by OSV advisory queries.
      const purl = locked
        ? constructPurl('dotnet', ref.name, locked)
        : constructPurl('dotnet', ref.name);

      const evidence: Evidence[] = [manifestEv];
      if (lockEv && lockVersions.has(ref.name)) evidence.push(lockEv);

      observations.push({
        id: `dep-${workspace.id}-${ref.name}`,
        workspaceId: workspace.id,
        purl,
        ecosystem: 'dotnet',
        name: ref.name,
        sourceType: 'registry',
        direct: true,
        scope: 'runtime',
        ...(ref.version ? { requested: ref.version } : {}),
        ...(locked ? { locked } : {}),
        status: 'current',
        evidence,
      });
    }

    return observations;
  }
}

/**
 * Default singleton instance.
 */
export const dotNetAdapter = new DotNetAdapter();
