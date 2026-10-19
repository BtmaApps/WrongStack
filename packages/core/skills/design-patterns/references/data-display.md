# Data display

How to present records, metrics and change over time. Chart craft (form choice,
palettes, marks) belongs to dedicated data-visualization guidance; this file only
fixes where charts sit and what surrounds them. Tabular figures and numeric type
roles: design-craft `references/typography.md`.

---

### data-table — Data table (density tiers)
Job: Scan, sort, compare and act on many records with several attributes.
Anatomy: (1) column headers with sort affordances *invariant*; (2) rows *invariant*;
(3) toolbar (search, filters, bulk actions); (4) pagination or virtual scroll; (5) row
actions; (6) `empty-state`/`loading-skeleton`/`error-state` variants *invariant*.
Measures: density tiers (conventions): compact rows 28–36px, regular 40–48px,
comfortable 52–64px. Numeric columns right-aligned with tabular figures; text left-
aligned; header sticky when > ~15 rows; 4–10 visible columns before horizontal scroll;
first column (identifier) sticky on horizontal scroll. Below ~640px either horizontal
scroll with sticky first column or convert to `row-list` cards showing 2–4 key fields.
Use when: ≥ 3 attributes per record and users compare across rows.
Avoid when: records are visual (use `catalogue-grid`); ≤ 2 attributes (use `row-list`).
Variables: density tier, zebra vs dividers, row selection model, column visibility.
Failure modes: numbers center-aligned or proportional figures; every column the same
width; no zero/loading/error states; actions visible only on hover; tables rendered as
`div` grids without semantics.
Accept: semantic `table` (or full ARIA grid) with `th scope`; numeric columns right-
aligned with tabular numerals; sort state exposed via `aria-sort`; at 360px the
identifier column remains visible.
Seen as (DNA signals): `table` with ≥ 3 columns and ≥ 5 rows; consistent row heights in
one tier; right-aligned numeric cells; sticky `thead`.

### kpi-tiles — KPI / stat tiles
Job: Summarize the few numbers that tell whether things are healthy.
Anatomy: (1) label *invariant*; (2) value *invariant*; (3) comparison (delta vs a stated
period or target) *invariant*; (4) optional sparkline; (5) link to detail.
Measures: 3–6 tiles per row at desktop, 2 per row on phones; value 1.75–3× body size;
delta includes sign, unit and period ("+4.2% vs last 7 days"); all tiles in a row share
height and alignment.
Use when: top of a dashboard; ≤ 6 primary metrics.
Avoid when: > ~8 metrics (use a `data-table`); metrics without a comparison baseline.
Variables: sparkline presence, tile surface, color for delta direction.
Failure modes: values without period or unit; delta shown by color alone; vanity counts
(slop L6); demo numbers not labelled as demo.
Accept: each tile states period/baseline; direction conveyed by sign/icon not only
color; numbers use tabular figures; demo data labelled.
Seen as (DNA signals): row of 3–6 equal boxes each with a short label, one large number
(≥ 1.75× body) and a small signed percentage.

### card-collection — Card collection
Job: Present items whose main identity is visual or heterogeneous and are opened rather
than compared.
Anatomy: (1) uniform card anatomy (media, title, 1–3 meta fields, optional action)
*invariant*; (2) grid layout.
Measures: card min width 220–320px; 2–4 lines of text max; one primary click target per
card (whole card or title, not both competing); gap 16–24px.
Use when: items have imagery or rich previews; browsing, not comparing.
Avoid when: users compare attributes (use `data-table`); items are text-only and many (use
`row-list`).
Variables: media ratio, metadata fields, hover elevation.
Failure modes: nested interactive elements inside a clickable card; truncated titles
without full-text access; unequal heights.
Accept: one primary link per card; titles fully available (tooltip or wrap ≤ 2 lines);
cards align to a common height per row.
Seen as (DNA signals): repeated equal-size boxes with an image on top and text below in a
grid.

### row-list — Row list
Job: Scan a list of text-centric items (messages, issues, files) quickly.
Anatomy: (1) row with primary text *invariant*; (2) secondary metadata aligned in fixed
positions *invariant*; (3) optional leading icon/avatar and trailing action.
Measures: row height 40–72px depending on 1 or 2 text lines; metadata in consistent
columns or right-aligned; dividers or spacing, not both heavy.
Use when: many text items, chronological or prioritized; mobile-friendly alternative to
tables.
Avoid when: many attributes need comparison (use `data-table`).
Variables: one vs two lines, leading visual, dividers.
Failure modes: metadata jumping position row to row; unread/selected state by color only.
Accept: metadata x-positions align across rows; state shown with weight/icon + color.
Seen as (DNA signals): ≥ 5 stacked full-width rows of identical structure with
right-aligned small text.

### list-detail — List-detail (master-detail)
Job: Pick an item from a list and see/edit its full content without losing the list.
Anatomy: (1) list pane *invariant*; (2) detail pane *invariant*; (3) selection state
*invariant*; (4) empty detail state when nothing is selected.
Measures: list 280–400px, detail fills the rest; on ≤ ~768px becomes two screens
(list → detail with back); selected item stays visible in the list.
Use when: inbox, issue trackers, settings categories, file browsers.
Avoid when: items are rarely opened (use `row-list` with links); comparison across items
needed.
Variables: list density, detail header actions, resizable divider (see `split-pane`).
Failure modes: detail pane blank with no guidance; selection lost after edits; mobile
shows both panes squeezed.
Accept: URL reflects selected item; detail empty state explains what to select; mobile
back returns to the same list scroll position.
Seen as (DNA signals): a narrow scrolling list beside a wide pane whose content changes on
list click; one list row in selected style.

### activity-timeline — Activity timeline
Job: Show what happened, in order, with who and when.
Anatomy: (1) time-ordered entries *invariant*; (2) timestamp per entry *invariant*;
(3) actor + action text; (4) optional grouping by day.
Measures: entries 32–64px; day group headers; relative times ("3h ago") with absolute time
on hover/title; newest-first for feeds, oldest-first for histories/changelogs (state which).
Use when: audit logs, activity feeds, order history, changelogs.
Avoid when: users need to filter/sort by many attributes (use `data-table`).
Variables: vertical rule + dots vs plain list, grouping granularity.
Failure modes: relative times only (no absolute); mixed ordering; unbounded list with no
pagination.
Accept: absolute timestamp available for every entry; ordering stated and consistent;
loads in pages.
Seen as (DNA signals): vertical list with a connecting line/dots and a time element per
item; `time` elements with `datetime`.

### chart-panel — Chart panel placement
Job: Place a chart so its question, scale and context are readable.
Anatomy: (1) title stating the question or takeaway *invariant*; (2) time range / filter
controls *invariant* when data is time-based; (3) chart; (4) legend or direct labels;
(5) source/updated-at note; (6) loading/empty/error variants.
Measures: primary chart spans 2/3 to full width of the content area; minimum height
240–320px; secondary charts in a 2-column grid at ≥ 1024px, 1 column below; max ~6
series per chart.
Use when: trend, distribution or comparison is the point.
Avoid when: users need exact values (use `data-table` or add one beneath); one number
(use `kpi-tiles`).
Variables: chart type (defer to data-viz guidance), panel surface, toolbar placement.
Failure modes: every chart same size in a uniform grid regardless of importance; missing
units/axis labels; colors meaning different things across panels.
Accept: title + units + time range visible without hover; a table or accessible summary
exists for the data; series colors consistent across panels.
Seen as (DNA signals): `svg`/`canvas` regions ≥ 240px tall with headings and segmented
controls for ranges above them.
