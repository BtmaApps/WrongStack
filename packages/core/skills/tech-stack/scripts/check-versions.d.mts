/** A successful npm registry lookup for one package. */
export interface InspectedPackage {
  package: string;
  version: string;
  latestTag: string;
  selection: string;
  engines: Record<string, string>;
  peerDependencies: Record<string, string>;
  source: string;
  checkedAt: string;
}

/** A lookup that failed; the error is reported instead of throwing. */
export interface FailedPackageInspection {
  package: string;
  source: string;
  checkedAt: string;
  error: string;
}

/** `[major, minor, patch]` for a stable semver core, or undefined for previews. */
export declare function stableVersionParts(version: string): [number, number, number] | undefined;

/** Highest stable, non-deprecated version from published npm version metadata. */
export declare function selectStableVersion(
  versions: Record<string, { deprecated?: unknown } | null | undefined>,
): string | undefined;

export declare function inspectPackage(
  name: string,
): Promise<InspectedPackage | FailedPackageInspection>;
