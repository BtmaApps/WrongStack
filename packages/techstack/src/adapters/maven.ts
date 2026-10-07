/**
 * TechStack — Maven ecosystem adapter (Tier B).
 *
 * Parses pom.xml for direct dependencies. Partial support — no lockfile
 * parsing (Maven has no standardized lockfile); version resolution
 * requires `mvn dependency:tree` which is not invoked here.
 *
 * @see docs/archive/specs/techstack-sdd.md §6 Tier B
 */

import { readFileSync } from 'node:fs';
import { constructPurl } from '../registry/purl.js';
import type { DependencyObservation, DependencyScope, EcosystemId, Workspace } from '../types.js';
import type { EcosystemAdapter, InventoryOptions } from './interface.js';
import { stripXmlComments, xmlTagValue } from './parse-utils.js';
import { manifestEvidence, resolveIn, workspaceRoot } from './paths.js';

interface MavenDependency {
  readonly groupId: string;
  readonly artifactId: string;
  readonly version?: string | undefined;
  readonly scope?: string | undefined;
}

/**
 * Resolve `${key}` property references in a version string.
 *
 * Maven properties may reference OTHER properties, and this parser stores each
 * property's RAW value, so a single substitution pass replaced `${a}` with the
 * literal text `${b}` and stopped — leaving the placeholder in the version and
 * therefore in the purl (`pkg:maven/g/a@${b}`), an identity no registry can
 * resolve. Resolve to a fixed point instead, bounded so mutually recursive
 * properties terminate rather than hang.
 *
 * An unknown key is left verbatim, preserving the existing deliberate
 * behaviour: it is not a resolvable version.
 */
