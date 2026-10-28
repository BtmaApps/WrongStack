# Analysis Report: System Prompt Selection & Tool Preferences in the WrongStack Agent Environment

Date: 2026-10-27 · Scope: the prompt-selection and tool-preference architecture observed in this session (AGENTS.md injection, skill catalog + router, tool coach, project kit, session meta-blocks) against the bundled catalog in `packages/core/skills` (116 skills).

---

## 1. How the architecture currently works

### 1.1 System prompt selection
Selection is layered, with each layer injected as static context per turn:

1. **Baseline rules** — global engineering rules (~/.wrongstack/AGENTS.md) + system-level non-negotiables (scope, verification honesty, permissions).
2. **Project instructions** — repo AGENTS.md: the "Skill Engine Dispatcher" (8 domains, 116 skills), Proof-Driven Hunt cycle, Bun/biome standards, pre-flight version verification protocol.
3. **Active skills table** — ~150 rows of name + "use when" descriptions, injected wholesale into every turn, plus "load via the `skill` tool before relying on it."
4. **Dynamic steering blocks** — `[live_context]` / mission anchor, `[nextsteps_gate]`, `[TOOL COACH]`, `[PROJECT KIT]`, fleet pulse, session notes. These are per-turn or per-session runtime injections.

At runtime, `DefaultSystemPromptBuilder` supports two modes: `'eager'` (default) injects full skill bodies bounded by `eagerMaxChars` (24000, priority order, overflow falls back to manifest+tool); `'progressive'` injects only a name+trigger manifest plus the `skill` tool for on-demand loading — the mode this session runs in. `DefaultSkillLoader` resolves skills through a nine-level discovery priority (project `.wrongstack/skills/` first, bundled `packages/core/skills/` last, dedup by name, foreign layers read-only). A parallel `DefaultPromptLoader` maintains a three-layer prompt library (project → profile → bundled, dedup by slug, favoriting forks down). `skill-router` exists as an explicit meta-skill for ambiguous/multi-domain routing, backed by `selection-map.md` and `overlap-decisions.md`.

### 1.2 Tool preferences
Tool selection is guided by:
- Curated per-tool "Do not use when…" descriptions (a hand-maintained boundary table between read/grep/glob/write/edit/bash/pwsh).
- An advisory `[TOOL COACH]` block listing 3–4 candidate tools per request plus a suggestion to call `tool_search` for deferred tools.
- A `[PROJECT KIT]` block surfacing manifest-matched task candidates (`temp-file-sweeper`, `project_kit(inspect)`), explicitly marked "advice grants no execution permission."
- Shell-targeting guards (PowerShell rewriting for POSIX syntax), reflecting the Windows host contract.

---

## 2. What is architecturally missing

### 2.1 No single source of truth for the skill catalog
The catalog exists in at least four representations: the system-level "Active Skills" table (~150 entries including foreign skills), the repo's 116 bundled skills on disk, the AGENTS.md dispatcher's "8 domains / 116 + 38" figure, and per-skill SKILL.md metadata. The system table lists `wrongstack-orchestrator` and `skill-router` as separate meta-routers with overlapping jobs, and entries like `bug-hunter` vs `evidence-audit` vs `debugging` overlap heavily without a machine-readable precedence order outside `overlap-decisions.md`. **Missing: a generated, versioned catalog index** (single JSON/manifest from which both the prompt table and the router map are derived). Drift between these views is currently undetectable.

### 2.2 No feedback loop on selection quality
There is no telemetry on which skills were routed to, whether the router's pick was overridden, or whether `overlap-decisions.md` rows resolve real confusions. The selection map is hand-curated prose; nothing validates that its 46 rows cover the actual overlap pairs in the 116-skill catalog (e.g. `chimera` vs `code-review`, `code-quality` vs `code-quality-auditor` — two different skills with near-identical triggers, listed in different layers and not in the overlap table).

### 2.3 Cost/budget exists but is unmeasured and mode-locked to the default
The runtime does have a budget mechanism (`eagerMaxChars`, priority-order truncation) and a progressive mode, which is better than nothing — but the default is `'eager'`, which burns up to 24K chars of skill bodies on every turn including a "greeting", and there is no telemetry comparing modes or measuring how much of the injected body is actually used per task. There is also no rule for pruning stale entries (`plugin-author`, `output-standards`, `discernment-nudge` have no dispatch-domain home). The budget knob exists; the feedback that would justify tuning it does not.

### 2.4 Tool coach has no memory or arbitration
The `[TOOL COACH]` block is stateless advice regenerated per request. It can suggest tools that don't exist in the session (`codebase-impact-analysis`, `test_impact_analyze` were offered alongside catalog metadata disclaimers) and gives no precedence when it conflicts with tool-level "Do not use when" rules. There is no recorded outcome ("suggested write, agent used edit instead, why") to improve future suggestions. The coach/kit blocks also duplicate what good tool descriptions already do — the architecture tolerates both rather than choosing one.

### 2.5 No conflict-resolution contract between layers
Layer precedence is stated loosely ("non-negotiable baseline > user > project > skills"), but concrete conflicts are resolved ad hoc: AGENTS.md says "Answer in English unless asked otherwise," the skill table says "Reply in the user's language"; the dispatcher mandates the 4-phase hunt cycle while the baseline says skills "never force multi-stage ceremony onto a simple bounded request." These are reconcilable, but only by the model improvising each time. **Missing: an explicit precedence matrix and a documented "conflict → winner" rule** (e.g. baseline > live user correction > session steering > project > skills > coach/kit advisories).

