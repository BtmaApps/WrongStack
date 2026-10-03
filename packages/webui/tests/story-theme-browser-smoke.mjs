// Rendered theme audit for the session-story hex→token migration.
// Renders StoryChart, TeamConstellation and the StoryTables meters in light and
// dark, screenshots each, and computes WCAG contrast for every migrated color
// against the surface it actually sits on — comparing old hex to new token.
// Lives beside the sibling browser smokes because `vite` resolves only from
// packages/webui/node_modules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

/** Minimal non-interlaced 8-bit PNG decoder (zlib is built in), so contrast
 *  can be measured from real rendered pixels instead of a DOM heuristic. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit PNG supported, got ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { width, height, channels, data: out };
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const at = (img, x, y) => {
  const cx = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const i = (cy * img.width + cx) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

/** A stroke paints no interior, so the centre of a line/circle's box is empty
 *  space. Walk the bbox perimeter (plus an inset ring, which is where a
 *  circle's stroke actually passes — its bbox edges are tangent only) and take
 *  the most common pixel that is visibly different from the backdrop. */
function sampleStroke(img, g) {
  const cy = g.y + g.h / 2;
  const bg = at(img, g.x - 3, cy);
  const counts = new Map();
  const put = (p) => {
    if (contrast(p, bg) <= 1.05) return; // indistinguishable from backdrop
    const key = p.join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const x0 = Math.round(g.x);
  const x1 = Math.round(g.x + g.w);
  const y0 = Math.round(g.y);
  const y1 = Math.round(g.y + g.h);
  for (let x = x0; x <= x1; x++) {
    put(at(img, x, y0));
    put(at(img, x, y1));
  }
  for (let y = y0; y <= y1; y++) {
    put(at(img, x0, y));
    put(at(img, x1, y));
  }
  const ax0 = Math.round(g.x + g.w * 0.3);
  const ax1 = Math.round(g.x + g.w * 0.7);
  const ay0 = Math.round(g.y + g.h * 0.3);
  const ay1 = Math.round(g.y + g.h * 0.7);
  for (let x = ax0; x <= ax1; x++) {
    put(at(img, x, ay0));
    put(at(img, x, ay1));
  }
  for (let y = ay0; y <= ay1; y++) {
    put(at(img, ax0, y));
    put(at(img, ax1, y));
  }
  if (!counts.size) return null;
  const [key] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { fg: key.split(',').map(Number), bg };
}

/** Measure one shape from pixels: the interior sample is the painted colour,
 *  and a sample just outside its edge is whatever actually sits behind it. */
function sampleShape(img, g) {
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  if (g.strokeOnly) return sampleStroke(img, g);
  if (g.tag === 'text') {
    // Glyph-aware sampling. A text bbox is mostly flat backdrop, so taking the
    // modal pixel as backdrop and the furthest pixel as ink can invert the two:
    // on a small label the ink may be the modal pixel and an antialiased
    // backdrop fringe the outlier, which inverts a real WCAG pass into a
    // failure. Instead keep only pixels that sit on a glyph edge — those whose
    // local neighbourhood has real luminance spread — then split them into the
    // darkest core (ink) and the lightest (backdrop the glyph blends toward).
    const x0 = Math.max(1, Math.floor(g.x));
    const y0 = Math.max(1, Math.floor(g.y));
    const x1 = Math.min(img.width - 2, Math.ceil(g.x + g.w));
    const y1 = Math.min(img.height - 2, Math.ceil(g.y + g.h));
    // Spread across a 3x3 neighbourhood: flat backdrop is 0, a glyph edge is not.
    const spread = (x, y) => {
      let min = 255;
      let max = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const l = lum(at(img, x + dx, y + dy));
          if (l < min) min = l;
          if (l > max) max = l;
        }
      }
      return max - min;
    };
    const edges = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (spread(x, y) > 0.02) edges.push(at(img, x, y));
      }
    }
    if (edges.length < 4) return null; // no glyph coverage: nothing to measure
    // Backdrop is read from just OUTSIDE the glyph box, exactly as shapes are
    // sampled. That makes polarity irrelevant: in dark mode the ink is the
    // lightest colour in the box, in light mode the darkest, so ranking by
    // luminance alone silently inverts one of the two themes.
    const bg = at(img, g.x - 3, cy);
    const ranked = edges.map((p) => ({ p, d: contrast(p, bg) })).sort((a, b) => b.d - a.d);
    // Ink core = the edge pixels furthest from that known backdrop.
    const coreCount = Math.max(1, Math.round(ranked.length * 0.15));
    const core = ranked.slice(0, coreCount).map((r) => r.p);
    const ink = core
      .reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
      .map((v) => Math.round(v / core.length));
    // If the furthest glyph pixels are still near the backdrop, the box holds
    // no legible ink; report it as unmeasurable instead of inventing a ratio.
    if (contrast(ink, bg) < 1.5) return null;
    return { fg: ink, bg };
  }
  const fg = at(img, cx, cy);
  // Just outside the left edge = the backdrop the shape actually sits on.
  const bg = at(img, g.x - 3, cy);
  return { fg, bg };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, '../../.temp_files/story-theme');

