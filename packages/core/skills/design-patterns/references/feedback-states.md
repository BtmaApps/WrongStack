# Feedback states

Every data surface has more states than the happy path. Choose the state pattern,
then choose where the message lives (inline, banner, toast). Copy for empty and
error states: design-craft `references/copy.md`; slop rows S1–S3 in
`references/slop-inventory.md`.

**Placement rule (choose in this order):**
1. Message is about one field or element → `inline-message` next to it.
2. Message affects the whole page/session and persists until resolved → `page-banner`.
3. Message confirms an action the user just took and needs no action → `toast-notification`.
4. Never put errors that need user action only in a toast.

Response-time convention (widely cited usability guidance, not a standard):
~0.1s feels instant, ~1s keeps flow, ~10s is the limit of attention. Use these to pick
between nothing, a skeleton/spinner, and a determinate progress indicator.

---

### empty-state — Empty state
Job: Explain why a surface has no content and how to fill it.
Anatomy: (1) what belongs here *invariant*; (2) why it's empty (first use / filtered /
cleared) *invariant*; (3) one primary action that fixes it *invariant*; (4) optional
illustration or sample content.
Measures: placed where the content would be (inside the table/list area); text ≤ ~2
sentences; one primary button; illustration ≤ ~160px tall in product UI.
Use when: zero items for any reason.
Avoid when: n/a — but distinguish first-use, no-results and cleared states.
Variables: illustration, sample/template shortcuts.
Failure modes: "No data" (slop S3); same message for "no results for filter" and "nothing
created yet"; huge illustration pushing the action below the fold.
Accept: no-results variant offers "clear filters"; first-use variant offers create/import;
action visible without scroll at 390×844.
Seen as (DNA signals): a centered short text block + one button inside an otherwise empty
container that normally holds a list/table.

### loading-skeleton — Loading skeleton
Job: Show structure while content of a known shape loads.
Anatomy: (1) placeholders matching final layout *invariant*; (2) busy state exposed to
assistive tech (`aria-busy`) *invariant*.
Measures: placeholder boxes within ± 1 step of final element sizes; delay showing the
skeleton by ~200–500ms to avoid flashing on fast loads (convention); switch to a
determinate progress indicator if work is expected to exceed ~10s; shimmer animation
off under reduced motion.
Use when: shape known and load > ~0.5–1s.
Avoid when: unknown shape (use a spinner with label); long operations (use progress).
Variables: shimmer vs static, granularity.
Failure modes: skeleton shape differs from loaded layout causing a jump; skeleton
forever on error; full-page spinner for a partial load.
Accept: cumulative layout shift on load negligible (no visible jump); error replaces
skeleton with `error-state`; reduced-motion respected.
Seen as (DNA signals): grey rounded boxes in the positions of text lines and images,
replaced by content without layout movement.

### error-state — Error state
Job: Explain a failure and offer recovery.
Anatomy: (1) what happened in user terms *invariant*; (2) what the user can do
*invariant* (retry, edit, contact); (3) preserved user input/context *invariant*;
(4) optional technical detail behind a disclosure.
Measures: scoped to the failed region (a failed widget must not blank the page); retry
action present for transient failures; error id/copyable detail for support.
Use when: any failure.
Avoid when: n/a.
Variables: tone, detail disclosure, illustration.
Failure modes: exception names as copy (slop P5); whole-page error for one widget;
retry that loses form data.
Accept: copy names cause + next step; region-scoped; retry works without reload;
announced to assistive tech.
Seen as (DNA signals): a bordered/colored block inside a component region with an icon,
short text and a retry button.

### success-confirmation — Success confirmation
Job: Confirm a completed action and point to what's next.
Anatomy: (1) what was done *invariant*; (2) where to see it / next step *invariant*.
Measures: for routine actions use `toast-notification` or inline check; for significant
completions (purchase, publish) a dedicated confirmation view with reference id.
Use when: the result is not otherwise visible.
Avoid when: the change is already obvious in the UI (redundant).
Variables: placement, celebratory treatment (sparingly).
Failure modes: confetti for routine saves; confirmation that hides the next action.
Accept: names the object and outcome; offers next step or link to the result.
Seen as (DNA signals): a check icon with short text near the changed item or a full view
with an order/reference number.

### partial-state — Partial / degraded state
Job: Show what loaded when some parts failed or are stale.
Anatomy: (1) loaded content shown *invariant*; (2) failed regions marked individually
*invariant*; (3) staleness timestamp where data may be old.
Measures: one `error-state` per failed region; "updated n min ago" on cached data.
Use when: dashboards with independent widgets; feeds with failed pages.
Avoid when: data consistency matters (mixing fresh and stale totals) — then block and explain.
Variables: retry per region vs global.
Failure modes: failed widgets silently show zero (reads as real data).
Accept: no failed region displays a numeric value; each failed region has its own retry.
Seen as (DNA signals): a grid of panels where some show content and others show error
blocks.

