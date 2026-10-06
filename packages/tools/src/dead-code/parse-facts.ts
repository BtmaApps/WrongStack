/** Per-file fact shapes produced by `extractModuleFacts` (see parse.ts). */

export interface ImportedName {
  /** Name in the target module's export table (`default` for default imports). */
  imported: string;
  typeOnly: boolean;
}

export type ImportKind =
  | 'import'
  | 'dynamic'
  | 'require'
  | 'side-effect'
  | 'type-import'
  | 'mock'
  | 'glob';

export interface ImportFact {
  spec: string;
  kind: ImportKind;
  /** `'all'` = every export may be used (namespace passed around, opaque dynamic import). */
  names: ImportedName[] | 'all';
  line: number;
}

export interface ReExportFact {
  spec: string;
  /** `export * from` */
  star: boolean;
  /** `export * as ns from` */
  namespace?: string | undefined;
  names: Array<{ imported: string; exported: string; typeOnly: boolean }>;
  line: number;
  /** `import { x } from './m'; export { x };` — removed through the export list. */
  viaImport?: boolean | undefined;
}

export interface ExportFact {
  /** Exported name (`default` for default exports). */
  name: string;
  /** Local binding behind the export, when there is one. */
  local: string | null;
  kind: string;
  typeOnly: boolean;
  line: number;
  endLine: number;
  /** The local binding is referenced elsewhere in the file. */
  usedLocally: boolean;
  /** `@public` / `@keep` / `dead-code-ignore` — never report. */
  keep: boolean;
  /** Set when only a human can remove it (destructured or multi-declarator statement…). */
  manual?: string | undefined;
  /**
   * Named in the signature of another exported declaration (`stats(): Stats`).
   * Code elsewhere can infer that type, and declaration emit then needs the name.
   */
  surfaced?: boolean | undefined;
}

export interface LocalFact {
  name: string;
  kind: string;
  line: number;
  endLine: number;
  refs: number;
  keep: boolean;
  manual?: string | undefined;
}

export interface ModuleFacts {
  imports: ImportFact[];
  reexports: ReExportFact[];
  exports: ExportFact[];
  locals: LocalFact[];
  /** String literals shaped like code-file paths (`new URL('./w.ts', …)`, `fork('child.js')`). */
  pathLiterals: string[];
  /** Strings shaped like npm package names (`'jsdom'`, `'@scope/pkg'`) — config-style dependency use. */
  packageLiterals: string[];
  /** Static prefixes of template-literal dynamic imports (`import(\`./locales/${x}\`)`). */
  dynamicPrefixes: string[];
  /** Dynamic imports / requires whose specifier is fully computed. */
  opaqueDynamicImports: number;
  /** `module.exports` / `exports.x =` — the export table is not statically knowable. */
  commonJs: boolean;
  /** `dead-code-ignore-file` marker at the top of the file. */
  ignoreFile: boolean;
  /** JSX/TSX syntax present (used only for diagnostics). */
  parseErrors: number;
}
