# Forms and flows

Collecting input and moving a user through a task. Interaction behavior and
recovery logic belong to the interaction-design skill; this file fixes structure.
Button and error copy: design-craft `references/copy.md`.

Shared rules for every form pattern below:
- Visible label above or beside each field; placeholder is never the only label.
- Field width suggests expected input length (postcode narrower than street).
- Errors appear next to the field, say what to do, and are announced (`aria-describedby`
  + live region or focus move). Input is preserved after a failed submit.
- One primary submit per form, labelled with the verb of the outcome.

---

### single-column-form — Single-column form
Job: Collect a handful of related inputs in one go.
Anatomy: (1) form title and purpose *invariant*; (2) fields in one column in logical
order *invariant*; (3) primary action at the end *invariant*; (4) secondary/cancel.
Measures: form width 360–640px; vertical gap between fields 2–3 steps above the
label-to-input gap; group related fields under subheadings when > ~7 fields; short
paired fields (city/postcode, first/last name) may share a row at ≥ ~640px.
Use when: ≤ ~15 fields with no branching.
Avoid when: steps depend on earlier answers (use `multi-step-wizard`); editing one value
in context (use `inline-edit`).
Variables: label position (top vs left at wide widths), optional field marking.
Failure modes: two-column layouts that scramble tab order; placeholder-as-label;
validation on every keystroke before the user finishes.
Accept: tab order equals visual order; every input has a programmatic label; errors keep
entered data and are announced; submit reachable with keyboard at 320px.
Seen as (DNA signals): a `form` whose inputs share one left edge in a column 360–640px wide
with labels above inputs and one button at the bottom.

### multi-step-wizard — Multi-step wizard
Job: Complete a long or branching task in manageable chunks.
Anatomy: (1) step indicator with count and names *invariant*; (2) one step's fields
*invariant*; (3) back + next actions *invariant*; (4) review step before commit.
Measures: 3–7 steps; 1–7 fields per step; progress indicator shows current/total;
state preserved when navigating back; review step lists every answer with edit links.
Use when: > ~15 fields, branching, or tasks users may pause.
Avoid when: ≤ ~7 fields (a wizard adds clicks); expert users editing one field.
Variables: indicator style (numbered, bar), save-and-resume support.
Failure modes: losing data on back; indicator showing steps that branching skips;
"Next" validates fields of other steps.
Accept: back preserves values; final commit only on the review step; current step
exposed via `aria-current="step"`; refresh does not silently lose progress (or warns).
Seen as (DNA signals): an ordered list of 3–7 step labels with one marked current above a
short form; back/next button pair.

### inline-edit — Inline edit
Job: Change one value where it is displayed without leaving the context.
Anatomy: (1) read state showing the value *invariant*; (2) explicit edit affordance
*invariant*; (3) edit state with save/cancel (or Enter/Esc) *invariant*; (4) saving and
error feedback.
Measures: edit control occupies the same box as the value (no layout jump > 1 step);
save confirms within ~1s or shows progress.
Use when: frequent small edits (names, statuses, table cells).
Avoid when: edits have side effects needing review; multi-field changes.
Variables: click-to-edit vs edit icon, autosave vs explicit save.
Failure modes: edit affordance only on hover; blur saves unintentionally; failed save
reverts silently.
Accept: affordance visible without hover (or focusable with visible cue); Esc cancels;
failed save keeps the edited value and shows an `inline-message`.
Seen as (DNA signals): text elements that become inputs in place; small pencil buttons
beside values.

### onboarding-checklist — Onboarding checklist
Job: Guide a new user to the first valuable outcome through concrete setup tasks.
Anatomy: (1) list of tasks each with an action *invariant*; (2) completion state per
task *invariant*; (3) progress (n of m); (4) dismiss option.
Measures: 3–7 tasks; first task completable in < ~2 minutes; each task links directly
to where it is done; checklist persists until dismissed or complete.
Use when: products needing setup before value (connect data, invite team).
Avoid when: the product delivers value immediately; as a carousel of feature tips.
Variables: placement (sidebar card, dedicated page, `empty-state` content), ordering.
Failure modes: tasks marked complete on click rather than on real completion; cannot
dismiss; tour overlays blocking the UI.
Accept: completion derives from actual state; dismissible and recoverable; each task
names a concrete outcome.
Seen as (DNA signals): a list of 3–7 items with check icons and a progress count/bar,
often in a sidebar card or top of an empty dashboard.

### auth-screen — Sign in / sign up
Job: Authenticate with minimal friction and clear recovery.
Anatomy: (1) product identity *invariant*; (2) the offered methods (SSO buttons,
email/password, passkey, magic link) *invariant*; (3) primary action *invariant*;
(4) switch between sign in/sign up; (5) recovery link.
Measures: single column 320–420px; centered or offset with a brand panel at ≥ ~1024px;
password field with show/hide; methods ordered by the product's preference, not
alphabetically.
Use when: any authentication surface.
Avoid when: n/a — but avoid marketing content competing with the form.
Variables: brand panel presence, method order.
Failure modes: blocked paste in password fields; errors that reveal whether an account
exists when the product considers that sensitive; `autocomplete` attributes missing.
Accept: correct `autocomplete` values (`username`, `current-password`, `new-password`,
`one-time-code`); paste allowed; recovery link visible before an error occurs.
Seen as (DNA signals): a narrow (320–420px) form with 1–2 inputs and stacked full-width
buttons, sometimes beside a full-height image/brand panel.

### checkout-flow — Checkout
Job: Turn intent into a completed purchase with confidence.
Anatomy: (1) order summary (items, totals, taxes, shipping) *invariant*; (2) contact →
delivery → payment sections *invariant*; (3) place-order action with final total
*invariant*; (4) trust/returns info only if true.
Measures: two columns at ≥ ~1024px (form 55–65%, summary 35–45%, summary sticky);
single column below with collapsible summary showing the total; guest checkout available
when the business allows it.
Use when: purchase or paid sign-up.
Avoid when: n/a.
Variables: one page vs steps, express payment placement.
Failure modes: total changing at the last step without explanation; navigation/footer
pulling users out; invented security badges.
Accept: final total visible next to the place-order button; minimal header/footer;
errors keep entered data; any badge corresponds to a real certification supplied by the user.
Seen as (DNA signals): a form beside a sticky summary panel containing line items and a
total; reduced navigation chrome.

### settings-page — Settings page
Job: Let users find and change preferences safely.
Anatomy: (1) categories (side list or sections) *invariant*; (2) labelled setting rows
with description *invariant*; (3) save model (instant vs explicit) consistent across the
page *invariant*; (4) danger zone separated at the end.
Measures: content column 560–800px; each row = label + one-line description + control;
category list via `list-detail` or `sidebar-nav` at ≥ ~1024px, stacked sections below.
Use when: ≥ ~5 preferences.
Avoid when: 1–3 settings (inline them where they apply).
Variables: instant-save vs save bar, grouping.
Failure modes: mixing instant toggles and a save button on one page; destructive actions
next to routine ones; settings without explanations.
Accept: one save model per page and stated; destructive settings use
`destructive-confirm`; every control has a label and description association.
Seen as (DNA signals): a column of rows each with text on the left and a toggle/select on
the right; a red-bordered section at the bottom.
