# Deterministic Multi-Language Support System — Design

**Status:** Phase 0, Phase 1, and Phase 2 implemented; later phases proposed  
**Implementation:** `packages/tools/src/languages/`, `language_info`, and the confirm-gated `language` builtin  
**Scope:** `@wrongstack/tools`, with future consumers in CLI project facts, LSP, and plugins  
**Primary languages:** Go, TypeScript/JavaScript, Rust, PHP, C#/.NET  
**Additional first-party profiles:** Python, Java/Kotlin, Ruby, C/C++, Swift, Dart/Flutter, Elixir, Shell

> **Status checked 2026-10-06:** mixed implementation and proposal. The
> `language_info`, `language`, and `language_package` tools are registered in
> `packages/tools/src/builtin.ts`; implementation lives in `packages/tools/src/languages/`.
> The design below is retained as a contract proposal. Its complete acceptance
> criteria have not been certified by this documentation review.

## 1. Problem

WrongStack already knows fragments of several language ecosystems, but the knowledge is duplicated and inconsistent:

- `packages/tools/src/{typecheck,lint,test,format,install}.ts` primarily assume Node/TypeScript.
- `packages/cli/src/services/project-facts.ts` detects many manifests and emits shell command strings.
- `packages/plug-lsp/src/{language-detect,presets}.ts` owns a separate language and root-marker map.
- `packages/plugins/src/runtime/index.ts` provides safe argv execution, but each plugin still defines its own runtime and flags.
- `packages/tools/src/_syntax-check.ts` validates TypeScript/JavaScript and JSON/JSONC only.

As a result, the LLM must remember ecosystem-specific commands, select flags, interpret unstructured output, and compensate for different platform conventions. That is both unreliable and unnecessary: these decisions are mostly deterministic.

The system should turn language operations into a small planning problem:

```text
workspace evidence + requested intent + immutable language profile
                         ↓
               exact executable + argv
                         ↓
       bounded execution + normalized diagnostics
                         ↓
               structured evidence for the LLM
```

The LLM decides **what it wants to learn or change** (`check`, `test`, `add dependency`); the language layer decides **which known command implements that intent**.

## 2. Goals

1. Detect language workspaces and toolchains from bounded, local evidence.
2. Provide predefined operations for syntax, semantic checks, linting, formatting, tests, debugging evidence, builds, and package management.
3. Produce exact argv arrays; never ask the LLM to construct a shell command.
4. Normalize results into stable diagnostics while retaining bounded raw output.
5. Work in polyglot monorepos and select the nearest applicable workspace for a target file.
6. Preserve WrongStack's permission, cancellation, path-containment, output-cap, and side-effect contracts.
7. Allow new languages to be added as data plus small adapters, not new top-level tools.
8. Keep existing `typecheck`, `lint`, `format`, `test`, `install`, `audit`, and `outdated` tool names compatible.

## 3. Non-goals

- Reimplementing compilers, package managers, debuggers, or language servers.
- Automatically installing a missing compiler, SDK, debugger, or LSP server.
- Accepting arbitrary command templates from a repository-controlled config file.
- Guaranteeing that a compiler/build is side-effect free. Cargo build scripts, MSBuild tasks, Maven/Gradle plugins, Composer scripts, and Node lifecycle scripts can execute project code.
- Replacing LSP. LSP remains the best source for live editor diagnostics, symbol navigation, and code actions; this system owns repeatable command-line checks.
- Inferring a single “primary language” for an entire monorepo.

## 4. User-facing tools

Add three tier-2 tools, not one tool per language:

1. `language_info` — read-only `detect | plan | capabilities`; `permission: 'auto'`, `mutating: false`, `capabilities: ['fs.read']`.
2. `language` — executes `check | test | lint | format | build | debug`; `permission: 'confirm'`, with filesystem-write and restricted-shell capabilities.
3. `language_package` — executes `install | add | remove | update | audit | outdated`; `permission: 'confirm'`, with package-install and outbound-network capabilities.

This split is required by the current `Tool` contract: permission, mutation, and capabilities are declared statically on a tool, before execution. Mixing an auto-approved planning action with execution would either over-prompt harmless discovery or understate risk; mixing package mutation into the check tool would grant package/network capabilities to subagents that only need compilers. Three broad tools still keep prompt cost far below one tool per language while preserving least privilege and honest security metadata.

