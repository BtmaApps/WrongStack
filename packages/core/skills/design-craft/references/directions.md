# Directions — style vocabulary → kit

A **direction** is the one-word answer to "what kind of design is this?". People
name directions in style words ("make it brutalist", "glassmorphism", "swiss").
This file resolves that vocabulary to a kit, because a style word is not a design
system: it carries a look but no radius scale, no spacing rhythm, no type ramp,
no motion curve and no elevation steps. The kit carries all five.

**A direction is where the design starts, never where it ends.** Resolving to a
kit does not exempt anything from the brief's seven decisions or from the
foundations. "It's brutalist" is not an answer to "what is the focal point".

## Two words that are not directions

| Word | Why it isn't |
|---|---|
| "Dark mode" | Every kit ships light AND dark from one token set. Asking for dark mode is asking for a theme that already exists — it selects nothing. |
| "Light mode" | Same. |

If someone names one of these as the direction, ask what the product *is*; they
have given you a theme preference, not a direction.

## When no style word is given

Most briefs arrive in product language, not style language: "an operator console
for on-call engineers", "a booking flow for a clinic". There is nothing to
resolve, and scanning fifty aesthetic one-liners hoping one matches is the wrong
move.

Work from the live roster, not from memory:

1. `design {action:"list"}` — every entry carries a **Best for:** line written in
   product terms (audience, surface, domain), not aesthetic terms. That line is
   what you match against, not the aesthetic.
2. Shortlist by the brief's **archetype**. Three candidates, no more.
3. Apply the contrast rule below — any two of the three must differ on at least
   two axes. If they do not, replace one.
4. Offer each as a single line of brief plus the condition that makes it the right
   pick.

**Do not keep a private category map of the roster.** The kit list changes — it
went from 50 to 53 in one working session — and a frozen taxonomy is wrong the
moment it is written. The menu is the source of truth; this file only maps the
*vocabulary people speak* onto it.

## Resolution table

Left column is the style vocabulary people actually use. Right column is the kit
to pin with `design {action:"use", kit:"…", stack:"…"}`.

### Resolves directly

| Style word | Kit | Note |
|---|---|---|
| Glassmorphism, frosted glass | `soft-glass` | Sanctions the blur; see "sanctioned looks" below |
| Neumorphism, soft UI | `neumorphism` | Watch contrast — the look fights WCAG by nature |
| Brutalist, raw, anti-design | `neo-brutalist` | |
| Minimalist | `minimal-clarity` | |
| Modernize, contemporary, clean | `minimal-clarity` or `linear-dark` | Ask which register: calm-light or refined-dark |
| Corporate, professional, enterprise | `corporate-trust` | |
| Luxury, premium | `luxury-dark` (nighttime) or `luxury-serif` (editorial) | |
| Gradient accents, aurora | `aurora-gradient` | |
| Neon, cyberpunk | `cyberpunk-neon` | |
| Cyberpunk UI, HUD | `cyberpunk-neon` or `fintech-dark` | The second when it is real data, not decoration |
| Material Design | `material-expressive` | |
| Bento grid | `bento-dashboard` | |
| Swiss, international typographic | `swiss-grid` | |
| Bauhaus | `bauhaus` | |
| Memphis | `memphis-80s` | |
| Art deco | `art-deco` | |
| Comic book, pop art | `comic-pop` | |
| Vaporwave, synthwave | `vaporwave` | |
| Blueprint, technical | `tech-blueprint` | |
| Newspaper, editorial | `newspaper-print` (broadsheet) or `editorial` (magazine) | |
| Monochrome | `monochrome` | |
| Pastel | `pastel-dream` | |
| Claymorphism | `claymorphism` | |
| Retro, vintage | `retro-70s` | |
| Tech, developer, terminal | `dark-pro` or `retro-terminal` | The second only when CRT nostalgia is wanted |
| Scandinavian, nordic, hygge | `scandinavian` or `japandi` | |
| Organic, natural, earthy | `warm-organic` | |
| Playful, colorful | `playful-rounded` (warm) · `dopamine-pop` (loud) · `kids-bright` (children) | Three different registers — pick deliberately |
| Kawaii, cute | `kids-bright` or `pastel-dream` | |
| Y2K, millennium | `dopamine-pop` · `frutiger-aero` · `holographic` | |
| Gothic, dark academia | `dark-academia` | |
| Noir, film noir | `nordic-noir` or `monochrome` | |
| Geometric abstract | `bauhaus` or `memphis-80s` | |
| Rustic, farmhouse, handcrafted, indie | `cottagecore` | |
| Space, cosmic | `aurora-gradient` | Closest available; the nebula motif is yours to add |
| Skeuomorphic, steampunk, textured | `skeuomorphic` | |
| Flat design | `flat-design` | Not `minimal-clarity` with shadows off: minimal separates with whitespace and hairlines, flat with filled areas that touch |
| Pixel art, 8-bit | `pixel-8bit` | Pixel *graphics* — distinct from `retro-terminal`, which is phosphor *text* |
| Grunge, distressed, zine | `grunge-press` | Worn and dirty — distinct from `neo-brutalist`, which is clean and hard |

