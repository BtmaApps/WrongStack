/** Every `bun build --compile` target scripts/build-binaries.mjs knows. */
export declare const ALL_TARGETS: string[];

export interface BinaryBuildOptions {
  targets: string[];
  skipBuild: boolean;
}

/** Parse and validate standalone binary build arguments. */
export declare function parseBinaryBuildArgs(argv: string[]): BinaryBuildOptions;

/** Release asset name for a build target, e.g. `wstack-windows-x64.exe`. */
export declare function outputName(target: string): string;
