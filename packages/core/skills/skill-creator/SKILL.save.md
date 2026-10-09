# Skill Creator — WrongStack (Compact)

<!-- source-version: 1.4.1 -->

## Selection card
- Task: Author and validate bundled or project skills. / TR: Bundled veya proje skilli yaz ve doğrula.
- Start: Identify the requested artifact, repository owner and acceptance criteria.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Skills guide the agent; the runtime owns tool schemas, permissions and execution.
Write instructions that change useful decisions, then validate discovery,
resources and behavior. The [Agent Skills specification](https://agentskills.io/specification)
was reviewed on 2026-10-09; WrongStack adds audience and runtime capability fields.

## Rules

1. Use a 1–64 character lowercase kebab-case name matching its directory.
   Description is 1–1024 characters and states capability plus activation context.
2. Respect the requested destination. Default new project skills to
   .wrongstack/skills/<name>/SKILL.md; bundled maintenance belongs in
   packages/core/skills/<name>/SKILL.md when that is the user's requested scope.
3. Preserve supported audience, metadata and extension fields. Intentional
   shadowing is valid; accidental same-layer overwrite is not.
4. Keep the entrypoint below 200 lines as an authoring target. Move substantial
   conditional workflows to linked resources; keep essential scope, stopping
   conditions and authorization in the entrypoint.
5. Verify latest stable technology targets from official sources. Record exact
   version/date/URL and refresh before installs; no version guesses or stale
   examples presented as current.
6. Declare only real runtime requirements. Optional tools should appear in
   plain prose: backticked canonical names are inferred as required by the
   prompt builder even when the sentence says “optional”.

## Detailed workflow

Load the full skill-creator skill before relying on its specialized modes,
references or output contracts. Its current SKILL.md is the source of truth;
this compact body does not expand task scope or authorization.

## Before returning

- Destination, name, description and audience correct.
- Required surfaces exist; optional integrations have a real fallback.
- Linked resources load and changed helpers execute successfully.
- Behavioral checks distinguished from structural checks.
- Catalogs synchronized; verification results and unknowns reported.