```ts
interface LanguageInfoInput {
  action: 'detect' | 'plan' | 'capabilities';
  cwd?: string;
  target?: string;
  language?: LanguageProfileId;
  workspace?: string;
  operation?: LanguageOperation; // required for plan
  mode?: 'fast' | 'standard' | 'thorough';
  options?: LanguageOperationOptions;
}

interface LanguageToolInput {
  action: 'check' | 'test' | 'lint' | 'format' | 'build' | 'debug';
  cwd?: string;
  target?: string;
  language?: LanguageProfileId;
  workspace?: string;
  mode?: 'fast' | 'standard' | 'thorough';
  check?: 'syntax' | 'semantic' | 'all';
  test?: {
    filter?: string;
    coverage?: boolean;
    noRun?: boolean;
  };
  debug?: {
    symptom?: 'compile' | 'test' | 'runtime' | 'race' | 'dependency';
    filter?: string;
  };
}

interface LanguagePackageToolInput {
  operation: 'install' | 'add' | 'remove' | 'update' | 'audit' | 'outdated';
  cwd?: string;
  language?: LanguageProfileId;
  workspace?: string;
  names?: string[];
  scope?: 'runtime' | 'development' | 'optional';
  dryRun?: boolean;
  allowScripts?: boolean; // always false unless explicitly opted in
}
```

The `language` execution schema uses `action` plus optional fields because WrongStack's schema validator intentionally does not implement `oneOf`. A `validate()` hook enforces action-specific invariants before permission checks. `language_package` has a separate narrow schema, and `language_info(action='plan')` accepts a normalized operation option object but never spawns a process.

### Selection boundary

- Use `language_info` to detect workspaces, inspect capabilities, and preview the exact plan.
- Use `language` for ecosystem-aware checks, tests, builds, formatting, and debug evidence.
- Use `language_package` for dependency restore, mutation, audit, and outdated checks.
- Keep `exec` for a known, explicit allowlisted command that has no profile operation.
- Keep `bash` for genuinely custom pipelines only.
- Use LSP diagnostics/navigation for live, file-local editor intelligence.

## 5. Core domain model

Place the implementation in a Node-only `@wrongstack/tools/languages` subpath. `core` must not depend on it; `tools`, CLI, plugins, and `plug-lsp` may consume it without reversing the package graph.

```ts
export type LanguageProfileId =
  | 'typescript' | 'javascript' | 'go' | 'rust' | 'php' | 'csharp'
  | 'python' | 'java' | 'kotlin' | 'ruby' | 'c' | 'cpp'
  | 'swift' | 'dart' | 'elixir' | 'shell';

export type LanguageOperation =
  | 'syntax' | 'semantic' | 'lint' | 'format-check' | 'format-write'
  | 'test-compile' | 'test' | 'build' | 'debug-compile'
  | 'debug-test' | 'debug-runtime' | 'debug-race'
  | 'package-install' | 'package-add' | 'package-remove'
  | 'package-update' | 'package-audit' | 'package-outdated';

export interface LanguageEvidence {
  kind: 'manifest' | 'lockfile' | 'config' | 'source' | 'tool' | 'workspace';
  path?: string;
  value: string;
  weight: number;
}

export interface DetectedWorkspace {
  id: string;                 // stable hash of profile id + canonical root
  language: LanguageProfileId;
  root: string;               // canonical, project-contained root
  confidence: number;         // 0..1, derived only from profile weights
  evidence: LanguageEvidence[];
  packageManager?: string;
  manifests: string[];
  capabilities: LanguageOperation[];
  unavailable: Array<{ operation: LanguageOperation; reason: string }>;
}

export interface CommandPlan {
  profileId: string;
  workspaceId: string;
  operation: LanguageOperation;
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  outputLimitBytes: number;
  mutating: boolean;
  network: boolean;
  executesProjectCode: boolean;
  reason: string;
  evidence: LanguageEvidence[];
  parser: string;
}

export interface LanguageDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  code?: string;
  message: string;
  file?: string;
  range?: {
    start: { line: number; column: number };
    end?: { line: number; column: number };
  };
  source: string;
  related?: Array<{ message: string; file?: string; line?: number; column?: number }>;
}

export interface LanguageRunResult {
  status: 'passed' | 'failed' | 'unavailable' | 'cancelled' | 'timed_out';
  language: LanguageProfileId;
  workspace: DetectedWorkspace;
  plan: CommandPlan;
  exitCode: number | null;
  durationMs: number;
  diagnostics: LanguageDiagnostic[];
  summary: { errors: number; warnings: number; tests?: number; passed?: number; failed?: number };
  output: string;
  truncated: boolean;
  artifacts?: string[];
  suggestedOperations: LanguageOperation[];
}
```

