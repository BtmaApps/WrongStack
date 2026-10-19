# Navigation

How users move between destinations and views. Rule of thumb: navigation changes
*where you are* (URL or view changes); actions change *what exists*. Never mix the
two in one control group.

Touch targets: WCAG 2.2 SC 2.5.8 minimum 24×24 CSS px; Apple HIG recommends 44×44 pt,
Material 48×48 dp. Use ≥ 44px for primary touch navigation.

---

### top-bar-nav — Top navigation bar
Job: Global navigation for sites or apps with few top-level destinations.
Anatomy: (1) identity/home link at the start *invariant*; (2) 3–7 destination links
*invariant*; (3) utility area at the end (search, account, primary CTA).
Measures: height 48–72px; 3–7 top-level items (more needs `mega-menu` or
`sidebar-nav`); collapses into a menu button below the width where all items plus
utilities fit on one line (commonly ~768–1024px).
Use when: ≤ 7 destinations; marketing sites; apps with shallow hierarchy.
Avoid when: ≥ 8 destinations or deep hierarchy used daily (use `sidebar-nav`).
Variables: sticky vs static, transparent-over-hero vs solid, CTA presence.
Failure modes: transparent bar over a busy hero making links unreadable; hamburger at
desktop widths with room to spare; CTA styled identically to links.
Accept: link contrast ≥ 4.5:1 over every background it overlaps; current page marked;
menu button has an accessible name and `aria-expanded`.
Seen as (DNA signals): a full-width `header`/`nav` 48–72px tall at the top containing a
horizontal list of 3–7 links and an end-aligned button.

### sidebar-nav — Sidebar navigation
Job: Persistent navigation for many destinations or a deep hierarchy.
Anatomy: (1) vertical list grouped into labelled sections *invariant*; (2) active
indicator *invariant*; (3) optional collapse control; (4) optional workspace/account
switcher at top or bottom.
Measures: 200–280px wide, collapsed rail 48–72px; item height 32–44px (compact to
comfortable); ≤ 7 items per group; nesting ≤ 2 levels.
Use when: ≥ 8 destinations, or users switch sections repeatedly in a session.
Avoid when: mobile-first consumer apps (use `bottom-tab-bar`); ≤ 5 destinations.
Variables: grouping, collapsed default, icon set, position of account switcher.
Failure modes: 3+ nesting levels; icons without labels in collapsed state; actions mixed
into the destination list.
Accept: collapsed rail exposes names via tooltip and accessible name; nesting ≤ 2;
keyboard can reach every item in visual order.
Seen as (DNA signals): a vertical list of links inside a full-height column; section
labels in small/uppercase text; one item with distinct background.

### command-palette — Command palette
Job: Fast keyboard access to any destination or action by typing.
Anatomy: (1) global shortcut to open (Ctrl/Cmd+K is the common convention)
*invariant*; (2) search input with focus on open *invariant*; (3) grouped results
with keyboard selection *invariant*; (4) shortcut hints per result.
Measures: dialog width 480–720px; positioned in the upper third (≈ 10–20vh from top);
5–10 visible results; results update per keystroke with < 100ms perceived latency for
local items.
Use when: power users, many destinations/actions, keyboard-heavy tools.
Avoid when: as the *only* navigation; audiences that rarely use keyboards.
Variables: shortcut key, grouping, inclusion of recent items.
Failure modes: no visible entry point (shortcut only); focus not trapped/restored;
fuzzy match that hides exact matches.
Accept: also reachable from a visible button; Esc closes and focus returns to the
trigger; arrow keys + Enter work; dialog has an accessible name.
Seen as (DNA signals): hidden dialog containing an input + `role="listbox"` that opens on
a key chord; "⌘K"/"Ctrl K" hint text in the chrome.

### tabs — Tabs
Job: Switch between sibling views of the same object or page section.
Anatomy: (1) tab list *invariant*; (2) one active panel *invariant*; (3) active
indicator *invariant*.
Measures: 2–7 tabs; labels 1–3 words; overflow scrolls horizontally with a visible cue
or moves into a "More" menu; tab height 36–48px.
Use when: views are parallel and users need one at a time; content of each panel is
substantial.
Avoid when: choosing a value or filter (use `segmented-control`); sequential steps (use
`multi-step-wizard`); content everyone must see.
Variables: underline vs pill indicator, URL-addressable panels.
Failure modes: tabs used as page navigation without URL changes (breaks back button);
two tab rows stacked; arrow-key navigation missing.
Accept: ARIA tabs semantics (`tablist`/`tab`/`tabpanel`), arrow keys move focus;
deep-linkable when the panel is a destination.
Seen as (DNA signals): a row of 2–7 sibling controls with one marked selected and one
visible sibling panel.

