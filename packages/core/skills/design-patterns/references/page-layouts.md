# Page layouts

Whole-page spines. Pick one per surface, then fill its regions with patterns from
the other reference files. Grid, rhythm and focal point craft live in
design-craft `references/composition.md`; this file fixes the structure.

All widths are container widths unless stated. Breakpoints are conventions;
let the content decide the exact reflow point.

---

### app-shell — Application shell
Job: Frame a multi-screen product so global navigation, identity and account
controls stay put while the content area changes.
Anatomy: (1) top bar with product identity + global actions *invariant*;
(2) primary navigation (top or side) *invariant*; (3) content region that owns the
scroll *invariant*; (4) optional status/footer strip.
Measures: top bar 48–64px tall; content region scrolls independently of the shell
(shell does not scroll away). Content max width either fluid (tools) or 1120–1440px
(document-like pages). On ≤768px the side navigation collapses into a drawer or a
`bottom-tab-bar`.
Use when: ≥3 top-level destinations used repeatedly in one session; signed-in product.
Avoid when: a single-task flow (use `single-column-form`/`checkout-flow`); marketing
pages; content read once.
Variables: navigation placement (top vs side), bar height within range, density,
whether the top bar carries search.
Failure modes: two competing navigation bars of equal weight; the whole page scrolls
so the navigation disappears; global actions duplicated inside every page header.
Detect: scroll the content and check whether the bar stays fixed; count distinct
navigation landmarks.
Accept: one `<nav>` landmark per navigation level; shell stays fixed while content
scrolls; current destination is marked visually and with `aria-current`; at 360px
every destination stays reachable in ≤2 taps.
Seen as (DNA signals): a fixed/sticky element of 48–64px height spanning full width
at top; a scroll container that is not `document.body`; identical shell geometry
across multiple routes.

### sidebar-console — Sidebar operator console
Job: Daily-use admin, monitoring or dashboard tool with many sections and dense data.
Anatomy: (1) persistent left sidebar with grouped navigation *invariant*;
(2) page header with title + primary action *invariant*; (3) dense content canvas
(tables, `kpi-tiles`, `chart-panel`) *invariant*; (4) optional right inspector.
Measures: sidebar 200–280px expanded, 48–72px collapsed icon rail; 5–15 nav items,
grouped in sections of ≤7; content gutters 16–32px; page header 56–80px. Reflow at
~1024px: sidebar collapses to rail; at ≤768px it becomes a drawer.
Use when: ≥5 sections; users switch sections often; content is data-dense.
Avoid when: ≤4 destinations (a `top-bar-nav` wastes less width); reading-first content.
Variables: sidebar width within range, collapsed default, section grouping labels,
light/dark sidebar, presence of the inspector.
Failure modes: icon-only rail with no labels or tooltips; sidebar items that are
actually actions ("New report") mixed with destinations; a hero banner pushed into
the content canvas; KPI cards with no time period.
Detect: hover/focus each rail icon for an accessible name; list nav items and check
each is a destination (a URL change).
Accept: every nav item has a visible label or accessible name; active item marked;
content canvas starts with the page title within the first 120px below the top bar;
collapsed state persists across reloads or is deliberately reset.
Seen as (DNA signals): a full-height column 200–280px (or 48–72px) wide at the left
edge with vertical link list; adjacent canvas ≥ 3× its width; grid/table elements
dominant in the canvas.

### split-pane — Split pane (resizable)
Job: Work on two related views at once (source/preview, list/editor, map/list).
Anatomy: (1) primary pane *invariant*; (2) secondary pane *invariant*;
(3) divider, ideally draggable with a keyboard alternative.
Measures: default ratio between 30/70 and 50/50; each pane min 280–320px; divider
hit area ≥8px even if drawn as 1px. Below ~900px stack the panes or switch them
with `tabs`/`segmented-control`.
Use when: users compare or cross-reference both views continuously.
Avoid when: the second view is only consulted occasionally (use a drawer or
`list-detail`); narrow-only audiences.
Variables: orientation (horizontal/vertical), default ratio, which pane collapses first.
Failure modes: panes that each scroll the whole page; drag divider with no keyboard
equivalent; panes crushed below readable width instead of stacking.
Accept: each pane scrolls independently; divider operable by keyboard (arrow keys or a
menu) or ratio presets exist; at narrow width no pane is below 280px.
Seen as (DNA signals): two sibling scroll containers filling the viewport height;
a 1–8px separator element with `cursor: col-resize`/`row-resize`.