### Profile contract

```ts
export interface LanguageProfile {
  id: LanguageProfileId;
  displayName: string;
  extensions: readonly string[];
  filenames?: Readonly<Record<string, string>>; // filename → LSP language id
  lspLanguageIds: readonly string[];
  detectors: readonly DetectorRule[];
  ignoredDirectories: readonly string[];
  selectWorkspace(evidence: readonly LanguageEvidence[], target?: string): WorkspaceCandidate[];
  resolvePackageManager(ctx: ProfileContext): Promise<PackageManagerSelection | null>;
  operations: Partial<Record<LanguageOperation, OperationResolver>>;
  diagnosticParsers: Readonly<Record<string, DiagnosticParser>>;
  lsp?: { preset: string; rootPatterns: readonly string[] };
}

export type OperationResolver = (
  ctx: ProfileContext,
  request: NormalizedLanguageRequest,
) => Promise<CommandPlan | UnavailableOperation>;
```

Profiles are immutable (`Object.freeze` in development/tests). Operation resolvers may branch only on explicit filesystem evidence, platform, detected executable availability, and validated input—not on prose or LLM-generated command fragments.

## 6. Detection and workspace selection

### 6.1 Bounded discovery

Detection walks from `cwd` or `target` toward `projectRoot`, then performs a bounded downward scan:

- maximum depth: 6
- maximum entries: 5,000
- no symlink traversal by default
- canonical realpath containment under `projectRoot`
- ignore `.git`, dependency directories, build output, caches, IDE state, and language-specific generated directories
- deterministic lexical ordering before scoring

A root-level manifest is stronger evidence than file extensions. Source scanning supplies language presence but never invents a build command.

### 6.2 Evidence weights

Profiles define fixed weights. Suggested defaults:

| Evidence | Weight |
|---|---:|
| Target file extension | 100 |
| Nearest language manifest | 90 |
| Workspace manifest that includes the target | 85 |
| Lockfile paired with a manifest | 30 |
| Language config | 25 |
| Source file sample | 5 each, capped at 25 |
| Tool executable available | 10 |

Confidence is a stable normalization of accumulated weights. Ties are resolved by:

1. workspace containing the explicit target;
2. nearest ancestor root;
3. higher manifest weight;
4. profile registry order;
5. canonical path lexical order.

The tool must return ambiguity rather than silently choose when two candidates remain equivalent and no target was supplied.

### 6.3 Monorepos

Detection returns **all** workspaces. For a target file, choose the deepest containing workspace. For a project-wide operation with multiple workspaces:

- `mode: fast` runs the nearest/highest-confidence workspace only;
- `mode: standard` runs every detected workspace of the selected language;
- `mode: thorough` composes additional predefined operations (for example lint, audit, or race checks) when available.

`mode` never changes the risk declaration of an individual operation. It may produce a multi-plan batch whose aggregate permission requirements are the union of its member plans; cross-boundary package/network operations are returned as suggested `language_package` plans rather than executed by `language`.

Plans are sorted by canonical workspace path and operation order, so repeated calls produce the same sequence.

## 7. First-party profile matrix

Commands below are defaults, not shell strings in implementation; each becomes `{ command, args }`. A profile reports an operation as unavailable if the required manifest, executable, or local tool is missing. It does not fall through to an unrelated command.

### 7.1 Primary profiles