### segmented-control — Segmented control
Job: Choose one of 2–5 mutually exclusive options that change a view's mode or filter.
Anatomy: (1) contiguous button group *invariant*; (2) exactly one selected *invariant*.
Measures: 2–5 segments; equal-width segments; labels ≤ 2 words or icon + accessible name;
height 28–40px (compact to cozy).
Use when: switching a display mode (list/grid, day/week/month), toggling a filter.
Avoid when: > 5 options (use a select); switching between different content panels
(use `tabs`); on/off settings (use a switch).
Variables: icon vs text, size.
Failure modes: used for navigation; selected state shown by color alone.
Accept: implemented as radio group semantics; selected state distinguishable without
color (weight, fill, check); keyboard operable.
Seen as (DNA signals): 2–5 adjacent equal-width buttons sharing one rounded container,
one filled.

### breadcrumbs — Breadcrumbs
Job: Show location within a hierarchy and allow jumping to ancestors.
Anatomy: (1) ordered ancestor links *invariant*; (2) current page as non-link last item
*invariant*; (3) separators.
Measures: use at hierarchy depth ≥ 3; truncate middle items with an ellipsis menu beyond
4–5 levels; font one step smaller than body.
Use when: deep hierarchies (docs, file trees, catalogues, admin records).
Avoid when: flat sites; as a substitute for primary navigation; linear flows.
Variables: separator glyph, truncation strategy.
Failure modes: current page rendered as link; breadcrumbs reflecting browsing history
instead of hierarchy; separators read aloud by screen readers.
Accept: wrapped in `nav` with an accessible name; last item has `aria-current="page"`;
separators are decorative (CSS or `aria-hidden`).
Seen as (DNA signals): an ordered list of 2–6 short links with separator glyphs above the
page title.

### bottom-tab-bar — Bottom tab bar (mobile)
Job: Primary navigation between top-level destinations on phones.
Anatomy: (1) 3–5 destinations *invariant*; (2) icon + short label each *invariant*;
(3) active state.
Measures: 3–5 items (Material navigation bar guidance is 3–5); bar height ≈ 56–80px
including safe-area inset; targets ≥ 44px; labels ≤ 1 word where possible.
Use when: mobile app or mobile web app with 3–5 top-level destinations used often.
Avoid when: > 5 destinations; desktop layouts (switch to side or top nav ≥ ~768px);
actions (use a FAB or toolbar).
Variables: label always vs active-only (always is safer), badge use.
Failure modes: icons without labels; bar covering content without bottom padding;
ignoring the home-indicator safe area.
Accept: content has bottom padding ≥ bar height; `env(safe-area-inset-bottom)` respected;
each item has a visible label or accessible name.
Seen as (DNA signals): fixed element at viewport bottom with 3–5 equal-width items each
icon + text, only on narrow widths.

### mega-menu — Mega menu
Job: Expose a large, grouped set of destinations from a top bar.
Anatomy: (1) top-level trigger *invariant*; (2) panel with labelled groups
*invariant*; (3) optional featured item.
Measures: 3–6 groups of ≤ 8 links; panel width up to container width; opens on click
(hover-open needs delay ≈ 150–300ms and must also work by click/keyboard); on mobile
becomes a drill-down or accordion.
Use when: ≥ ~20 destinations in a top-bar site (commerce, docs portals, enterprise).
Avoid when: < ~12 destinations (use plain dropdown or `top-bar-nav`).
Variables: featured content, column layout.
Failure modes: hover-only menus closing when the pointer crosses a gap; panel not
dismissible with Esc; focus trapped or lost.
Accept: opens and closes with keyboard; Esc closes and returns focus; pointer can travel
diagonally into the panel without closing it.
Seen as (DNA signals): a full-width overlay panel below the top bar containing 3–6
headed link columns, toggled by top-level items.
