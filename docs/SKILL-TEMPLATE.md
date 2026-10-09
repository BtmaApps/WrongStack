---
name: <skill-name>
description: |
  <One-sentence trigger — what situation activates this skill.>
  Triggers: user says "<keyword>", "<keyword>", "<keyword>".
version: 2.0.0
required-capabilities: [<list>]
required-tools: [<list>]
optional-capabilities: [<list>]
---

# <Skill Title> — WrongStack

## Overview

<What this skill does, in two or three sentences. State the deliverable shape.>

## Rules

<Numbered, testable, non-overlapping. Each rule is something a model can
verify it followed. Avoid prose. If a rule has exceptions, say so explicitly.>

## Out of scope

<The opposite of the Overview. List explicitly what this skill does NOT
do, and where the work should go instead. This is the in-lane guardrail:
a model reading the skill should know when to stop and hand off.

Format: bullet list of "DON'T do X — that's the `<other-skill>` skill" or
"DON'T do X — it's not the model agent's job to Y at all." Be specific.>

## Skills in scope

<Adjacent skills for delegation. One line each, naming the reason the
adjacent skill is the right next step. This is the model-to-model
hand-off list — when a related question arrives, the skill body says
where to send it.>

## Patterns

### Do

```typescript
// ✅ Correct pattern for this skill's domain.
```

### Don't

```typescript
// ❌ Anti-pattern: common mistake inside this skill's lane.
```

## Anti-patterns

- **<named anti-pattern>** — <what it looks like, why it's wrong, what to do instead>
- ...

## Before returning

<The in-lane enforcement checklist. The model runs through this before
delivering its output. Any unchecked item is a reason to keep working.

Format: a short numbered list of mechanical checks. Each item is something
the model can answer yes/no about its own work.>

- [ ] <check 1>
- [ ] <check 2>
- [ ] ...

---

## Authoring rules (for skill-creator)

1. **First sentence of `description` = trigger.** The skill loader matches on it.
2. **Name in kebab-case.** Lowercase, hyphens only, no collisions with existing skills.
3. **Scope is explicit.** State relevant activation boundaries, ownership and stopping
   conditions in the description or body. Use an Out of scope section when it helps;
   a prescribed heading is not a runtime requirement.
4. **Completion is observable.** State the checks and deliverable. Use a Before returning
   checklist when useful; avoid adding ceremonial sections to small skills.
5. **Rules are testable.** "Be careful with X" is not a rule. "Always do Y before Z"
   is. If a model cannot tell whether it followed a rule, the rule is decorative.
6. **Anti-patterns name a specific failure mode.** Not "avoid mistakes" — name the
   mistake, the symptom, the fix.
7. **Skills in scope names the hand-off.** When a related question arrives, the body
   points at the next skill. No "see also" — name the reason.
8. **Keep versions and compact instructions aligned.** Bump the informational version
   for changed behavior. SKILL.save.md is an active compact runtime variant, not a backup.
   Update it with its full runbook and record its source-version marker.
9. **Target latest stable technology.** Query live registries and official migration
   guides; record version, URL and checked date. An old repo version is a migration
   input, not the recommended target. Name compatibility blockers instead of forcing
   unsupported peers or silently recommending an older release.
10. **Keep loading progressive.** Aim below 200 entrypoint lines. Link substantial
    conditional material in references/ with when to load it. Runtime capability/tool
    fields must use actual registered names; optional tool mentions belong in plain prose.
11. **Validate source maintenance.** From the repo root:
    bun run packages/core/skills/skill-creator/scripts/check-bundle.ts.
    Run the relevant loader/prompt/resource tests and official catalog writers.