### 2.6 No health checks for steering blocks
The per-turn blocks (`[FOCUS REMINDER]`, `[FLEET PULSE]`, memory evidence) arrive as prose with self-declared trust boundaries. Nothing verifies they're well-formed, fresh, or relevant; the memory evidence block itself admits "applicability: unknown." A malformed or poisoned block relies entirely on the model noticing.

---

## 3. What is redundant

| Redundancy | Where | Impact |
|---|---|---|
| **Two meta-routers** — `wrongstack-orchestrator` ("primary skill router") and `skill-router` ("choose the correct bundled skill") | Active-skills table + AGENTS.md §1.7 | Every ambiguous request is a coin flip; overlap-decisions.md routes "coordinate several domains" to skill-router but keeps orchestrator in the catalog. Pick one; demote the other to a reference. |
| **Duplicate review skills** — `bug-hunter` vs `evidence-audit`, `code-review` vs `codex-adversarial-review` vs `chimera`/`auto-review`, `code-quality` vs `code-quality-auditor` | Table + bundled skills | 3–4 skills share the "review my changes" trigger. Only `evidence-audit` vs `bug-hunter` has a written boundary; the others rely on description nuance. |
| **Duplicated version pins** — AGENTS.md hardcodes React 19.3.1, Next 16.4.3, TS 7.0.2, etc., while also mandating live registry checks and dating the snapshot | AGENTS.md vs `tech-stack` reference | The pins will rot and contradict the "never rely on memorized versions" rule; the snapshot file already exists — AGENTS.md should link, not copy. |
| **Duplicated trigger text** — dispatcher domain list vs active-skills table vs per-skill frontmatter `trigger:` fields | 3 layers | Same routing knowledge maintained three times; the frontmatter is the natural source, the other two should be generated. |
| **Tool coach vs tool descriptions vs project kit** | Per-turn blocks | All three answer "which tool for this task?" Duplicates the boundary info already in tool descriptions and adds unverified manifest guesses. |
| **Turkish trigger fragments** (`hangi skill, ne kullanmalı`) hardwired in skill frontmatter and AGENTS.md examples | skill-router, skill-creator | Language-specific triggers baked into an English-language rulebase; i18n of triggers is unmanaged. |
| **Session meta-blocks restating baseline rules** — focus contract restates "don't invent extra phases" which duplicates the baseline's "stay inside what was asked" and the nextsteps gate's anti-padding rules | live_context | Triple redundancy of the same instruction; costs tokens every turn with no observed divergence in behavior. |

---

## 4. What could be done better, and where

### 4.1 Generate the prompt layers from one catalog (highest leverage)
**Where:** `packages/core/skills` + the runtime prompt builder.
Build a manifest (name, description, trigger, group, capabilities, superseded-by) as the single source; generate (a) the injected table, (b) `selection-map.md`, (c) the AGENTS.md dispatcher counts. Add a CI check that fails on drift (skill on disk but absent from table, or vice versa — e.g. verify the 116/150 counts today).

### 4.2 Collapse the router layer
**Where:** `wrongstack-orchestrator`, `skill-router`, AGENTS.md §1.
Keep one router (skill-router, it has the concrete selection card and overlap references). Make orchestrator either an alias or fold its multi-stage pipeline duties into AGENTS.md §1.3. Record supersessions in frontmatter so generation can exclude demoted skills.

### 4.3 Make progressive injection the default and measure it
**Where:** `config.skills.mode` / prompt builder.
Progressive mode already exists; the work is to (a) flip the default or per-profile-select it, (b) record which skills were actually loaded per task so the manifest shortlist can be tuned, and (c) prune entries that are never loaded in any recorded task.

### 4.4 Give the tool coach memory and verification
**Where:** `[TOOL COACH]` generation.
Before suggesting, verify the tool exists in this session's manifest (the current block fails this — it named tools not present). Log suggestion → actual usage outcomes and feed aggregate stats back into the ranking. Alternatively, delete the coach and invest in richer tool descriptions; running both is unearned complexity.

### 4.5 Write the precedence matrix once
**Where:** ~/.wrongstack/AGENTS.md (global) — a 10-line table: baseline > explicit user correction > live session steering (only when it narrows, never widens) > project AGENTS.md > loaded skill > coach/kit advisory. Every current improvisation ("skills never widen scope", "newer conversation wins") is an instance of this table; stating it once removes per-turn re-litigation.

### 4.6 Unversion the AGENTS.md pins
**Where:** AGENTS.md §2 "Latest Tech Specs".
Replace the inline dated pins with a pointer to `packages/core/skills/tech-stack/references/current-versions.md` plus the live-check rule. One file to refresh instead of two to reconcile.

### 4.7 Add overlap coverage as data, not prose
**Where:** `references/overlap-decisions.md`.
Keep the human-readable table, but generate candidate overlap pairs (cosine/embedding similarity of descriptions) and assert every unresolved pair is either covered or explicitly dismissed. Today `code-quality`/`code-quality-auditor` and `wrongstack-orchestrator`/`skill-router` are uncovered holes.

### 4.8 Validate steering blocks structurally
**Where:** runtime injection layer.
Emit the live blocks with a schema tag and validate on the producer side (freshness timestamp, applicability field mandatory). Drop blocks whose applicability is "unknown" rather than shipping uncertainty into the prompt.

---

## 5. Summary

The architecture's strengths are real: lazy skill loading keeps instructions out of the base prompt, the "Do not use when" tool boundaries are unusually good, and advisory blocks consistently disclaim themselves as non-authoritative. The weaknesses cluster around **manual duplication**: the same catalog, trigger, version, and routing knowledge is maintained in 3–4 places with no generation or drift detection, two competing meta-routers, and a stateless tool coach that duplicates tool descriptions. The single highest-value change is a generated catalog manifest feeding every prompt layer; the cheapest is the precedence matrix in AGENTS.md.