### No kit — say so, then choose

These style words have no kit. Do not silently pin the nearest one: name the gap,
then pin the closest kit and layer the motif with `design {action:"set"}` and
explicit component decisions.

| Style word | Closest kit | What you must add yourself |
|---|---|---|
| Duotone | `monochrome` + `set` two brand hues | Blend modes on imagery |
| Isometric / 3D | any + explicit spec | Projection, shading, layer order |
| Stained glass | `comic-pop` | Heavy outlines, jewel fills |
| Watercolor, painted | `cottagecore` | Bleeding edges, paper grain |
| Chalkboard | `retro-terminal` inverted, or `e-ink` | Chalk texture, hand-drawn stroke |
| Paper craft, origami | `scandinavian` | Fold lines, layered cut-outs |
| Tropical, paradise | `warm-organic` + `set` turquoise/coral | Motif illustration |
| Underwater, ocean | `aurora-gradient` + `set` ocean hues | Caustics, buoyancy in motion |

### Directions the style vocabulary is missing

The kit roster is stronger than the style vocabulary in product territory. When
the product is one of these, do not force it into a decorative style word:

`e-ink` · `fintech-dark` · `grid-poster` · `health-calm` · `ios-native` ·
`japandi` · `liquid-metal` · `maximalist` · `notion-docs` · `solarpunk` ·
`corporate-memphis` · `wireframe-lofi`

Run `design {action:"list"}` — the roster changes, and this file is a map, not
the territory.

## Sanctioned looks — the one exception the slop inventory makes

The inventory bans glassmorphism, decorative gradients, neon glow and heavy
blobs **as defaults**. They are banned as the unconsidered reflex, not as
aesthetics. Pinning `soft-glass`, `aurora-gradient`, `holographic` or
`cyberpunk-neon` is exactly the deliberate choice that makes them legitimate —
and it is why the `composition` axis was built kit-independent: it never fires on
a kit's own signature look, only on the patterns that are drift under every kit.

Write the choice in the brief. A glass panel under `soft-glass` is a decision; a
glass panel under `corporate-trust` is a reflex.

## Generating variants — three directions, not three neighbours

When the ask is "show me some options", the failure mode is three versions of the
same idea. Force contrast along named axes:

| Axis | Poles |
|---|---|
| Chroma | near-neutral ←→ saturated |
| Era | contemporary ←→ period |
| Decoration | structural ←→ ornamental |
| Density | compact ←→ generous |
| Register | clinical ←→ warm |

**Rule: any two proposed directions must differ on at least two axes.**
`minimal-clarity` / `linear-dark` / `notion-docs` is one option offered three
times. `swiss-grid` (structural, neutral, compact) / `warm-organic` (ornamental,
warm, generous) / `fintech-dark` (clinical, saturated, dense) is a real choice.

For each variant produce one line of brief, not a mood board:

```
A — swiss-grid · structural, neutral, compact
    The grid is the product: strict columns, one red accent, no decoration.
    Best if the content is dense and the audience is professional.

B — warm-organic · ornamental, warm, generous
    Terracotta and sage, soft shapes, generous rhythm.
    Best if the product wants to feel human before it feels efficient.

C — fintech-dark · clinical, saturated, dense
    Dark ground, data first, semantic green/red, charts as the hero.
    Best if numbers are the reason anyone opens this.
```

Then the user picks one, it goes in `.design/brief.md`, and the normal loop runs.
Do not build three real screens to decide a direction — that is expensive and it
still does not answer the seven decisions.