### holy-grail — Header, three columns, footer
Job: Document-style page with navigation on one side and supplementary content
(table of contents, related links, ads) on the other. Classic docs layout.
Anatomy: (1) header *invariant*; (2) left nav column; (3) main content *invariant*;
(4) right aside (on-page TOC); (5) footer *invariant*.
Measures: left 200–280px, right 180–260px, main text measure 60–75ch (see
design-craft typography). Drop the right aside at ~1200px (move TOC inline or into a
disclosure), drop the left nav to a drawer at ~900px.
Use when: documentation, knowledge bases, long reference pages with hierarchy.
Avoid when: app workflows; marketing; content without a navigable hierarchy.
Variables: whether asides are sticky, aside order on small screens.
Failure modes: main column stretched to full width so lines exceed 90ch; both asides
kept at tablet width squeezing the main text; TOC not tracking scroll position.
Accept: main body measure 60–75ch at desktop; asides collapse before main drops
below ~55ch; TOC highlights the current section.
Seen as (DNA signals): three columns where the middle has a max-width in ch/≈640–760px
and both side columns are sticky; heading anchor links in the right column.

### editorial-column — Single editorial column
Job: Long-form reading: articles, changelogs, essays, case studies.
Anatomy: (1) title block (title, standfirst, byline/date) *invariant*;
(2) single text column *invariant*; (3) media that may break out wider than the text;
(4) end matter (related, subscribe).
Measures: text measure 60–75ch (≈ 600–720px at 16–18px body); breakout media up to
1.5–2× the text width or full-bleed; vertical gap between paragraphs ≈ 1 line height;
headings get more space above than below (roughly 2:1).
Use when: content is primarily prose read top to bottom.
Avoid when: users scan/compare items; dashboards; marketing pages needing many CTAs.
Variables: serif/sans, breakout frequency, presence of pull quotes, sidenotes at ≥1200px.
Failure modes: text column at container width (100+ch); every image full-bleed so
nothing is special; cards wrapped around paragraphs.
Accept: measured line length 60–75ch at desktop and ≥ 35ch at 320px; heading spacing
asymmetric (more above); no horizontal scroll at 320px.
Seen as (DNA signals): one dominant text column with max-width ≈ 600–720px centered or
offset; occasional children wider than that column; low count of interactive elements.

### bento-grid — Bento grid
Job: Show a small set of features or facts with unequal importance in one screenful.
Anatomy: (1) grid of tiles with 2–3 distinct size classes *invariant*; (2) one or two
dominant tiles *invariant*; (3) each tile carries one idea with real visual evidence
(screenshot crop, stat with source, short demo).
Measures: 4–6 columns at desktop (≥1024px), 2–3 at tablet, 1–2 on mobile (convention
reported by studiomeyer.io, 2026-09); 5–9 tiles total; dominant tile spans 2×2, highlight
tiles 2×1, others 1×1; gap uniform, 16–24px; at most 1–2 dominant tiles per viewport
height. Gap must equal or exceed tile inner padding minus one step.
Use when: 4–9 items with clearly different importance; marketing feature overviews;
personal dashboards of heterogeneous widgets.
Avoid when: items are equivalent (use `catalogue-grid`); tabular data (use
`data-table`); prose; strict reading order matters.
Variables: column count within range, which tiles are dominant, tile surface treatment.
Failure modes: tile sizes assigned by text length rather than importance; every tile
icon + title + two grey lines (slop L10); dense mosaic with no dominant tile; mobile
order that puts a minor tile first.
Accept: exactly 1–2 tiles visibly larger per viewport; each tile states one idea; on
mobile the DOM/reading order puts the dominant tile first; tile text does not overflow
at 320px.
Seen as (DNA signals): CSS grid with mixed `grid-column: span 1/2` and `grid-row: span
1/2`; ≥2 tile size classes; uniform gaps; tiles with their own background/border.

