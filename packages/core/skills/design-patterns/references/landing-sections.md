# Landing sections

Sections of a persuasive page. A landing page is a sequence chosen from this file,
not a fixed template: claim → evidence → objection handling → action. Copy craft
lives in design-craft `references/copy.md`; this file fixes structure.

**Proof rule (applies to every section here):** never fabricate customer logos,
testimonials, quotes, ratings, user counts, awards or "trusted by" claims. If real
proof is not supplied, omit the slot or render a clearly labelled placeholder for
the user to fill. Do not use real brand logos as illustrative filler.

---

### hero-claim-product-shot — Claim + product shot
Job: State what the product does and show it, in the first viewport.
Anatomy: (1) headline making one concrete claim *invariant*; (2) one-sentence
subhead; (3) one primary CTA *invariant* (+ at most one secondary); (4) a real
product screenshot or recording *invariant*, below or beside the text.
Measures: headline 2–3.5× body size; headline ≤ 2 lines at desktop, ≤ 4 at 360px
(measure 20–35ch); headline + CTA visible without scrolling at 1280×720 and 390×844;
screenshot ≥ 50% of container width when stacked below.
Use when: the product UI itself is the strongest argument.
Avoid when: no real UI exists yet (use `hero-editorial`); the product is invisible
infrastructure (consider `hero-demo-first` with a terminal/API sample).
Variables: text alignment (left or centered), shot position (below/right), shot framing.
Failure modes: mock dashboard full of lorem data; gradient headline (slop C1); three
CTAs of equal weight; screenshot so small its content is illegible.
Accept: one visually dominant CTA; text in the screenshot is legible at 1× zoom or
the shot is cropped to a legible region; first viewport contains claim + CTA at both
reference sizes.
Seen as (DNA signals): an `h1` in the first viewport with font-size ≥ 2× body; one
high-contrast button near it; a large `img`/`video` whose width ≥ 50% of the container.

### hero-split — Split hero
Job: Pair a claim with a strong visual side by side.
Anatomy: (1) text column (headline, subhead, CTA) *invariant*; (2) media column
*invariant*.
Measures: columns 5/7, 6/6 or 7/5 on a 12-column grid; vertical alignment centered or
top; stacks below ~900px with text first (unless the media is the claim).
Use when: media and claim are equally important; product has a physical/visual subject.
Avoid when: headline is long (> ~10 words) — a narrow column will wrap it into 5+ lines.
Variables: column ratio, media bleed to viewport edge, order on mobile.
Failure modes: media column decorative (abstract blob) rather than informative;
text column too narrow so headline wraps word-by-word; stacked mobile pushing CTA
below the fold behind a tall image.
Accept: headline ≤ 4 lines at desktop; on mobile CTA visible within first viewport or
immediately after a ≤ 50vh image; media conveys product information.
Seen as (DNA signals): two sibling columns in the first viewport, one text-dominant,
one image/video-dominant; reflows to a single column on narrow widths.

### hero-demo-first — Demo-first hero
Job: Let the visitor try or watch the product immediately (code sample, live input,
playable embed).
Anatomy: (1) short claim *invariant*; (2) interactive or playing demo *invariant*;
(3) CTA to continue (sign up / install).
Measures: demo occupies ≥ 50% of first viewport area; demo interactive within ~3s on a
mid-range device or shows a static poster; install commands copyable with one click.
Use when: product value is best shown in action (developer tools, editors, AI tools).
Avoid when: the demo requires sign-in or long setup; performance budget can't afford it.
Variables: demo type (editor, terminal, embed, video), autoplay off/on (respect
reduced motion).
Failure modes: autoplaying video with no pause; fake "live" demo that is a canned
loop presented as real; prompt box that does nothing without sign-in and does not say so.
Accept: demo has visible pause/stop or is user-initiated; reduced-motion users get a
static frame; any canned/recorded demo is labelled as such.
Seen as (DNA signals): an input/editor/iframe/video element ≥ 50% of first viewport
area; a copy button near a monospace block.

