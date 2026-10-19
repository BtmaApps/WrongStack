# Signal map — extract signals → design-patterns ids

`design_reference {action:"extract"}` prints a **Signals (inferred)** line. Each signal is
a measurement rule, not a verdict. This table says which catalog ids it is
evidence for and what second signal confirms it. Name an id only with two
observed signals (see design-patterns "Identifying a pattern on a reference").

| Signal | Measured as | Evidence for | Confirm with |
|---|---|---|---|
| `sticky-nav` | header/nav computed `position` sticky or fixed | `top-bar-nav` | nav link count ≥ 3 in the record; nav visible in every screenshot |
| `glass-sticky-nav` | sticky/fixed nav with `backdrop-filter` | `top-bar-nav`, `trend-glass-material` | translucent nav over content in a screenshot |
| `centered-hero` | first section ≥ 200px tall, heading `text-align: center` | `hero-claim-product-shot`, `hero-editorial` | product media below the claim (`[center]`/`[full]` in rhythm) |
| `left-aligned-hero` | first section heading aligned start/left | `hero-split`, `hero-editorial` | `[left]`/`[right]` media on the first rhythm entry → `hero-split` |
| `split-media-sections` | ≥ 2 sections whose largest media sits left or right | `hero-split`, `feature-zigzag` | alternation → `feature-zigzag` |
| `alternating-media-rows` | ≥ 3 side-media sections, side flips ≥ 2 times | `feature-zigzag` | similar section heights in the rhythm line |
| `full-bleed-media` | ≥ 2 sections with media wider than 80% of the viewport | `hero-claim-product-shot`, `trend-immersive-3d` | `media` share ≥ 25% in Color |
| `multi-column-grid` | a section containing a grid or row of ≥ 3 columns | `card-collection`, `bento-grid`, `pricing-table`, `kpi-tiles` | screenshot: equal cells → `card-collection`; mixed spans → `bento-grid`; price + button per column → `pricing-table` |
| `grid-reflows-on-narrow` | widest grid columns drop between viewports | responsive evidence for any grid pattern | narrow screenshot shows a single column |
| `sticky-scroll-narrative` | a section taller than 1.5 viewports containing a sticky element | `feature-sticky-narrative`, `trend-scroll-driven-narrative` | screenshot or scroll shows the pinned media changing |
| `inverted-bands` | ≥ 12% of area in colors opposite the page background lightness | `cta-band`, alternating section emphasis | the band carries a heading + action |
| `dark-theme` | page background OKLab L < 0.5 | `trend-dark-first` | check whether a light theme exists (`color-scheme`, toggle) |
| `monochrome-palette` | chromatic area ≤ 2% and achromatic primary | restraint strategy (no id) | filled buttons are black/white |
| `gradient-surfaces` | ≥ 5% of sampled points land on a gradient | `trend-gradient-accent` | where: background wash vs. accents only |
| `glass-surfaces` | ≥ 3 elements with `backdrop-filter` | `trend-glass-material` | translucent panels over imagery |
| `hard-offset-shadows` | dominant shadows have zero blur and an offset | `trend-neo-brutalist` | thick borders, square corners |
| `square-corners` | dominant radius ≤ 2px | `trend-neo-brutalist`, editorial/swiss strategies | — |
| `pill-buttons` | primary button radius ≥ half its height | shape strategy (no id) | pill share in Shape |
| `display-type-pairing` | the largest text uses a different family than body | type strategy (no id) | — |
| `mono-accent-type` | a monospace family carries text | developer-tool tone (no id) | where: code samples vs. labels |
| `tight-display-tracking` | largest sizes have letter-spacing ≤ −0.015em | `trend-oversized-type` when display ≥ 64px | largest size in Type |
| `uppercase-labels` | ≥ 3% of characters are text-transform uppercase | label strategy (no id) | — |
| `dense-type` | body ≤ 14px | `sidebar-console`, `data-table` density | app-like chrome in screenshots |
| `media-heavy` | ≥ 30% of area is image/video/canvas | `catalogue-grid`, `masonry-grid`, `trend-immersive-3d` | image aspect ratios in raw.json |

Signals the extractor cannot produce — command palette, tabs, accordions,
forms, empty/error states — need the screenshots or interaction (browser_click
/ browser_snapshot) before naming their ids.