function resolveProperties(value: string, properties: ReadonlyMap<string, string>): string {
  let current = value;
  // Each productive pass consumes one property, so |properties| passes is a
  // bound well above any acyclic chain; the cap is what makes cycles terminate.
  for (let pass = 0; pass <= properties.size; pass++) {
    const next = current.replace(
      /\$\{([^}]+)\}/g,
      (whole, key: string) => properties.get(key) ?? whole,
    );
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Minimal XML parser for `<dependency>` blocks inside pom.xml.
 * Does not handle inheritance/dependencyManagement — this is Tier B partial.
 */
function parsePomDependencies(source: string): MavenDependency[] {
  const xml = stripXmlComments(source);
  const deps: MavenDependency[] = [];
  const properties = new Map<string, string>();
  const propertiesBlock = /<properties>([\s\S]*?)<\/properties>/.exec(xml)?.[1] ?? '';
  const propertyRegex = /<([A-Za-z0-9_.-]+)>\s*([^<]+?)\s*<\/\1>/g;
  for (const propertyMatch of propertiesBlock.matchAll(propertyRegex)) {
    const key = propertyMatch[1];
    const value = propertyMatch[2];
    if (key && value) properties.set(key, value.trim());
  }
  const parentBlock = /<parent>([\s\S]*?)<\/parent>/.exec(xml)?.[1];
  if (parentBlock) {
    const parentVersion = xmlTagValue(parentBlock, 'version');
    const parentGroup = xmlTagValue(parentBlock, 'groupId');
    if (parentVersion) {
      properties.set('parent.version', parentVersion);
      properties.set('project.parent.version', parentVersion);
    }
    if (parentGroup) {
      properties.set('parent.groupId', parentGroup);
      properties.set('project.parent.groupId', parentGroup);
    }
  }
  // The project's own coordinates, read from top-level tags only (the parent,
  // dependency, build and profile sections carry groupId/version tags of their
  // own). Multi-module builds pin sibling modules with `${project.version}` /
  // `${project.groupId}`; left unresolved they became the literal coordinate
  // `${project.groupId}:app-core@${project.version}`. Both inherit from the
  // parent when the project omits them, as Maven does.
  const projectLevel = xml
    .replace(/<parent>[\s\S]*?<\/parent>/g, '')
    .replace(
      /<(dependencyManagement|dependencies|build|reporting|profiles|properties)>[\s\S]*?<\/\1>/g,
      '',
    );
  const projectGroup = xmlTagValue(projectLevel, 'groupId') ?? properties.get('parent.groupId');
  const projectVersion = xmlTagValue(projectLevel, 'version') ?? properties.get('parent.version');
  if (projectGroup) {
    properties.set('project.groupId', projectGroup);
    properties.set('pom.groupId', projectGroup);
  }
  if (projectVersion) {
    properties.set('project.version', projectVersion);
    properties.set('pom.version', projectVersion);
  }

  const managed = new Map<string, string>();
  const managementBlock =
    /<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/.exec(xml)?.[1] ?? '';
  const managementRegex = /<dependency>\s*([\s\S]*?)<\/dependency>/g;
  for (const managementMatch of managementBlock.matchAll(managementRegex)) {
    const block = managementMatch[1];
    if (!block) continue;
    const rawGroupId = xmlTagValue(block, 'groupId');
    const groupId =
      rawGroupId === undefined ? undefined : resolveProperties(rawGroupId, properties);
    const artifactId = xmlTagValue(block, 'artifactId');
    const version = xmlTagValue(block, 'version');
    if (groupId && artifactId && version) managed.set(`${groupId}:${artifactId}`, version);
  }

  // `<build>`/`<reporting>` hold PLUGIN dependencies (a plugin's own classpath),
  // not the project's: inventorying them listed ant-contrib as a runtime dep.
  const directXml = xml.replace(/<(dependencyManagement|build|reporting)>[\s\S]*?<\/\1>/g, '');
  const depRegex = /<dependency>\s*([\s\S]*?)<\/dependency>/g;
  for (const match of directXml.matchAll(depRegex)) {
    const block = match[1]!;
    const rawGroupId = xmlTagValue(block, 'groupId');
    const groupId =
      rawGroupId === undefined ? undefined : resolveProperties(rawGroupId, properties);
    const artifactId = xmlTagValue(block, 'artifactId');
    const rawVersion =
      xmlTagValue(block, 'version') ??
      (groupId && artifactId ? managed.get(`${groupId}:${artifactId}`) : undefined);
    const version =
      rawVersion === undefined ? undefined : resolveProperties(rawVersion, properties);
    const scope = xmlTagValue(block, 'scope');
    if (groupId && artifactId) {
      deps.push({ groupId, artifactId, version, scope });
    }
  }
  return deps;
}

function mavenScopeToScope(scope: string | undefined): DependencyScope {
  switch (scope) {
    case 'test':
      return 'development';
    case 'provided':
      return 'optional';
    case 'runtime':
      return 'runtime';
    case 'compile':
      return 'runtime';
    default:
      return 'runtime';
  }
}

export class MavenAdapter implements EcosystemAdapter {
  readonly ecosystem: EcosystemId = 'maven';

  async inventory(
    workspace: Workspace,
    options: InventoryOptions,
  ): Promise<readonly DependencyObservation[]> {
    const observations: DependencyObservation[] = [];
    const pomPath = workspace.manifests.find((m) => m.includes('pom.xml'));
    if (!pomPath) return [];
    const resolvedPomPath = resolveIn(workspaceRoot(workspace, options), pomPath);

    let content: string;
    try {
      content = readFileSync(resolvedPomPath, 'utf-8');
    } catch {
      return [];
    }

    const manifestEv = manifestEvidence(resolvedPomPath);
    const deps = parsePomDependencies(content);
    const seen = new Set<string>();

    for (const dep of deps) {
      const name = `${dep.groupId}:${dep.artifactId}`;
      if (seen.has(name)) continue;
      seen.add(name);

      // constructPurl splits the native groupId:artifactId coordinate into the
      // canonical purl namespace/name form (`pkg:maven/group/artifact`); the
      // raw coordinate as one name segment produced `pkg:maven/group:artifact`,
      // which spec-conformant consumers (OSV) can never match.
      const purl = dep.version
        ? constructPurl('maven', name, dep.version)
        : constructPurl('maven', name);

      observations.push({
        id: `dep-${workspace.id}-${name}`,
        workspaceId: workspace.id,
        purl,
        ecosystem: 'maven',
        name,
        sourceType: 'registry',
        direct: true,
        scope: mavenScopeToScope(dep.scope),
        ...(dep.version ? { requested: dep.version } : {}),
        status: 'current',
        evidence: [manifestEv],
      });
    }

    return observations;
  }
}

export const mavenAdapter = new MavenAdapter();
