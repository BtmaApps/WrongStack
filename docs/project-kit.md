# Project Kit

Project Kit is WrongStack's reusable, project-specific executable capability system.
A kit combines a guide, parameter and result schemas, `.mjs` implementation,
verification examples, source revisions and execution history. Skills can refer
to kits by name; the kit manifest is the authoritative execution contract.

## Model workflow

1. Call `project_kit` with `action: "list"` and an optional search `query` before
   writing a project-specific ad hoc script.
2. Inspect a suitable `name`. Read its guide, effects, schemas and revision.
3. Discover `project_kit_run` through `tool_search` if its schema is deferred.
4. Verify a new revision using `action: "verify"`, `name` and `revision`.
5. Execute with `action: "run"` and schema-checked `input` parameters.
6. Diagnose failures using the session result and `project_kit` action `history`.
   Extend a suitable existing kit instead of making a duplicate.

The discovery tool is directly available in all built-in tiers. Execution is
available through the shared runtime catalog, including hosts using reduced
tool schemas. Existing per-tool disable and permission settings apply. This
version also provides a **Project Kit** page in the WebUI activity bar and
command palette. The page lists kits for the active session's project and shows
guides, schemas, verification state, source file names and the latest 100 runs.
Search and refresh are available on desktop and mobile. Create, use and verify
actions prepare a chat draft for review; they do not execute scripts directly or
submit the message. The model then uses the normal tool permission flow.
There is no `/kit` slash command.

## Automatic runtime guidance

The shared agent loop adds task-specific Kit advice through **Tool Coach**.
It applies to hosts using the core agent loop, including CLI/TUI, WebUI and
subagents with the Kit tools enabled. The existing `features.toolCoach` setting
controls this behavior across interfaces (default on); disabling Kit discovery
or execution also suppresses Kit advice. A discovery request that would require
confirmation or be denied by the permission policy does not load advisory data.

At the start of each user turn, a local deterministic matcher ranks manifest
names and descriptions against the task. It understands a small set of English
and Turkish domain aliases, returns at most three candidates and omits weak
generic matches. It does not make an additional LLM/API request. Short metadata
summaries of matches enter the normal model conversation as quoted data; guides,
test inputs and source code are not included in this automatic note.

After a successful tool batch, the advisor detects likely one-off scripts in
temporary/script directories and substantial inline analysis scripts. If a
relevant Kit has not been inspected, it supplies **one reminder per turn** before
the next model request. Direct calls and `tool_use` wrappers are recognized.
Ordinary application source edits, Kit development, failed/aborted calls and
simple environment probes do not trigger this reminder. A Kit failure or refusal
suppresses further reuse nudges for that turn. Inspected kits stop receiving
duplication reminders; an unsuitable kit must not be forced onto the task.

This is contextual steering, not an execution interceptor: the detected call
has already completed. It does not block, undo or automatically replace it,
does not establish semantic equivalence, and never executes a Kit on its own.
Matching is heuristic and can miss paraphrases or unusual script launchers.

Discovery reads at most 256 local manifests, with a 64 KiB limit per manifest,
without importing any `.mjs` module or hashing the source bundle. The host gives
guidance loading and follow-up policy checks a 500 ms deadline and caps the
combined note at 2,400 characters. Errors and timeouts omit the advice. Catalog
state is scoped to the current turn and project; a new user turn reloads it.
The normal inspect/verify/run path remains authoritative for current schemas,
source revisions, permissions and validation.

## Authoring

`project_kit({ action: "template", name: "strings.unique" })` returns a complete,
working example without writing files. Adapt it using normal file tools:

```text
.wrongstack/project-kit/<name>/
  kit.json
  main.mjs
  helper.mjs           # optional local imports
  fixtures/            # optional bundled test data
```

`kit.json` contains `formatVersion: 1`, the directory-matching `name`,
`description`, `guide`, a top-level `.mjs` `entry`, declared `effects`
(`read`, `write`, `external`), `timeoutMs` (100–600000), `inputSchema`,
`outputSchema` and 1–32 `tests`. Each test has `name`, `input` and `expected`.
Verification executes the entry for each case in a fresh process and compares
the schema-validated output with `expected` using deep equality. The timeout
applies to the complete verification, not separately to each case.

