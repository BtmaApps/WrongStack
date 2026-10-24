# Critique Finding Precision & Anti-Patterns

Every finding in a `design-critique` report must pair **observable source/rendered evidence** with a **concrete, token-grounded replacement**. Vague aesthetic commentary or unverified taste claims fail the critique contract.

## Vague vs. Evidenced Findings

| Axis | Rejected (Vague / Taste-Only) | Required (Evidenced + Actionable Replacement) |
|---|---|---|
| **Structure** | "Feels a bit generic and boxy." | `src/app/page.tsx:20,48,76` — Three consecutive 3-column `grid-cols-3 gap-6` card rows with identical `p-6` padding and no focal point. **Replace with**: keep the top KPI summary as a 3-up strip, convert the middle workflow section into an asymmetric `grid-cols-12` (`col-span-7` interactive preview + `col-span-5` step list), and collapse the bottom row into a compact definition list. |
| **Typography** | "Add more hierarchy to the text." | `src/components/Hero.tsx:14-28` — H1 (`text-2xl font-medium`), subhead (`text-lg`), and body (`text-base`) span only a 1.5x total size range, and prose spans `98ch` at `1440px` (`[type.measure-wide] @1440`). **Replace with**: set H1 to `text-4xl font-semibold tracking-tight` (`2.25rem`), constrain subhead/body container to `max-w-[65ch]`, and drop supporting metadata to `text-sm text-muted-foreground`. |
| **Color** | "Improve the colors; the badges are too loud." | `src/features/orders/OrderRow.tsx:52` — Secondary status pills use solid `bg-emerald-500 text-white` across 18 rows per screenful, competing with the single primary `"Approve Batch"` CTA in the header. **Replace with**: style status pills with tinted surface `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20` and reserve solid accent fill for the primary header CTA. |
| **Surface & Depth** | "Too many borders and shadows." | `src/components/MetricCard.tsx:9` — Each card stacks `border-2 border-slate-700`, `shadow-xl`, and `bg-gradient-to-br` simultaneously, plus an inner bordered header (`line 15`). **Replace with**: align to the kit's single elevation strategy (`bg-surface border border-border-subtle rounded-lg`, no drop shadow on dark canvas) and separate card header from body with `pb-3` spacing instead of an inner box. |
| **States & Edges** | "Handle edge cases better." | `src/features/webhooks/WebhookTable.tsx:31` — Renders `webhooks.map(...)` directly with no `isLoading` skeleton, no empty-list onboarding CTA when `webhooks.length === 0`, and long webhook URLs overflow horizontally at `390px` (`[layout.horizontal-overflow] @390`). **Replace with**: add a 4-row `<TableSkeleton />` while pending, an `<EmptyState />` with `"Create your first webhook endpoint"` when empty, and `truncate max-w-[240px] font-mono` with a copy button on the URL cell. |
| **Copy & Voice** | "Make the copy more engaging." | `src/app/marketing/page.tsx:11` — Headline reads *"Supercharge Your Workflow with Next-Gen Solutions"* and CTA reads *"Get Started"* (fails the Product Swap test: could belong to any SaaS). **Replace with**: state the concrete job and latency guarantee from `.design/brief.md`: *"Replay failed Stripe and GitHub webhooks with one click"* and CTA *"Connect webhook endpoint"*. |

## Scoring Discipline Rules

1. **No Flat 3/5 Averaging**: Scoring every axis `3/5` signals an uninspected pass. Differentiate scores using concrete failure/pass citations from `references/rubric.md`.
2. **Separate Observation from Fix**: Never write *"I fixed the contrast on line 42"* inside the critique finding before recording what failed. State the observed defect and score first, then apply authorized fixes in the implementation step and record the post-fix verification result.
3. **File Findings Against the Owner**: When 12 form screens lack `:focus-visible` rings because `src/components/ui/input.tsx:18` sets `focus:outline-none` without a ring token, file **one Blocking finding** against `src/components/ui/input.tsx:18`, not 12 duplicate screen findings.
