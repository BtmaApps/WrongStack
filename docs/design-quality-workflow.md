# Design quality: implementation audit and workflow

This audit follows the implementation from kit selection to generated tokens,
per-turn model context, source verification and design skills. It does not claim
that a model prompt or a palette score can guarantee original visual output.

## Existing foundation

WrongStack ships 53 selectable kits plus `_foundations`. The loader resolves
project, profile and bundled kits, merging shared scales under each kit's own
tokens. The `design` tool, `/design` command and WebUI share materialization and
verification. CLI and WebUI use the shared detection/request middleware.

The existing building blocks were already substantial:

- Color, spacing, radius, typography, motion and elevation tokens; semantic tuning.
- Theme generation for web, React Native, Flutter, SwiftUI and Compose.
- Persisted kit selection and project rules under `.design/`.
- Design craft, critique and platform skills with supporting references.
- Source heuristics for token drift and common composition patterns.
- Bundled-kit checks covering token contracts and common text/background pairs.

Relevant implementation: `packages/core/src/execution/design-{kit-loader,detect,
materialize,project-store,verify}.ts`, `packages/tools/src/design.ts`, and
`packages/core/skills/design-{system,craft,critique}/`.

## Findings and changes

| Finding | Resulting behavior | Evidence |
| --- | --- | --- |
| A selected kit reduced model guidance to token adherence; the brief was not injected | Craft and rendered-review guidance remains active; current brief excerpt follows UI requests across kit changes | Request middleware regression tests exercise creation, revision, deletion and bounded excerpts |
| Rules were cached for the entire process, including an absent file | Rules added, edited or removed during a session affect the next UI request | Store regression reproduces missing rules after the initial empty lookup |
| Exact card, accent and asymmetry prescriptions could replace one template with another | Content priority, workflow, existing system and user direction determine composition; justified repetition remains valid | Revised craft, critique, rubric and reference guidance |
| Existing systems could trigger a demand to adopt a kit before editing | Preserve established tokens/components; the kit loop applies to new systems or requested migrations | Updated runtime guidance, system skill and UI-design instructions |
| A palette scan was described as evidence of adherence or default-generated appearance | Tool and middleware report source findings with explicit limits; composition requires contextual rendered review | Tool verification tests and revised summaries |
| Comment-only markup counted as scan coverage; CSS-variable spacing/radius was flagged as literal drift | Comment-only files count as no-signal; direct variable references are not called hardcoded literals | Failing then passing verifier regressions |
| Legacy font aliases and tuned canonical keys emitted conflicting web variables | Canonical scale values take precedence, avoiding stale unlayered root/dark font declarations | Tune-to-materialize regression with legacy and canonical tokens |
| React Native dropped canonical font tokens when separating numeric scales | Per-theme camelCase font fields preserve canonical values and tuning | Canonical-only and tuned-font materialization regressions |

## Operating contract

For substantial work: inspect the product and its existing system, write a brief,
build with representative content, inspect rendered states, rank the visible
problems, fix within scope and inspect again. The brief names the primary task,
content priority, design direction, actual references/assets and observable
acceptance checks. Fake social proof and invented reference observations are
not acceptable substitutes for product content.

For a small edit: match the established patterns and verify the affected states.
A new identity, kit migration or approval ceremony is not required.

Rendered evidence records route/artifact, viewport, theme and state. Test narrow
and short viewports when relevant, keyboard navigation, content extremes and
reachable empty/loading/error states. Use `.design/review.md` for the workflow's
evidence record. A source-only review must identify what remains unverified.

## Measured layer (2026-10-19)

Principle: prose proposes, code disposes. Anything a browser can measure is
measured by a fixed script with fixed thresholds, so every model receives the
same verdict; skills keep only what cannot be measured (direction, content,
copy voice) and cite rule ids instead of restating rules.

| Layer | Mechanism | Enforced by |
| --- | --- | --- |
| Source | `design verify`: token drift + generated-UI patterns, on every UI write | `design-verify.ts`, write middleware |
| Reference | `design_reference extract`: in-page script measures visible color area (point sampling with layer compositing), type scale/ratio, spacing unit, radii, elevation, motion, section rhythm, buttons, declared tokens at 1440/768/390 → `.design/references/<slug>/` | `design-dna-extractor.ts`, `design-dna.ts` |
| Fidelity | `design_reference compare`: per-axis score with tolerances (OKLab ΔE ≤ 0.02, ±0.5px body, ±4% container…); overall = lowest axis | `design-dna-compare.ts` |
| Rendered quality | `design_reference inspect`: reference-free FAIL/WARN gate — overflow, edge text, WCAG contrast against the background actually behind the text, WCAG 2.2 target size with the spacing exception, type counts, heading order, broken/unsized media, stuck-hidden text, blank bands, console errors | `design-inspect-extractor.ts`, `design-inspect.ts` |
| Structure | 62 patterns by stable id with anatomy, ranges and DNA signals | `design-patterns` skill |
| Process | read reference → choose pattern ids → build → verify → inspect (0 FAIL, ≤ 3 rounds) → compare when matching | `design-reference-read`, `design-craft`, `design-to-code`, `design-critique` |

