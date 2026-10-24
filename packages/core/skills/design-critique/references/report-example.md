# Design Critique Report Template & Complete Example

Use this exact report structure when delivering a `design-critique` audit. Keep `Adherence` (machine token/rendered inspection) separate from `Craft` (6-axis rubric), and rank all findings by visible impact (`Blocking` > `Craft` > `Nit`).

## Canonical Report Template

```markdown
## Design critique — <surface name / route>

Surface: <page | app screen | kiosk | component>
Tokens: <kit id · adherence pct (e.g. industrial-terminal · 94% adherence)> | <project's own system (`src/styles/theme.css`) — no kit pinned> | <none (0 token variables found)>
Evidence: <inspected URL/route or artifact path, viewports (1440, 768, 390), themes (dark/light), states exercised; explicitly list any source-only / unverified axes>
Machine pass: <X FAIL, Y WARN from `design {action:"verify"}` and `design_reference {action:"inspect"}` with finding IDs>
Quick tests: Greyscale: <pass/fail + reason> · Squint: <pass/fail + focal point> · Swap: <pass/fail + copy specificity>
Craft: structure <0-5|n/a|unverified> · typography <0-5|unverified> · color <0-5|unverified> · surface <0-5|unverified> · states <0-5|unverified> · copy <0-5|n/a|unverified> (Overall: <lowest scored axis, or omitted if an applicable axis is unverified>)
Verdict: <one sentence naming the single biggest structural or craft reason the interface fails or reads as generated>

### What works
- <one concise line acknowledging a genuine strength worth preserving during fixes>

### Blocking (ships as broken: a11y, unreadable contrast, broken mobile layout, missing error/loading state)
1. `<file:line>` (`[<finding-id>] @<viewport>`) — <observed defect and user consequence>.
   **Replace with**: <exact token, layout, or component change>.

### Craft (why it reads as templated, flat, or noisy)
2. `<file:line>` — <observed hierarchy, rhythm, surface, or copy issue>.
   **Replace with**: <exact token, layout, or copy replacement>.

### Nits (optional polish; state count of omitted lower-priority items if >10 total)
3. `<file:line>` — <minor optical alignment or micro-typography adjustment>.
   **Replace with**: <concrete tweak>.
```

## Worked Example (App Screen Audit)

```markdown
## Design critique — Webhook Deliveries Console (`/settings/webhooks`)

Surface: app screen
Tokens: project's own system (`src/app/globals.css` `@theme`) — 88% adherence (6 raw hex literals in status badges)
Evidence: rendered at `http://localhost:3000/settings/webhooks` across 1440×900, 768×1024, and 390×844 in dark theme; populated (24 rows) and error states inspected; light theme unverified (app is dark-only per `.design/brief.md`).
Machine pass: 2 FAIL (`[a11y.icon-button-unlabeled]`, `[layout.horizontal-overflow] @390`), 1 WARN (`[motion.transition-all]`)
Quick tests: Greyscale: FAIL (status pills and primary CTA have identical luminance) · Squint: FAIL (24 solid green/red badges overpower the header action) · Swap: PASS (domain-specific webhook payload headers and HTTP status codes)
Craft: structure 3/5 · typography 4/5 · color 2/5 · surface 3/5 · states 1/5 · copy 4/5 (Overall: 1/5)
Verdict: Solid-fill status badges on every table row drown out the primary action, while unguarded URL strings break mobile layout at 390px and empty/loading states are completely absent.

### What works
- Monospace payload inspector drawer (`src/features/webhooks/PayloadDrawer.tsx:44`) uses `tabular-nums`, crisp `1px` `--border-subtle` dividers, and scannable HTTP latency breakdowns.

### Blocking
1. `src/components/ui/IconButton.tsx:19` (`[a11y.icon-button-unlabeled]`) — Replay and delete icon buttons in every table row render an `<svg>` with no `aria-label` or `sr-only` text, making row actions indistinguishable to screen readers.
   **Replace with**: require `aria-label: string` in `IconButtonProps` and pass `aria-label={`Replay delivery ${delivery.id}`}` at `WebhookRow.tsx:67`.
2. `src/features/webhooks/WebhookTable.tsx:48` (`[layout.horizontal-overflow] @390`) — Unbroken 90-character target URLs force a `612px` table width on a `390px` viewport, clipping the status and action columns off-screen.
   **Replace with**: apply `max-w-[180px] sm:max-w-[320px] truncate font-mono` on the endpoint cell and hide the secondary `User-Agent` column below `md:` (`hidden md:table-cell`).
3. `src/features/webhooks/WebhookTable.tsx:22` — Component renders an empty `<tbody>` while `isLoading` is true and when `deliveries.length === 0`, leaving a blank dark box on first-run accounts.
   **Replace with**: render `<TableSkeleton rows={6} cols={5} />` during initial fetch and an `<EmptyState title="No webhook deliveries yet" action={<SendTestEventButton />} />` when empty.

### Craft
4. `src/features/webhooks/StatusBadge.tsx:11` — Uses raw `bg-[#10B981] text-black` and `bg-[#EF4444] text-white` solid fills across all 24 rows, stealing focal weight from the primary `"Send test event"` button.
   **Replace with**: switch to muted semantic tints (`bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20`) so only the header primary CTA carries a solid fill.
5. `src/features/webhooks/WebhookCardWrapper.tsx:8` — Wraps the data table inside two nested bordered cards (`border border-zinc-800 rounded-xl p-6` inside `border border-zinc-800/80 rounded-2xl p-6 shadow-2xl`).
   **Replace with**: remove the outer wrapper card; let the table sit directly on `--bg-canvas` with a single `1px` `--border-subtle` frame and `rounded-lg` radius.

### Nits (1 shown, 2 minor spacing nits omitted)
6. `src/features/webhooks/WebhookRow.tsx:34` (`[motion.transition-all]`) — Row hover uses `transition-all duration-300`, causing sluggish background lag during fast cursor scanning.
   **Replace with**: `transition-colors duration-100`.
```