### hero-editorial — Editorial hero
Job: Lead with an idea or story when there is no UI to show (brand, agency, content).
Anatomy: (1) large typographic statement *invariant*; (2) supporting paragraph;
(3) optional single image; (4) one CTA or scroll cue.
Measures: display size 3–6× body; measure 15–30ch for the statement; generous space
(≥ 2 large steps) above and below.
Use when: brand, publication, portfolio, mission-led pages.
Avoid when: visitors need to understand a software product's function quickly.
Variables: typeface, alignment, image presence.
Failure modes: statement says nothing specific (slop P1/P3); type so large it breaks
words at 320px.
Accept: no word breaks mid-word at 320px; statement is a falsifiable/specific claim.
Seen as (DNA signals): `h1` font-size ≥ 3× body occupying ≥ 40% of first viewport; few
or no images; single CTA.

### proof-strip — Logo / proof strip
Job: Show verifiable third-party evidence of use or credibility.
Anatomy: (1) short label stating what the evidence is ("Used in production at");
(2) 4–8 real marks or one real quote with name, role, organization *invariant
(must be real and permitted)*.
Measures: logos normalized to equal optical height (≈ 20–32px) and monochrome or
muted; one row at desktop, wrap to 2–3 rows on mobile (no horizontal autoscroll
without a pause control).
Use when: real, permitted proof exists.
Avoid when: no supplied proof — omit the section entirely; never generate, guess or
borrow logos/quotes.
Variables: logos vs quote vs case-study links; placement (after hero or before CTA).
Failure modes: fabricated or placeholder logos shipped; infinite marquee with no pause
(WCAG 2.2.2); stat band "10k+ users" with no source (slop L6).
Accept: every mark/quote traceable to a source the user provided; any motion pausable;
marks have accessible names.
Seen as (DNA signals): a row of 4–8 small images of similar height with low
saturation; or a blockquote with name + role.

### feature-zigzag — Alternating feature rows
Job: Explain 3–6 features, each needing a visual and a paragraph.
Anatomy: (1) row = text block + media *invariant*; (2) media side alternates
*invariant*; (3) consistent row anatomy.
Measures: 3–6 rows; text:media columns 5/7 or 6/6; vertical gap between rows ≥ 2 steps
larger than gap inside a row; stacks below ~900px with consistent order (media then
text, or text then media, never alternating on mobile).
Use when: each feature has a distinct real visual (screenshot crop, diagram).
Avoid when: > 6 features (use `feature-tabbed` or a spec list); features lack visuals.
Variables: starting side, media framing, inclusion of a small proof/stat per row.
Failure modes: identical stock illustrations per row; alternation continues on
mobile producing inconsistent order; rows of equal height regardless of content.
Accept: each media item is specific to its feature; mobile order identical across rows;
inter-row gap clearly larger than intra-row gap.
Seen as (DNA signals): ≥ 3 consecutive sections whose bounding boxes alternate media
left/right with text on the opposite side.

### feature-sticky-narrative — Sticky scroll narrative
Job: Walk through a sequence (steps of a workflow) while one visual updates in place.
Anatomy: (1) sticky visual panel *invariant*; (2) scrolling list of steps *invariant*;
(3) visual state changes as each step enters view.
Measures: 3–7 steps; sticky panel height 50–100vh; each step ≥ 40–60vh of scroll so the
change is perceivable; collapse to stacked step+image pairs below ~900px.
Use when: the steps share one visual context (same UI evolving).
Avoid when: steps are unrelated; content must be printable/skimmable; mobile-dominant
audience without a stacked fallback.
Variables: which side is sticky, transition type, progress indicator.
Failure modes: scroll-jacking (hijacking wheel speed); content unreachable without
scroll animation; visual and text out of sync; no reduced-motion fallback.
Accept: native scroll speed preserved; all step content readable with animations
disabled; mobile shows each step with its own image.
Seen as (DNA signals): sticky element height ≥ 50–60vh beside a scrolling sibling with
3–7 children; visual state changes keyed to scroll position.