Measurement is its own tool, `design_reference`, declaring `net.outbound`.
Capability gates are decided per tool before input is known, so `--restricted`,
subagent capability sets and auto-approve all see the network use, while
`design` keeps only `fs.write` and its offline token actions stay available.
Extraction runs under the browser tools' network guard and private-origin
allowlist, trust rules key on the URL, and reference screenshots stay in the
self-ignored `.design/` directory.

Calibration evidence: both scripts were run in Chromium against fixtures with
planted defects (every defect caught) and against four production sites. The
first inspect run over those sites produced false-positive classes that were
then removed one by one: screen-reader-only text, `aria-hidden` mock UI,
off-canvas carousel items, WCAG 2.5.8 spacing-exception targets,
scroll-triggered reveals, footer legal text, gradient-clipped text and text
over sibling media. DNA inference was corrected the same way: fg/primary on
dark sites, footer text dominating body size, and a half-height inverted band
flipping the theme.

Compared with the public design skills surveyed on 2026-10-19 (Anthropic
frontend-design, impeccable, taste-skill, ui-ux-pro-max, Vercel interface
guidelines, OneRedOak design-review, Stitch DESIGN.md, dembrandt): only
WrongStack scores an implementation against a measured reference per axis, and
checks adherence against a resolved kit. impeccable leads on catalog breadth and
edit-loop enforcement; taste-skill on dealt directions. None publishes an
evaluation.

Turn-end enforcement: the agent loop exposes a generic `beforeTurnEnd`
extension hook — a guard may return a steer instead of letting the model end
the turn, at most three times per run. The design turn gate uses it: it records
frontend writes and `design_reference` inspect results per run, and holds a
turn whose UI changed after the last inspect or whose last inspect still has
FAILs. It acts only when the inspect tool is available to that agent and a
served URL is known (an earlier inspect, or `.design/gate.json`
`{"url": …}`); otherwise it stays silent. `{"mode": "off"}` disables it.

Source rule catalogue: every `verify` finding has a stable id and a severity
(30 ids; FAIL only for definite accessibility defects such as an unlabeled
icon button or disabled zoom). Rules live in `design-verify-rules.ts`; each
candidate was run over the repository's 824 UI files first, and candidates
whose hits were mostly legitimate (outline removal inside a focus-within
wrapper, sub-12px text in dense UI, per-file reduced-motion with a global rule)
were rejected. An A/B run against the previous engine lost none of its 2055
findings and kept the palette score identical. Exceptions are waived in the
file with `design-ignore: <id>` (`-next-line`, `-file`; `*` for all).

Next, in order of value:

1. `DESIGN.md` / `PRODUCT.md` interchange (Stitch-compatible) with lint and diff,
   so adherence works for projects without a kit.
2. Dealt direction: a seeded draw of three kits that excludes recent choices;
   a pick outside the deal needs a recorded reason.
3. Evaluation harness: fixed briefs, with and without the design layer, two or
   more providers, scored only by these measurements plus cross-brief DNA
   distance (convergence), with a ratchet.

## Limits and follow-up evaluation

Validation for this change: 164 tests passed across 16 design, CLI, tool,
WebUI-session and skill-contract files; core/tools TypeScript checks and scoped
Biome checks passed. Regression cases were run failing before their fixes.
The full `pnpm test` attempt was incomplete: a dependency refresh invalidated
the running Vitest worker module path. It also observed an intermediate skill
reference mismatch, corrected and verified in the final targeted run. This is
not a full-suite or release-check pass. No live model-output comparison or
browser/device design-quality benchmark was performed.

The verifier is a heuristic source scanner, not a browser or accessibility engine.
Its default walk stops at 200 UI files and depth 8. Dynamic classes, native theme
usage, actual font loading, computed contrast and interaction behavior are not
certified. A 100% color score can mean no color signals. Variable references are
not proof that the referenced variable is defined. Composition matches remain
review prompts; the scanner does not parse or enforce brief exceptions.

The native materializers are theme scaffolds, not complete platform component
systems. Font loading and platform family registration remain application work.

Behavioral evaluation of the revised instructions should compare rendered outputs
for the same task, model and content, without showing reviewers which instructions
produced which version. Include an existing dense console, a quiet transactional
form, an editorial page with real assets, and a reference-matching request. Judge
task clarity, content specificity, hierarchy, state completeness and fidelity;
do not score novelty by card counts or palette choice. Such a model-output
comparison has not been run as part of the source/test changes described here.