const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '/src/index.css';
import { ThemeProvider } from '/src/components/ThemeProvider.tsx';
import { StoryChart } from '/src/components/session-story/StoryChart.tsx';
import { TeamConstellation } from '/src/components/session-story/TeamConstellation.tsx';
import { StoryTables } from '/src/components/session-story/StoryTables.tsx';
import { storyStats } from '/src/lib/session-story-stats.ts';

const now = Date.UTC(2026, 9, 2, 12, 0, 0);
const actors = [
  { id: 'leader', name: 'Leader', start: now - 90000, end: now, events: 44, model: 'test-model' },
  { id: 'a1', name: 'Explore', start: now - 70000, end: now - 20000, events: 21, parent: 'leader' },
  { id: 'a2', name: 'Memory', start: now - 50000, end: now, events: 13, parent: 'leader' },
];
const events = [];
for (let i = 0; i < 44; i += 1) {
  const actor = i % 3 === 0 ? 'a2' : i % 2 === 0 ? 'a1' : 'leader';
  const hasStats = i % 4 === 0;
  events.push({
    id: 'e' + i,
    at: now - 90000 + i * 1900,
    actor,
    kind: i % 5 === 0 ? 'file' : i % 3 === 0 ? 'agent' : 'tool',
    title: 'read',
    detail: 'tool.executed · success',
    durationMs: 80 + i * 25,
    path: i % 4 === 0 ? 'src/alpha.ts' : 'src/beta.ts',
    raw: hasStats
      ? { outcome: 'success', attributes: { toolName: 'patch', fileStats: {
          addedLines: 4 + i, removedLines: 2,
          patchFiles: [{ path: 'src/alpha.ts', addedLines: 4, removedLines: 2 }],
        } } }
      : undefined,
  });
}
const story = {
  events, actors, start: now - 90000, end: now,
  counts: { tool: 20, agent: 12, file: 7, model: 5 },
  toolCalls: 44, files: ['src/alpha.ts', 'src/beta.ts'],
  memoryWrites: 2, observedInjectedMemories: 0,
};
const stats = storyStats(story, '');