### feature-tabbed — Tabbed feature showcase
Job: Present 3–6 parallel capabilities without making the page long.
Anatomy: (1) tab list *invariant*; (2) one panel visible at a time *invariant*;
(3) panel = visual + short text.
Measures: 3–6 tabs with labels ≤ 3 words; panels of similar height to avoid jumps;
below ~640px convert to an accordion or a horizontally scrollable tab list with visible
overflow cue.
Use when: features are parallel alternatives users explore by interest.
Avoid when: key content must be seen by everyone (hidden tabs get low views); sequence matters.
Variables: tab orientation, autoplay (only with pause control).
Failure modes: auto-rotating tabs with no pause; panels changing height and moving the
page; tabs not keyboard operable.
Accept: follows ARIA tabs pattern (arrow keys move between tabs); no auto-rotation
without pause; panel height change does not shift content below by > 1 step.
Seen as (DNA signals): `role="tablist"` with 3–6 tabs controlling one visible panel
containing an image.

### pricing-table — Pricing table
Job: Let buyers pick a plan and understand differences.
Anatomy: (1) plan columns with name, price, billing period, one-line audience
*invariant*; (2) one CTA per plan *invariant*; (3) key differences list; (4) optional
billing toggle; (5) optional full comparison table below; (6) FAQ.
Measures: 2–4 plans side by side (5+ becomes a comparison table); at most one
highlighted "recommended" plan; prices aligned on a shared baseline; 3–8 feature
bullets per plan; plans stack or become swipeable below ~900px with the recommended
plan first or clearly marked.
Use when: self-serve pricing with distinct tiers.
Avoid when: pricing is bespoke (use a contact CTA band); a single plan (use a simple
price block).
Variables: highlight treatment, annual/monthly default, enterprise column style.
Failure modes: invented prices or discounts; toggle that changes prices without saying
which period is shown; bullets that repeat across all plans so differences are hidden.
Accept: billing period explicit next to each price; differences between adjacent plans
identifiable in ≤ 3 bullets; at most one highlighted plan; prices come from the user.
Seen as (DNA signals): 2–4 sibling columns of equal width each containing a large
currency number and a button; one column with distinct border/background.

### faq-accordion — FAQ accordion
Job: Answer the questions blocking a decision without lengthening the page.
Anatomy: (1) question list *invariant*; (2) expandable answers *invariant*; (3) contact
fallback link.
Measures: 5–12 questions; questions phrased as the user would ask; answers ≤ ~80 words
or linked out; a single column ≤ 75ch.
Use when: real recurring objections exist (pricing, security, migration).
Avoid when: content is essential for everyone (put it in the page body).
Variables: one-open vs many-open, grouping by topic.
Failure modes: filler questions; using `<div>` toggles without button semantics.
Accept: each toggle is a `button` (or `details/summary`) with `aria-expanded`; questions
are findable by browser find (content not removed from DOM, or `hidden="until-found"`
where supported).
Seen as (DNA signals): 5–12 `details`/button-header pairs in one column; chevron icons.

### cta-band — Closing CTA band
Job: Give a final, single action after the evidence.
Anatomy: (1) one-line restated outcome *invariant*; (2) one primary CTA *invariant*;
(3) optional reassurance line (no card required, cancellation terms — only if true).
Measures: band height 200–400px at desktop; surface contrast distinct from neighbours;
one CTA (+ optional secondary text link).
Use when: closing a persuasive page.
Avoid when: repeated after every section (dilutes it).
Variables: background treatment, alignment.
Failure modes: generic copy ("Ready to get started?"); multiple competing buttons.
Accept: exactly one primary button; copy names the concrete outcome.
Seen as (DNA signals): full-width section near page end with distinct background,
short text, one button.

### site-footer — Site footer
Job: Provide secondary navigation, legal, contact and trust information.
Anatomy: (1) grouped link columns *invariant* on multi-page sites; (2) legal row
(copyright, privacy, terms) *invariant*; (3) optional newsletter/contact.
Measures: 2–5 link groups of ≤ 8 links; columns collapse to accordions or a single
list below ~640px; link targets ≥ 24×24 CSS px (WCAG 2.5.8).
Use when: any multi-page public site.
Avoid when: focused flows (auth/checkout) — use a minimal legal footer.
Variables: column count, inclusion of sitemap depth.
Failure modes: dead links; tiny low-contrast legal text; social icons without names.
Accept: all links resolve; text contrast ≥ 4.5:1; icon links have accessible names.
Seen as (DNA signals): `footer` landmark with 2–5 lists of links and a copyright line.
