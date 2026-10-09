# Security Scanner (Compact)

<!-- source-version: 1.4.1 -->

## Selection card
- Task: Review source trust boundaries and defensive security. / TR: Kaynak güven sınırlarını ve savunma güvenliğini incele.
- Start: Identify the scope and obtain an executable before-proof or review evidence.
- Finish: apply the acceptance checks below; report observed results and unresolved constraints.

## Overview

Provide a defensive, evidence-led review of the requested source and configuration.
Separate confirmed findings, supported static concerns and validation gaps.
Use local, non-destructive tests of defensive behavior where appropriate.

## Rules

1. Identify scope, assets, entrypoints and trust boundaries. Read surrounding
   validators, authorization and cleanup before interpreting a scanner hit.
2. Give every finding a real location, reachable condition, violated contract,
   impact, evidence level and concrete remediation.
3. Severity follows impact, exposure and prerequisites. TLS, CORS or HTTP patterns
   are not automatically Critical without their deployed context.
4. Redact credentials completely where possible. A test directory can contain
   real leaked credentials; distinguish known dummy fixtures from genuine values.
5. Use the ecosystem's dependency audit and exact lockfile affected ranges when
   in scope. Audit output alone does not prove exploitable runtime usage.
6. Do not contact suspected credentials/services or build attack workflows.
   Prefer source evidence and bounded tests that verify protective contracts.

## Detailed workflow

Load the full security-scanner skill before relying on its specialized modes,
references or output contracts. Its current SKILL.md is the source of truth;
this compact body does not expand task scope or authorization.

## Acceptance checks

- Verify defensive findings and fixes against scoped source evidence; state unresolved claims.