| Language | Strong markers | Syntax / semantic | Lint / format | Test / build | Package operations | Debug evidence |
|---|---|---|---|---|---|---|
| TypeScript / JavaScript | `tsconfig*.json`, `jsconfig.json`, `package.json`, lockfiles | in-process TS parser for a target; `tsc --noEmit --pretty false` for project semantics | local Biome or ESLint; Biome/Prettier check/write | declared test runner adapter; package script only through an explicitly confirmed project-code plan | pnpm/npm/yarn/bun selected by `packageManager` + lockfile; lifecycle scripts disabled by default | syntax → typecheck → filtered test; Node inspector launch is a separate future operation |
| Go | `go.work`, `go.mod` | `gofmt -e -d <files>` for syntax; `go test -run ^$ ./...` for compile/type evidence | `go vet ./...`; `gofmt -d` or `gofmt -w` | `go test ./...`; `go build ./...` | `go mod download`, `go get <module>`, `go mod tidy` as distinct mutating/network plans | compile, filtered test, optional `go test -race`; Delve launch deferred |
| Rust | `Cargo.toml`, `Cargo.lock` | `cargo check --message-format=json` | `cargo clippy --message-format=json`; `cargo fmt --check` / `cargo fmt` | `cargo test --no-run --message-format=json`; `cargo test`; `cargo build --message-format=json` | `cargo fetch`; `cargo add/rm/update`; `cargo audit` only when installed | `cargo check`, filtered `cargo test`, optional Clippy; LLDB/GDB launch deferred |
| PHP | `composer.json`, `composer.lock`, `phpunit.xml*` | `php -l <file>` per target; PHPStan/Psalm only when locally configured | PHPCS/PHP-CS-Fixer only when locally present; check before write | local `vendor/bin/phpunit`; Composer script only as confirmed project code | Composer install/require/remove/update/audit; `--no-interaction --no-scripts` by default | syntax → configured static analyzer → filtered PHPUnit test; Xdebug launch deferred |
| C# / .NET | `global.json`, `*.sln[x]`, `*.csproj`, `*.fsproj` | `dotnet build --no-restore` (or a specific project/solution) | `dotnet format --verify-no-changes` / `dotnet format` when available | `dotnet test --no-restore`; `dotnet build` | `dotnet restore`, `dotnet add/remove package`, `dotnet list package --outdated/--vulnerable` | build diagnostics → filtered test; `dotnet test --blame` as thorough evidence; debugger launch deferred |

Important distinctions:

- A **syntax** request may become a project compile when the ecosystem has no reliable standalone parser command (notably C#).
- `format-check` and `format-write` are different operations with different mutation flags.
- “Package install” means restoring declared dependencies; “package add” changes a manifest.
- A tool found only on `PATH` is weaker evidence than a project-local tool. For Node and PHP, local binaries win.

### 7.2 Additional profiles

| Language | Markers | Default check/test/package adapters |
|---|---|---|
| Python | `pyproject.toml`, `uv.lock`, `poetry.lock`, `requirements*.txt` | `python -m py_compile` for targets; Ruff/Mypy/Pyright when configured; Pytest; uv/Poetry/pip with virtual-environment awareness |
| Java / Kotlin | `pom.xml`, `build.gradle[.kts]`, wrappers | Maven/Gradle compile and test tasks; Checkstyle/SpotBugs/Ktlint only when declared; wrapper preferred; Maven/Gradle builds execute project plugins |
| Ruby | `Gemfile`, `Gemfile.lock`, `*.gemspec` | `ruby -c`; RuboCop when present; RSpec/Minitest detection; Bundler with documentation disabled in noninteractive runs |
| C / C++ | `CMakeLists.txt`, `meson.build`, `compile_commands.json`, Makefile | compiler `-fsyntax-only` when compile database supplies flags; CMake/Meson build and CTest adapters; Conan/vcpkg detection only, no guessed package mutation |
| Swift | `Package.swift` | `swift build`, `swift test`, `swift format lint` when present; SwiftPM dependency resolution |
| Dart / Flutter | `pubspec.yaml`, `pubspec.lock` | `dart analyze`, `dart test`, `dart format --output=none --set-exit-if-changed`; use `flutter` variants when SDK evidence requires it |
| Elixir | `mix.exs`, `mix.lock` | `mix compile --warnings-as-errors`, `mix format --check-formatted`, `mix test`; Hex audit only when installed |
| Shell | shebangs, `.sh`, `.bash` | `bash -n`; ShellCheck and shfmt when present; no package manager |

Profiles may ship in maturity tiers:

- **Tier A:** detection, syntax/semantic check, tests, package restore/add/remove, structured parser.
- **Tier B:** detection plus safe checks/tests; package changes remain unavailable.
- **Tier C:** detection/LSP metadata only.

Initial release should require Tier A for the five primary profiles and TypeScript/JavaScript, and at least Tier B for additional profiles.

## 8. Planning pipeline

```text
1. Validate request shape and action-specific fields.
2. Resolve cwd/target with safeResolveReal.
3. Detect all candidate workspaces from immutable profiles.
4. Select workspace(s), or return structured ambiguity.
5. Resolve package manager/tool variant from local evidence.
6. Ask the profile operation resolver for an exact CommandPlan.
7. Validate the plan against global execution invariants.
8. Return the plan (`action=plan`) or pass it to the executor.
9. Parse diagnostics, normalize output, and return LanguageRunResult.
```

### Plan invariants

Every plan is rejected unless all are true:

- `command` is a single executable token from the profile's allowlist;
- `args` is an array; no shell metacharacter parsing or `shell: true`;
- `cwd` and path-valued arguments resolve inside the project or approved global WrongStack root;
- the selected executable is either an approved system tool or a project-local binary under a known bin directory;
- argument count, argument length, timeout, and output limit are bounded;
- environment variables come from a fixed profile allowlist and never override loader/injection variables such as `NODE_OPTIONS`, `RUSTC_WRAPPER`, or `MSBuildSDKsPath`;
- network, mutation, and project-code execution flags are derived from the operation definition, not caller input;
- an operation cannot change its declared risk by changing `mode`.

`language_info` is read-only and can be auto-approved. Both executors remain confirm-gated. Because the current capability guard is static, `language` declares `['shell.restricted', 'fs.write']`, while `language_package` declares `['shell.restricted', 'fs.write', 'net.outbound', 'package.install']`. Each resolved plan still records its narrower actual behavior for audit and a future action-aware permission policy.

## 9. Execution model

Extract the hardened parts of `packages/plugins/src/runtime/index.ts` into a reusable internal runner in `@wrongstack/tools/languages` (or make the plugins helper consume that implementation). Do not create a second subprocess security boundary.

The runner must:

- use `spawn`/`execFile` with `shell: false` and argv arrays;
- use the existing Windows command-shim resolver for `.cmd`/`.bat` tools;
- pass `AbortSignal` and kill the process tree on cancellation/timeout;
- use `buildChildEnv()` and a profile-specific environment allowlist;
- stream bounded progress through `ToolStreamEvent`;
- spool full logs using the existing output-spool facility and return a bounded head/tail view;
- record shell/package side effects with a redacted display plan;
- distinguish exit failure, spawn failure, cancellation, and timeout;
- cap diagnostics independently of raw output (for example 200 diagnostics, with omitted counts).

### Risk classes

| Plan property | Example | Permission/capability consequence |
|---|---|---|
| Read-only, no project code | in-process TS parse, `php -l` | safe/read-only where the executable itself is trusted |
| Reads project and may execute build hooks | `cargo check`, `dotnet build`, Maven/Gradle | `confirm`, `shell.restricted` (plan metadata also sets `executesProjectCode: true`) |
| Writes generated/build/cache files | build, format-write, Python bytecode | `confirm`, `fs.write`, `shell.restricted` |
| Network dependency read | restore/fetch/audit/outdated | `confirm`, `net.outbound`, `package.install` (the current registry has no read-only package capability) |
| Manifest/lockfile mutation | add/remove/update/tidy | `confirm`, `fs.write`, `package.install`; lifecycle scripts off by default |

A declarative profile does not make a compiler invocation intrinsically safe. The permission decision must use the resolved plan's behavior.

## 10. Package-management policy

Package operations need stronger rules than checks because package names, manifests, lockfiles, network access, and lifecycle scripts cross several trust boundaries.

1. Detect the manager from manifest declarations and lockfiles. Conflicting lockfiles produce ambiguity; do not choose by arbitrary precedence.
2. Validate package identifiers with an ecosystem-specific parser. Reject leading-dash tokens, path dependencies, VCS/URL specs, local archives, and registry overrides unless a separately reviewed operation supports them.
3. Prefer lockfile-preserving install/restore commands when `operation=install`.
4. Disable lifecycle/build scripts wherever the manager supports it. `allowScripts: true` is an explicit opt-in and always confirm-gated.
5. Never auto-install a missing SDK or package manager.
6. Record manifests and lockfiles before/after package mutations through the existing file-change/side-effect mechanisms.
7. Normalize audit and outdated results into an ecosystem-neutral package result while retaining native identifiers.
8. Package operations may only target a detected workspace manifest; an arbitrary cwd is insufficient.

Example normalized package output:

```ts
interface PackageOperationResult extends LanguageRunResult {
  packages: Array<{
    name: string;
    requested?: string;
    resolved?: string;
    previous?: string;
    kind?: 'runtime' | 'development' | 'optional' | 'transitive';
  }>;
  vulnerabilities?: Array<{
    package: string;
    advisory?: string;
    severity: 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
    fixedIn?: string;
    url?: string;
  }>;
  manifestsChanged: string[];
  lockfilesChanged: string[];
}
```

## 11. Debugging assistance

“Debug” should initially mean **collect deterministic evidence**, not start an unconstrained interactive debugger.

A debug resolver builds a fixed sequence based on `symptom`:

```text
compile     → syntax → semantic/build diagnostics
test        → compile/no-run → filtered test → standard test if no filter
runtime     → syntax/semantic → build → targeted test; return debugger availability
race        → language race/sanitizer preset when first-party supported
dependency  → manifest validation → restore dry-run/locked check → audit/outdated
```

Examples:

- Go `race`: `go test -race` with validated package/filter arguments.
- Rust `compile`: `cargo check --message-format=json` followed by Clippy only in thorough mode.
- PHP `runtime`: `php -l`, configured PHPStan/Psalm, then filtered PHPUnit.
- .NET `test`: build, `dotnet test --filter <validated-filter>`, optionally `--blame` in thorough mode.
- TypeScript `runtime`: parser, `tsc --noEmit`, then a detected test runner. Node inspector is reported as available but not launched.

A later `debug-session` feature can integrate Delve, LLDB/GDB, Xdebug, Node Inspector, and `vsdbg` through DAP. That requires process lifetime, ports, secrets, and interactive control and should not be hidden inside the first command-check implementation.

## 12. Diagnostic normalization

Parsers are profile-owned and fixture-tested. Prefer native machine-readable formats:

- TypeScript: stable textual diagnostic parser (or compiler API when in-process).
- Go: `go test -json` for tests; compiler/vet text parser for file positions.
- Rust: Cargo JSON messages and test JSON when stable/available.
- PHP: PHP lint text; PHPStan/Psalm/PHPUnit JSON/JUnit where supported.
- .NET: console/MSBuild parser initially; optional binlog parser later.

Parsing rules:

1. Normalize all paths relative to the selected workspace.
2. Convert line/column values to a documented 1-based external convention.
3. Preserve native diagnostic codes.
4. Never infer success from an empty parser result; exit code remains authoritative.
5. If parsing fails, return `status=failed` or `passed` from the process exit plus bounded raw output and a parser warning.
6. Strip ANSI, collapse progress redraws/duplicates, and head-tail truncate using existing command-output normalization.
7. Sort diagnostics by canonical path, line, column, severity, then code to ensure stable output.

## 13. Relationship to existing subsystems

### Existing generic tools

Keep their public schemas for backward compatibility and migrate their internals incrementally:

- `typecheck` → `language(action='check', check='semantic')` for detected profiles; preserve TypeScript-specific options during the transition.
- `lint` → language lint resolver; existing explicit `biome|eslint|tslint` remains a compatibility override.
- `format` → language format resolver; mutation is derived from `check`.
- `test` → language test resolver; retain current Node runner options.
- `install`, `audit`, `outdated` → language package resolver for supported ecosystems.

The wrappers should return their existing output shapes until a major version permits unification. Internally, they can map `LanguageRunResult` back to legacy fields.

### CLI project facts

Replace duplicated manifest-to-command logic in `packages/cli/src/services/project-facts.ts` with registry detection plus `plan` results. Project facts should store structured plans and render command displays only at the UI boundary.

CI and package scripts remain useful **evidence**, but they are repository-controlled code. They must not override first-party plans or become auto-approved execution templates.

### LSP

Generate extension maps, language IDs, and root patterns from profile metadata where a profile supplies `lsp`. Keep server command/install metadata in `plug-lsp`, because installing and managing an LSP server is a separate lifecycle concern.

Add PHP and C# presets only when their server choice is explicit and documented; avoid silently preferring one of several incompatible community servers.

### Plugin runtime

Make `packages/plugins/src/runtime/index.ts` consume the shared runner and plan validator. Its existing exported `LanguageId` union has different members from the new registry, so migrate it explicitly: deprecate the plugin-local type, alias compatible values through `LanguageProfileId`, and map legacy `dotnet`/`generic` descriptors without introducing a second canonical language ID. Keep `PluginRuntime` as an additive descriptor, but allow a `profileId`/`operation` reference so plugins do not repeat launcher, executable, and flag tables.

### Post-edit syntax checking

Refactor `_syntax-check.ts` into a fast checker registry:

- automatic and auto-approved by default: in-process TypeScript/JavaScript/JSON/JSONC parsers only;
- external target checks such as `php -l`, `ruby -c`, `bash -n`, and compiler syntax-only modes are exposed through the confirm-gated `language` tool;
- trusted user configuration may explicitly opt a cheap external checker into the post-edit hook after its executable and argv are pinned;
- project-context checks remain explicit tool calls, not automatic post-edit hooks.

Post-edit checks have a strict latency budget and never fetch dependencies or run project scripts.

## 14. Configuration and extensibility

Built-in profiles are code-owned and immutable. Optional trusted user configuration may:

- disable a profile or operation;
- select among known adapters (for example `ruff` vs configured Flake8);
- add a trusted executable location;
- adjust timeouts/output limits within global caps;
- choose a package manager when evidence is ambiguous.

Repository-local `.wrongstack/config.json` may **narrow** behavior only. It must not add executable paths, command templates, flags, environment variables, registry URLs, or permission downgrades. This follows the existing `stripUnsafeInProjectFields()` rule: command-surface expansion belongs in trusted user config.

Third-party profiles register through a profile registry API with ownership and capability metadata. Registration validates:

- unique, namespaced profile id;
- bounded detectors;
- executable and flag allowlists;
- declared mutation/network/project-code behavior per operation;
- parser output limits;
- no shell-string command factory.

## 15. Proposed file layout

```text
packages/tools/src/languages/
  types.ts                    public contracts
  registry.ts                 immutable registry + registration validation
  detect.ts                   bounded evidence collection and scoring
  select.ts                   target/workspace selection
  plan.ts                     request normalization + invariant validation
  execute.ts                  shared argv runner integration
  diagnostics.ts              common normalization/sorting/caps
  tools.ts                    `language_info` + `language` + `language_package` Tool definitions
  profiles/
    typescript.ts
    go.ts
    rust.ts
    php.ts
    csharp.ts
    python.ts
    jvm.ts
    ruby.ts
    native.ts
    swift.ts
    dart.ts
    elixir.ts
    shell.ts
  parsers/
    typescript.ts
    go.ts
    cargo.ts
    php.ts
    dotnet.ts
  index.ts
```

Public export: `@wrongstack/tools/languages`. The top-level `languageInfoTool`, `languageTool`, and `languagePackageTool` are also exported from `@wrongstack/tools` and added to `TIER2_TOOLS`/`builtinTools`. Tier 2 is intentional: it already contains `typecheck`, `lint`, `format`, `test`, `install`, and `audit`, which these tools generalize. `outdated` remains a tier-3 compatibility tool; the consolidated package tool stays tier 2 because restore/add/audit are standard development operations.

## 16. Implementation phases

### Phase 0 — Contract and characterization — **Implemented**

- Added focused fixture tests for registry invariants, detection, exact plans, path/package validation, builtin permissions, and the no-process guarantee.
- Add fixtures/tests that capture current project-facts, LSP, syntax, test, typecheck, and package-manager behavior.
- Define contracts and registry validation without changing existing tools.
- Inventory existing command allowlists and Windows resolution behavior.

### Phase 1 — Detection and planning (no execution) — **Implemented**

- Implemented immutable TypeScript, JavaScript, Go, Rust, PHP, and C# profiles, bounded detection, deterministic workspace selection, and the read-only `language_info` tool (`detect | plan | capabilities`).
- Returns exact plans and structured unavailability/ambiguity reasons without spawning.
- CLI project-facts integration remains deferred to the compatibility-migration phase.

### Phase 2 — Read/check execution — **Implemented**

- Added one shared cancellable argv-only runner over the existing Windows-safe `spawnStream`, with plan revalidation, timeouts, spooling, and side-effect recording.
- Added normalized TypeScript, Cargo JSON, Go, PHP, .NET, Biome, and generic diagnostics plus in-process TypeScript/JavaScript syntax parsing.
- Implemented confirm-gated syntax/semantic checks, lint, format check/write, test compile/test, builds, and deterministic debug evidence through `language`.
- `language_info` and `language` are tier-2 builtins; `language_package` remains deferred to Phase 3.
- Execution remains conservatively `confirm`-gated with `shell.restricted` and `fs.write` capabilities.

### Phase 3 — Package operations

- Add ecosystem-specific identifier validators and install/add/remove/update/audit/outdated plans.
- Enforce script-off defaults and manifest/lockfile tracking.
- Migrate `install`, `audit`, and `outdated` through compatibility wrappers.

### Phase 4 — Additional profiles and LSP deduplication

- Ship Tier B profiles for Python, JVM, Ruby, native, Swift, Dart, Elixir, and Shell.
- Generate LSP language/root metadata from profiles while retaining server lifecycle data in `plug-lsp`.
- Refactor post-edit fast syntax checking to use the checker registry.

### Phase 5 — Compatibility migration

- Delegate `typecheck`, `lint`, `format`, and `test` to the new planner when applicable.
- Remove duplicated CLI detection and plugin flag tables only after parity tests pass.
- Document deprecation paths; do not remove public tools in the same release.

## 17. Test strategy

### Pure unit tests

- Every detector fixture yields exact evidence, confidence, workspace roots, and ordering.
- Every operation fixture yields an exact `{ command, args, cwd, risk flags }` snapshot.
- Package identifiers accept valid ecosystem forms and reject leading-dash, URL, VCS, path, and control-character injection.
- Diagnostic parsers use recorded stdout/stderr fixtures for success, warning, error, malformed, Unicode, Windows path, and truncated cases.
- Registry rejects duplicate IDs, shell strings, undeclared risk, unbounded timeouts, and unknown executables.

### Security/property tests

For every profile operation, generate hostile targets, filters, and package names containing:

```text
; & | > < ` $() CR LF NUL leading-dash ../ absolute paths UNC paths
```

Assert they are either rejected or remain one literal argv element after validation. Also test:

- in-root symlink to outside root;
- malicious local binary path;
- conflicting lockfiles;
- repository config attempting to add commands/flags/environment variables;
- cancellation and timeout process-tree cleanup;
- lifecycle scripts disabled by default;
- a successful command with unparsable output does not fabricate diagnostics.

### Integration tests

Use temporary fixture projects and fake executables placed on a controlled PATH. Fake tools record received argv and emit known diagnostics, avoiding CI dependence on every SDK. Add a smaller opt-in matrix using real installed SDKs for TypeScript, Go, Rust, PHP, and .NET.

### Compatibility tests

- Existing tool schemas and legacy output shapes remain stable.
- Project-facts output remains equal or improves with documented differences.
- LSP extension and root maps remain in parity with profile metadata.
- Tool tier measurement and exact-count tests account for `language_info`, `language`, and `language_package`.
- Windows `.cmd` resolution receives the same argv as POSIX execution.

## 18. Acceptance criteria

1. A polyglot fixture containing TypeScript, Go, Rust, PHP, and C# workspaces is detected deterministically on Windows, macOS, and Linux.
2. A target file always selects the nearest containing workspace, independent of filesystem enumeration order.
3. `plan` returns exact argv and risk metadata without spawning a process.
4. No first-party operation invokes a shell or accepts an LLM-authored command string.
5. Primary profiles support syntax/semantic checks, tests, builds, debug evidence, and package restore/add/remove/audit where their ecosystem supports them.
6. Missing tools and ambiguous workspaces produce structured `unavailable`/ambiguity results, not guessed fallbacks.
7. Diagnostics have stable ordering, normalized paths/locations, bounded counts, and raw-output fallback.
8. Package scripts/lifecycle hooks are disabled by default where possible, and plans that may execute project code remain confirm-gated.
9. Existing generic tools continue to work while using the shared planner internally.
10. All three builtins use only centrally registered `ToolCapabilities` values and pass `permission-mutating-invariant.test.ts`.
11. Tool tier measurement and exact-count tests are updated for all three additions.
12. CLI, LSP, plugins, and tools no longer maintain conflicting copies of language markers once migration is complete.

## 19. Key decisions

- **Three broad tools, many immutable profiles.** Static tool permissions require a read-only planner, a code-check executor, and a separately privileged package executor; profile count still does not affect every model request.
- **Plan before execute.** A visible exact plan makes deterministic selection auditable and testable.
- **Argv only.** Predefined operations eliminate shell quoting and command-injection ambiguity.
- **Workspace-first, not project-first.** Polyglot repositories contain multiple valid roots and managers.
- **Debugging means evidence collection initially.** Interactive debugger orchestration is a separate DAP-shaped feature.
- **Machine-readable output where available, raw output retained.** Parsers improve assistance but never become the sole source of truth.
- **Shared knowledge lives above core.** `@wrongstack/tools/languages` can serve CLI, LSP, and plugins without violating dependency direction.
- **Repository configuration can narrow, never widen, command capability.** Toolchain customization that expands execution belongs in trusted user configuration.

## 20. Mental model

Treat a language profile like a database query planner:

- detection builds a catalog of available workspaces;
- an operation is a logical intent;
- the profile chooses one known physical plan;
- the plan validator enforces safety invariants;
- the executor gathers evidence;
- the parser turns native output into a common result.

The LLM remains responsible for reasoning about the evidence and choosing the next intent. It is no longer responsible for remembering whether the right incantation is `cargo check`, `go test -run ^$`, `php -l`, or `dotnet build --no-restore`.