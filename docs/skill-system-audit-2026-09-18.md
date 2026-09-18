# Skill system audit and remediation — September 18, 2026

The audit covered discovery, installation, authoring, prompt disclosure, activation, resources, export, and Agent Skills compatibility. The original audit found working infrastructure but broken lifecycle transitions. The fixes below address those findings; validation results and remaining limits are recorded separately.

## Scope and baseline evidence

- Core loader, YAML frontmatter, installer, manifest store, registry adapter, generator, and slash commands.
- Progressive/eager/compact prompt modes, the skill tool, resource loading, activation events, and role-specific skills.
- WebUI creation/edit/export handlers, the skill panel, TUI picker, and suggestion tests.
- All 36 bundled skills and the separate security-scanner generator.
- Baseline: 37 test files and 474 tests passed despite the uncovered failures.
- Six new lifecycle regressions failed before fixes: same-session discovery, prompt paragraphs, multiline serialization, standard YAML, complete descriptions, and the current registry response contract.
- The original adapter endpoint returned HTTP 404. The current `/api/search?q=react&limit=1` returned HTTP 200 with `skills`, `source`, and `skillId` fields. This is a point-in-time service check, not a service availability guarantee.

Sources: [Agent Skills specification](https://agentskills.io/specification), [integration guide](https://agentskills.io/integrate-skills), [skills.sh documentation](https://www.skills.sh/docs), and [YAML parser documentation](https://eemeli.org/yaml/).

## Architecture and activation semantics

| Stage | Behavior |
|---|---|
| Discovery | Project WrongStack, project foreign, user profile, user foreign, extra directories, then bundled skills; deterministic first-name-wins precedence. |
| Shared locations | Reads `.agents/skills`, `.claude/skills`, and configured foreign tool directories. Import can copy or link resources. |
| Installation | Downloads a GitHub package, detects skills, stages complete directories, and updates the profile manifest. Registry results can select one skill with `owner/repo#skill-name`. |
| Disclosure | Progressive mode is the default. The catalog includes the complete standard description and any explicit WrongStack trigger. |
| Loading | `skill({name})` returns instructions and resource names. `skill({name, resource})` reads a resource. Long content returns a continuation offset. |
| Explicit use | `/skill use <name> <task>` sends a task prompt that requests loading and applying the selected skill. `/skill <name>` remains a preview. |
| Refresh | Authoring/install/edit mutations and explicit tool activation invalidate the loader. `/skill reload` refreshes after external edits or wizard-authored file writes. |
| Suggestion | Optional TypeSafe suggestion remains off by default. A suggestion is not proof that the model loaded or followed a skill. |
| Authoring | The wizard delegates to the model using `skill-creator`; skeleton/from-prompt and WebUI create produce editable drafts. |

Discovery, disclosure, loading, and successful execution are distinct states. Activation records prove a tool load, not compliance with every instruction. A live model may still select a skill incorrectly or ignore its instructions.

## Findings and fixes

Priorities below describe product correctness, not vulnerability severity.

### 1. P1 — Registry search contract

**Original:** `skills-sh-adapter.ts` requested `/api/skills?query=...` and expected a `results` array. The live service returned 404; the working search API returned a different shape.

**Fix:** Use `/api/search?q=...&limit=...`, normalize `source` and `skillId`, and report unknown response schemas instead of silently returning no matches. Retain legacy response support for custom registries. Use bounded prefix retrieval and local page slicing rather than pretending the endpoint supports server-side pages. Skill-specific install references preserve the selected skill instead of installing every sibling from the repository.

**Coverage:** Current-service response fixture, legacy adapter cases, and selected-skill installation.

### 2. P1 — New CLI skills invisible in the same session

**Original:** Name validation populated the loader cache, then skeleton/from-prompt wrote a file without invalidation. `find()` returned undefined until manual invalidation.

**Fix:** Invalidate after successful authoring. Expose `/skill reload` for external changes, and refresh before validating a file.

**Coverage:** Create → discover → validate → force overwrite → reread with the same real loader.

### 3. P1 — Single-skill repositories lost resources

**Original:** Root `SKILL.md` detection returned only `['SKILL.md']`; scripts, references, and assets were omitted.

**Fix:** Both repository layouts use the shared package collector. Package collection enforces containment and file/package size limits. Package replacement stages files before replacing the working directory.

**Coverage:** Install a root skill with a Python resource and verify the installed bytes. Failed replacement validation preserves the previous installation.

### 4. P1 — Export was not a portable skill package

**Original:** Export-all ZIP contained only each skill's Markdown file.

**Fix:** ZIP export includes resources and binary assets. Skill count counts packages, not ZIP entries. Single-file export remains a Markdown-only convenience; use Export all for portable packages.

**Coverage:** Real loader → ZIP → extracted directory → installer import → skill resource read, including byte-exact binary assets.

### 5. P1 — Valid YAML changed meaning or disappeared

**Original:** `|-` and `>-` became literal descriptions, inline comments became part of names, and folded scalars were not folded.

**Fix:** Use the `yaml` package with the failsafe schema, bounded alias expansion, duplicate-key checks, and rejection of unsupported tags. Support comments, quoted escapes, flow mappings, block scalars and chomping, CRLF, and BOM. Strict document validation is shared by authoring paths. Runtime parsing normalizes surrounding scalar whitespace for compatibility with existing manifests.

**Coverage:** Standard YAML fixtures, malformed documents, wrong field shapes, and existing parser/loader tests. An older malformed fixture with an unindented block line was corrected to valid YAML.

### 6. P2 — Validate checked name availability, not the file

**Original:** A valid existing skill was reported as a collision even though authoring instructions recommended validating after creation.

**Fix:** Validate the actual file when it exists, including YAML, name/directory agreement, field limits, metadata, and nonempty body. For a new name with no file, retain name-availability checks. This is structural validation, not a claim that scripts or natural-language instructions will execute correctly.

**Coverage:** Existing-skill lifecycle and malformed document tests.

### 7. P2 — Force overwrite was blocked by the precheck

**Original:** `--force` was rejected before reaching the writer, with an error that told the user to pass `--force` again.

**Fix:** Keep name-format validation; let the selected destination and writer enforce overwrite policy. A skill in another scope does not prevent creating an intentional override in the requested scope.

**Coverage:** Force-overwrite lifecycle with a previously cached skill.

### 8. P2 — WebUI accepted files the loader would reject

**Original:** Create accepted names longer than 64 characters; edit accepted documents without frontmatter.

**Fix:** Share name and document validation, enforce description limits, and use the core skeleton writer for creation. Reject invalid edits before writing so the existing skill remains usable.

**Coverage:** Oversized name rejection and invalid-edit preservation using real handler/loader instances.

### 9. P2 — Activation descriptions were truncated to one sentence

**Original:** `Extract PDFs. Use when asked about invoices.` appeared in the progressive catalog only as `Extract PDFs.`

**Fix:** Render the full standard description and append an explicit trigger when supplied. Short picker labels can remain concise without removing the full selection context from the model.

**Coverage:** Progressive catalog includes the later activation sentence.

### 10. P2 — Long instructions were silently cut off

**Original:** The skill tool sliced bodies at 16,000 characters with no continuation or warning. Three bundled bodies exceeded that budget.

**Fix:** Return `nextOffset` and total body length; serialized output explicitly requests loading remaining instructions before use. The same offset mechanism supports resources. Always provide the skill directory for relative references. Move lengthy mailbox examples, bootstrap/patterns, recipes, and collaborative-review instructions into named references without deleting their text.

**Coverage:** Concatenating continuation pages reconstructs every character, including a critical final instruction.

### 11. P2 — Generator lost multiline content

**Original:** Only the first description line was indented; slash tokenization flattened the prompt's paragraph boundaries.

**Fix:** Indent every description line, preserve quoted CLI descriptions, and preserve the raw prompt body while handling authoring flags. Quote the version scalar to prevent YAML syntax injection. Remove trailing hyphens after derived-name length limits.

**Coverage:** Multiline description round-trip and paragraph-preserving prompt draft.

### 12. P2 — No strict bundled/authoring format gate

**Original:** The bundled `design-system` description exceeded 1,024 characters, while runtime discovery accepted it.

**Fix:** Add shared strict document validation and a test over every bundled skill. Shorten redundant trigger wording in `design-system` without replacing concurrent design work. Keep tolerant runtime discovery separate from strict authoring validation. `allowed-tools` remains informational and does not alter runtime permissions; this experimental field is not treated as a permissions mechanism.

**Coverage:** All bundled documents pass the shared contract; malformed field shapes and overlength descriptions fail.

## Additional lifecycle corrections

A live installation of `vercel-labs/agent-skills#vercel-react-best-practices` exposed a legitimate 108,261-byte `AGENTS.md` reference above the old 100 KiB file limit. The existing per-file limit is now 1 MiB, with the 64 MiB package bound retained. The selected skill installs alone, lists 75 resources, and its 108,212-character reference round-trips exactly across four resource pages. No downloaded scripts were executed.

The audit also identified potential replacement and multi-project problems. Package staging now prevents validation/copy failures from deleting the working skill. Manifest identity includes project hash for project-scoped records; installer list/update/uninstall operate on the current project plus user-scoped entries. Updating a named skill retains its selection rather than reinstalling unrelated siblings.

The security-scanner LLM path previously placed raw JSON in `GeneratedSkill.content`, while the static fallback produced Markdown. The LLM path now serializes a validated SKILL.md document around its scanning payload. Pattern data remains available to the scanner; exported instructions have standard YAML metadata. This does not turn the scanner's internal pattern generator into a general-purpose authoring wizard.

## Validation and limits

Targeted regressions and existing suites cover deterministic parsing, authoring, catalog construction, loading, resource round-trips, and installer behavior. Current validation results:

- 66 focused test files, **745 tests passed**, including the runtime capability contract and the entire security-scanner suite. The separate 114-test WebUI payload validation file also passed.
- Core build and Core/tools/security-scanner/WebUI-server source typechecks passed.
- The authoritative test-type gate checked 34 projects with **zero new diagnostics**; pre-existing baseline diagnostics remain.
- The generated Core public API snapshot is current.
- Scoped Biome checks passed with two existing scanner string-placeholder warnings.
- Bash syntax and a real isolated mailbox skill installation passed, including the new reference files.
- The production registry adapter successfully retrieved a live skills.sh result; an isolated real GitHub install and complete paged reference read also passed.
- Standalone WebUI suite: **395 files / 5,499 tests passed**.
- Last full root run: **44,669 passed, 20 failed, 32 skipped** across 3,107 files. The failures were confined to five TypeSafe/suggestion files whose sources/tests changed concurrently outside this patch: `typesafe-client.test.ts`, `typesafe-account.test.ts`, `skill-suggestion-middleware.test.ts`, `skill-suggester.test.ts`, and `typesafe-dispatch-classifier.test.ts`. All five passed together in a fresh run (**82 tests**). The full run remains a failed/partial gate; the isolated rerun is not presented as a clean full-suite result or evidence of flakiness.
- The 49-test installer/limits rerun passed after raising the file limit for the live reference-guide installation.
- Earlier full-run failures in this patch's capability declarations, quoted CLI parsing, registry identifiers, and edit-payload fixture were corrected; those failures did not recur in the last full run.

No claim is made that a live LLM always selects the correct skill, that compaction preserves every instruction, or that a running globally installed CLI has been rebuilt/restarted. Those require separate live runtime tests. Full Agent Skills ecosystem certification is not implied by passing local format checks.

Reproduce the central lifecycle regressions:

```sh
pnpm exec vitest run packages/core/tests/skills/skill-lifecycle-regressions.test.ts packages/core/tests/skills/skill-files.test.ts packages/webui-server/tests/skills-lifecycle.test.ts
node scripts/check-test-typecheck.mjs
pnpm test
```