```js
// main.mjs — no SDK installation required; WrongStack supplies ctx.
export async function run(input, ctx) {
  ctx.signal.throwIfAborted();
  ctx.log('Preparing result');
  const values = [...new Set(input.values)];
  return input.sort ? values.sort() : values;
}
```

The SDK context provides `projectRoot`, `kitRoot` (the captured source bundle),
`runId`, `signal`, `log(message)` and `resolvePath(projectRelativePath)`.
Use Node built-ins for I/O. Types `ProjectKitContext` and `ProjectKitModule`
are exported by `@wrongstack/tools`. Keep relative module imports inside the
bundle. Access workspace files via `ctx.projectRoot`; use `ctx.kitRoot` for
fixtures. Package imports require dependencies installed in the project;
they are not automatically installed or pinned by Project Kit.

Schema support is deliberately explicit: `type`, `description`, `properties`,
`required`, `additionalProperties: false`, `items`, `enum`, `minimum`,
`maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `default`.
Unsupported keywords are rejected. All schemas need an explicit type; object
schemas need properties and must reject additional properties. Defaults are
applied recursively to missing object fields, including fields in arrays.
Inputs and results must be JSON values. Results are capped at 256 KiB.

## Revisions, execution and history

Discovery reads files without importing executable modules. A revision hashes
all bundle files (maximum 128 files / 2 MiB). The caller must supply the exact
revision. A new or changed bundle must pass verification before ordinary use.
A passing verification must be present in the latest 100 local run records.
The latest verification for that revision must have passed; a later failure or
incomplete verification revokes the previous pass.
Verification is evidence for the declared cases, not proof of all behavior.

Every execution captures the hashed bytes under:

```text
.wrongstack/project-kit-runs/<name>/<runId>/
  record.json
  source/
```

The source snapshot prevents concurrent source edits from changing that run's
bundle. Installed dependencies, workspace data, time and network are not
snapshotted; determinism depends on those inputs too. Source revisions do not
certify that the surrounding environment is unchanged. Reverify after relevant
dependency or environment changes.

Records include the session/agent/tool-call identifiers, revision, action, status,
timings, case outcomes, the child process exit code and a bounded, redacted
stderr tail (the last 4096 characters) for failure diagnosis. A record left
`running` indicates an interrupted host or incomplete recording, not success.
Parameters, results, raw errors and unbounded logs are not duplicated into
persistent kit history; the normal session result contains output and bounded
logs. Do not place secrets in source or fixtures,
which are retained in snapshots. There is no automatic retention cleanup yet.
Keep the history directory ignored by Git; commit source kits to share them.
This repository's ignore rules already make that distinction.

## Execution rules

Node.js 22.19+ must be on PATH, including when WrongStack runs as a standalone
binary. Execution uses an external Node process, the shared child environment
filter, process registry, cancellation and timeout handling.
Process start, output byte counts/hashes and completion use the existing
process telemetry stream, so running kits can be monitored alongside shell jobs.
Bounded redacted log text is returned in the session result.
No shell command is composed from parameters. Inputs travel through stdin,
not process argv.

**A Node kit is arbitrary code, not a sandbox.** Declaring `effects: "read"`
does not grant automatic execution permission or restrict filesystem/network
access. Both verification and run use the confirmation-gated execution tool
and existing user permission policy. Verification may have real side effects;
design safe fixture cases. Permission approval is scoped by name, revision,
action and input. Kit guides cannot grant additional authority.

Do not launch detached background services from a kit. Await child work and
clean it up before returning. Cancellation requests terminate tracked process
trees; they cannot undo external changes already made. Historical source
snapshots are available for inspection and manual source recovery, but restoring
source does not roll back file writes or external operations. Persistent history
is local diagnostic data, not a tamper-proof security attestation.