### catalogue-grid — Catalogue grid with filter rail
Job: Browse many comparable items (products, templates, people) and narrow them down.
Anatomy: (1) filter/sort controls (rail or toolbar) *invariant*; (2) result count
*invariant*; (3) uniform item grid *invariant*; (4) pagination or load-more.
Measures: card min width 200–320px, columns via `auto-fill`, typically 2 (mobile) to
4–6 (desktop); identical card anatomy and aspect ratio; filter rail 220–300px, becomes
a sheet/drawer below ~1024px; 12–48 items per page.
Use when: >12 comparable items with filterable attributes.
Avoid when: items need attribute comparison (use `data-table`); <6 items; items of
different kinds.
Variables: card media ratio, rail vs top toolbar, pagination style.
Failure modes: unequal card heights from variable text; filters that reset scroll and
lose position; no zero-result state; applied filters invisible.
Accept: applied filters are visible as removable chips or checked states; result count
updates; zero results show an `empty-state` with a "clear filters" action; card images
keep one aspect ratio.
Seen as (DNA signals): repeated sibling elements with identical bounding-box sizes in
a grid; a form/checkbox group in a 220–300px column; a "N results" text node.

### masonry-grid — Masonry / waterfall grid
Job: Browse visual items of varying natural height (photos, pins, notes) where
packing density matters more than row alignment.
Anatomy: (1) fixed-width columns *invariant*; (2) items keep natural height
*invariant*; (3) infinite or paged loading.
Measures: column width 200–320px; 2 columns on mobile up to 4–6 on desktop; gap 8–16px.
Implementation is usually JS or CSS columns; check native CSS masonry support in
web-platform-baseline before relying on it.
Use when: media items with intrinsic heights; exploration rather than comparison.
Avoid when: order matters (masonry scrambles reading order across columns); text
records; items needing comparison.
Variables: column width, gap, caption visibility.
Failure modes: keyboard/tab order jumps across columns; layout shift as images load
(no reserved aspect ratio); text-heavy items making columns ragged.
Accept: images reserve space before load (no visible shift); tab order follows a
predictable sequence; items keep consistent width.
Seen as (DNA signals): equal-width columns whose children have varied heights and
staggered top offsets (no shared row baseline).

### canvas-tool-chrome — Canvas tool chrome
Job: Edit an artifact (design, diagram, document, map, video) where the artifact
must dominate and tools sit at the edges.
Anatomy: (1) central canvas *invariant*; (2) top or floating toolbar *invariant*;
(3) left panel (layers/assets); (4) right inspector (properties of selection);
(5) zoom/status controls at a corner.
Measures: canvas ≥ 60% of viewport width at desktop; side panels 200–320px each and
independently collapsible; toolbar 40–56px; keyboard shortcuts for primary tools.
Below ~768px panels become sheets; consider whether editing on phones is supported at all.
Use when: direct manipulation of a spatial artifact.
Avoid when: form-like data entry; read-only viewing.
Variables: floating vs docked toolbars, which panels exist, dark canvas surround.
Failure modes: chrome eating the canvas (panels can't collapse); inspector showing
nothing useful with no selection; tools discoverable only by hover.
Accept: panels collapse and canvas expands to ≥ 90% width; inspector shows document
properties when nothing is selected; every tool has an accessible name and visible
shortcut hint.
Seen as (DNA signals): a `<canvas>`/large SVG or transformable element filling the
center; narrow panels pinned at left and right; toolbars with many icon buttons.