### offline-state — Offline state
Job: Tell the user connectivity is lost and what still works.
Anatomy: (1) persistent indicator *invariant*; (2) what is unavailable vs queued
*invariant*; (3) automatic recovery notice.
Measures: `page-banner` or status chip while offline; queued actions labelled ("will send
when online").
Use when: apps that can be used with flaky connections.
Avoid when: n/a for web apps that simply fail — then use `error-state`.
Variables: placement, queue visibility.
Failure modes: actions appearing to succeed offline then vanishing.
Accept: queued items visibly pending; indicator clears on reconnect.
Seen as (DNA signals): a persistent bar/chip with connectivity text; items with pending
badges.

### toast-notification — Toast
Job: Brief, non-blocking confirmation of a user-initiated action.
Anatomy: (1) short message *invariant*; (2) optional single action (often Undo);
(3) dismiss control.
Measures: 1 line, ≤ ~80 characters; visible 4–10s (convention), longer or persistent if it
contains an action; stack ≤ 3; corner or bottom-center; announced via polite live region;
does not cover primary controls or `bottom-tab-bar`.
Use when: confirming a just-taken action.
Avoid when: errors needing action, information needed later, anything critical.
Variables: position, duration within range.
Failure modes: errors shown only as auto-dismissing toasts; toasts covering the save
button; pausing impossible.
Accept: hover/focus pauses timeout; action toasts keyboard reachable; message also
available elsewhere if important.
Seen as (DNA signals): small fixed-position box appearing near a corner after an action,
removed after several seconds, inside an `aria-live` region.

### page-banner — Page banner
Job: Persistent message about the whole page or account state.
Anatomy: (1) message *invariant*; (2) action or link to resolve; (3) dismiss only if it
can be safely ignored.
Measures: full width of content area at the top; one banner at a time per severity;
severity conveyed by icon + text + color.
Use when: account issues, maintenance, offline, trial expiry.
Avoid when: confirming routine actions (use toast).
Variables: severity style, dismissibility.
Failure modes: stacking several banners; color-only severity; banners for marketing.
Accept: ≤ 1–2 banners visible; severity readable without color.
Seen as (DNA signals): full-width strip above page content with icon, text and link.

### inline-message — Inline message
Job: Feedback tied to a specific field or component.
Anatomy: (1) message adjacent to its element *invariant*; (2) programmatic association
*invariant*.
Measures: directly below/beside the element, ≤ 1–2 lines; icon + text for errors.
Use when: field validation, component-level warnings.
Avoid when: page-wide issues.
Variables: icon, timing (on blur vs on submit).
Failure modes: message far from field; color-only.
Accept: linked via `aria-describedby`; visible without hover.
Seen as (DNA signals): small colored text with icon immediately under an input.

### destructive-confirm — Destructive confirmation
Job: Prevent irreversible loss from accidental actions.
Anatomy: (1) states exactly what will be destroyed *invariant*; (2) consequence
(irreversible, affects n items) *invariant*; (3) destructive button labelled with the
verb + object *invariant*; (4) cancel as the safe default focus.
Measures: dialog for irreversible actions; for high-impact (deleting a workspace) require
typing the name; prefer `undo-action` instead when reversal is possible.
Use when: irreversible or high-impact actions.
Avoid when: the action is undoable (confirm dialogs train users to click through).
Variables: type-to-confirm threshold.
Failure modes: "Are you sure?" with "OK/Cancel"; destructive button focused by default.
Accept: button label names the action ("Delete 12 files"); initial focus on cancel or the
dialog; Esc cancels.
Seen as (DNA signals): modal dialog with a red/destructive-styled button whose label is a
verb phrase, sometimes with a confirmation text input.

### undo-action — Undo
Job: Let users reverse a just-taken action instead of confirming beforehand.
Anatomy: (1) action applied immediately (optimistically) *invariant*; (2) undo affordance
in a toast or inline *invariant*; (3) commit after the undo window.
Measures: undo available ≥ 5–10s (convention) and longer if the user is interacting with the
toast; keyboard shortcut where the platform has one.
Use when: deletes/archives/moves that can be reversed.
Avoid when: the action triggers external side effects (emails sent, payments) — use
`destructive-confirm`.
Variables: window length, placement.
Failure modes: undo that doesn't fully restore (order, selection); window too short to reach.
Accept: undo restores the exact prior state; reachable by keyboard before it expires.
Seen as (DNA signals): toast containing an "Undo" button appearing right after a removal.