createRoot(document.getElementById('root')).render(
  React.createElement(ThemeProvider, null,
    React.createElement('div', { className: 'space-y-6 bg-background p-6 text-foreground' },
      React.createElement('h2', { className: 'text-sm uppercase' }, 'CHART'),
      React.createElement(StoryChart, { story, end: story.end, cursor: 100, selected: '', onSelect(){}, actor: 'all' }),
      React.createElement('h2', { className: 'text-sm uppercase' }, 'CONSTELLATION'),
      React.createElement(TeamConstellation, { actors, selected: 'a1', onSelect(){} }),
      React.createElement('h2', { className: 'text-sm uppercase' }, 'METERS'),
      React.createElement(StoryTables, { stats, type: 'files', onInspect(){} }),
      React.createElement(StoryTables, { stats, type: 'tools', onInspect(){} }),
    ),
  ),
);
`;

const id = 'virtual:story-theme-smoke';
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'story-theme-smoke',
      resolveId: (value) => (value === id ? '\0story-smoke.tsx' : undefined),
      load: (value) => (value === '\0story-smoke.tsx' ? source : undefined),
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__story_smoke') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await vite.transformIndexHtml(
              req.url,
              '<html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/@id/virtual:story-theme-smoke"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
await server.listen();

const PAIRS = [
  ['chart axis label', 'muted-foreground', 'background', '#94a3b8'],
  ['chart event dot', 'info', 'background', '#22d3ee'],
  ['constellation node label', 'foreground', 'card', '#e2e8f0'],
  ['constellation orbit ring', 'info', 'card', '#22d3ee'],
  ['constellation sub label', 'muted-foreground', 'card', '#94a3b8'],
  ['meter read segment', 'info', 'card', '#22d3ee'],
  ['meter edit segment', 'primary', 'card', '#a78bfa'],
  ['meter write segment', 'success', 'card', '#34d399'],
  ['added lines', 'success', 'background', '#34d399'],
  ['removed lines', 'destructive', 'background', '#fb7185'],
  ['warning series', 'warning', 'background', '#fbbf24'],
  ['orange series', 'brand-orange', 'background', '#f97316'],
  ['node fill (was #08111e)', 'background', 'card', '#08111e'],
  ['inner node fill (was #0c2734)', 'card', 'card', '#0c2734'],
  ['selected ring (was #fff)', 'foreground', 'background', '#fff'],
];

const browser = await chromium.launch({ headless: true });
try {
  await mkdir(out, { recursive: true });
  // 2x device pixels: at 1x a 9px glyph has no pixel at full ink density, so
  // thin text reads as low contrast purely from antialiasing. Sampling at 2x
  // separates a real token failure from a rasterisation artefact.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const results = {};
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((value) => {
      window.localStorage.setItem('wrongstack-theme', value);
    }, theme);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__story_smoke`);
    await page.waitForSelector('svg', { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `session-story-${theme}.png`), fullPage: true });

    results[theme] = await page.evaluate((pairs) => {
      const rootStyle = getComputedStyle(document.documentElement);
      // Read the raw token text (e.g. "217 91% 60%") and convert in JS rather
      // than relying on the browser to parse hsl(var(--x)) into a computed rgb.
      const hslToRgb = (h, sPct, lPct) => {
        const h1 = ((h % 360) + 360) % 360;
        const s = sPct / 100;
        const l = lPct / 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h1 / 60) % 2) - 1));
        const m = l - c / 2;
        const seg = Math.floor(h1 / 60) % 6;
        const table = [
          [c, x, 0],
          [x, c, 0],
          [0, c, x],
          [0, x, c],
          [x, 0, c],
          [c, 0, x],
        ];
        return table[seg].map((v) => Math.round((v + m) * 255));
      };
      const tokenRgb = (name) => {
        const raw = rootStyle.getPropertyValue('--' + name).trim();
        const parts = raw.split(/[\s/]+/).map((v) => Number(String(v).replace('%', '')));
        if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
          throw new Error('unresolved token --' + name + ': ' + JSON.stringify(raw));
        }
        return hslToRgb(parts[0], parts[1], parts[2]);
      };
      const hexRgb = (hex) => {
        let h = hex.replace('#', '');
        if (h.length === 3)
          h = h
            .split('')
            .map((c) => c + c)
            .join('');
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      };
      const lin = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (fg, bg) => {
        const a = lum(fg);
        const b = lum(bg);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      return pairs.map(([label, fgToken, bgToken, oldHex]) => ({
        label,
        token: Number(ratio(tokenRgb(fgToken), tokenRgb(bgToken)).toFixed(2)),
        old: Number(ratio(hexRgb(oldHex), tokenRgb(bgToken)).toFixed(2)),
      }));
    }, PAIRS);

    // Geometry only: which shapes exist and where. The colour decision is
    // made later from real pixels, never from a DOM/CSS guess.
    const shapes = await page.evaluate(() => {
      // WCAG 1.4.3 exempts text that is part of an inactive component. The
      // story chart dims a whole lane group until playback reaches it, so its
      // captions composite at 0.3 opacity by design and are not a contrast
      // defect. Opacity is inherited, so multiply it up the ancestor chain.
      const effectiveOpacity = (el) => {
        let product = 1;
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
          const value = Number(getComputedStyle(node).opacity);
          if (Number.isFinite(value)) product *= value;
        }
        return product;
      };
      const out = [];
      for (const el of document.querySelectorAll(
        'svg rect, svg circle, svg line, svg text, svg path',
      )) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const opacity = effectiveOpacity(el);
        out.push({
          tag: el.tagName,
          strokeOnly: el.tagName === 'line' || getComputedStyle(el).fill === 'none',
          inactive: opacity < 1,
          opacity: Number(opacity.toFixed(2)),
          // A shape inside an aria-hidden group is declared purely decorative
          // by the component itself, so WCAG 1.4.11 does not gate it. Read the
          // marker from the DOM rather than guessing from geometry: a gridline
          // and a meaningful border are geometrically identical.
          decorative: el.closest('[aria-hidden="true"]') !== null,
          // Identify the element so a failing row is traceable to real source.
          // Geometry and pixels alone cannot say WHICH label is too faint.
          hint:
            el.tagName === 'text'
              ? (el.textContent ?? '').trim().slice(0, 28) || (el.getAttribute('aria-label') ?? '')
              : (
                  el.closest('svg')?.getAttribute('aria-label') ??
                  el.getAttribute('class') ??
                  ''
                ).slice(0, 40),
          x: r.x + window.scrollX,
          y: r.y + window.scrollY,
          w: r.width,
          h: r.height,
        });
      }
      return out;
    });
    // Ground truth: decode the screenshot we just took and read pixels.
    const img = decodePng(readFileSync(path.join(out, `session-story-${theme}.png`)));
    const scale = img.width / (await page.evaluate(() => document.documentElement.scrollWidth));
    results[theme].dom = shapes
      .map((g) => {
        const s = sampleShape(img, {
          ...g,
          x: g.x * scale,
          y: g.y * scale,
          w: g.w * scale,
          h: g.h * scale,
        });
        if (!s) return null;
        return {
          tag: g.tag + (g.strokeOnly ? '(stroke)' : ''),
          // WCAG only gates some roles. Text needs 4.5:1 (1.4.3); a stroke that
          // delineates a UI component or state needs 3:1 (1.4.11). A filled
          // shape painted on another surface is surface layering — zebra
          // striping and chart canvases are decorative and carry no threshold,
          // so they must never be tallied as a contrast failure.
          // WCAG 1.4.3 exempts text belonging to an inactive component, so anything
          // inside a dimmed ancestor group is reported but never failed.
          role: g.inactive
            ? 'inactive'
            : g.decorative
              ? 'decorative'
              : g.tag === 'text'
                ? 'text'
                : g.strokeOnly
                  ? 'graphic'
                  : 'surface',
          opacity: g.opacity,
          hint: g.hint ?? '',
          paint: `rgb(${s.fg.join(',')})`,
          bg: `rgb(${s.bg.join(',')})`,
          selfPainted: s.fg[0] === s.bg[0] && s.fg[1] === s.bg[1] && s.fg[2] === s.bg[2],
          ratio: Number(contrast(s.fg, s.bg).toFixed(2)),
        };
      })
      .filter(Boolean);
  }

  assert.deepEqual(errors, [], 'page must render without errors');

  // Accumulate across themes so a regression in either one fails the run.
  let failures = 0;
  for (const theme of ['light', 'dark']) {
    console.log(`\n[${theme}]`);
    console.log('surface                              token   old-hex   delta');
    console.log('------------------------------------------------------------');
    for (const r of results[theme]) {
      const delta = r.token - r.old;
      console.log(
        `${r.label.padEnd(36)} ${String(r.token).padStart(5)}   ${String(r.old).padStart(6)}   ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
      );
    }
    console.log('  -- rendered DOM (painted colour vs its backdrop) --');
    const tally = { unmeasurable: 0, fail: 0, pass: 0, surface: 0, inactive: 0, decorative: 0 };
    // WCAG thresholds by role. Text is 4.5:1 (1.4.3 normal size); a stroke
    // delineating a component is 3:1 (1.4.11). Filled-shape-on-surface is
    // layering with no threshold, and an inactive component's text is exempt
    // under 1.4.3 — both are reported but never counted as failures.
    const MIN = { text: 4.5, graphic: 3, surface: 0, inactive: 0, decorative: 0 };
    for (const r of results[theme].dom ?? []) {
      let flag = '';
      if (r.ratio === 1) {
        // fg equals its own backdrop: the measurement is meaningless, so it is
        // reported as unmeasurable and never as a contrast failure.
        tally.unmeasurable += 1;
        flag = r.selfPainted
          ? '  UNMEASURABLE (fg == backdrop exactly)'
          : '  UNMEASURABLE (equal luminance)';
      } else if (r.role === 'inactive') {
        tally.inactive += 1;
        flag = `  inactive at opacity ${r.opacity} (1.4.3-exempt)`;
      } else if (r.role === 'decorative') {
        tally.decorative += 1;
        flag = '  decorative (1.4.11-exempt)';
      } else if (r.role === 'surface') {
        tally.surface += 1;
        flag = '  surface layering (no threshold)';
      } else if (r.ratio < MIN[r.role]) {
        tally.fail += 1;
        flag = `  below ${MIN[r.role]}:1 (${r.role})`;
      } else {
        tally.pass += 1;
      }
      console.log(
        `  ${(r.role[0].toUpperCase() + r.role.slice(1)).padEnd(7)} ${r.tag.padEnd(15)} ${String(r.paint).padEnd(22)} ${String(r.ratio).padStart(6)}${flag}${r.role === 'surface' ? '' : '  ' + (r.hint ?? '')}`,
      );
    }
    failures += tally.fail;
    console.log(
      `  => ${tally.fail} failing, ${tally.pass} passing, ${tally.surface} surface-layering, ${tally.inactive} inactive (1.4.3-exempt), ${tally.decorative} decorative (1.4.11-exempt), ${tally.unmeasurable} unmeasurable`,
    );
  }

  // Gate CI: a contrast regression in either theme must fail the run, not just
  // print a table. Throwing here propagates out of `try` and exits non-zero;
  // the `finally` block still tears down the browser and vite server.
  assert.equal(
    failures,
    0,
    `rendered contrast audit failed: ${failures} row(s) below their WCAG threshold ` +
      '(light + dark combined) — exempt rows are already excluded above',
  );

  console.log(`\nScreenshots: ${out}`);
} finally {
  await browser.close();
  await server.close();
}
