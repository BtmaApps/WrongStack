/**
 * Design DNA — the in-page measurement script.
 *
 * Evaluated inside a real browser page (Playwright `page.evaluate`) at one
 * viewport. It MEASURES what a person would otherwise eyeball: rendered type,
 * visible color area, spacing values, radii, shadows, motion timings, section
 * rhythm and component geometry. Everything is a count or a pixel value read
 * from computed style or layout — no judgement happens here; `design-dna.ts`
 * summarizes the raw numbers node-side, where it can be unit-tested.
 *
 * Kept as a plain JS string (not a serialized TS function) on purpose: a
 * bundler may rename identifiers or inject helpers into a compiled function,
 * and `fn.toString()` would then ship code that does not exist in the page.
 * Constraints: no template literals / `${` inside (this is a template
 * string), ES2020 only, ≤ 16 KiB so `browser_evaluate` can run it verbatim,
 * and a bounded result (every map is truncated to its top entries).
 *
 * Visible color is sampled, not summed from the DOM: a grid of points per
 * screen walks `elementsFromPoint` top-down and composites translucent layers,
 * so a full-bleed wrapper hidden under a card grid does not outvote the cards.
 */
export const DESIGN_DNA_EXTRACTOR = String.raw`(async () => {
  var MAX_SCREENS = 8, GX = 24, GY = 14, MAX_EL = 6000, TOP = 32;
  var W = innerWidth, H = innerHeight, D = document, de = D.documentElement;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var inc = function (m, k, n) { if (k === null || k === undefined || k === '') return; m[k] = (m[k] || 0) + (n === undefined ? 1 : n); };
  var px = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var top = function (m, n) { return Object.keys(m).map(function (k) { return [k, Math.round(m[k] * 100) / 100]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n || TOP); };
  if (D.readyState !== 'complete') await Promise.race([new Promise(function (r) { addEventListener('load', r, { once: true }); }), sleep(6000)]);
  try { await Promise.race([D.fonts.ready, sleep(3000)]); } catch (e) {}
  var cv = D.createElement('canvas'); cv.width = cv.height = 1;
  var cx = cv.getContext('2d', { willReadFrequently: true });
  var cache = {};
  var rgba = function (c) {
    if (!c) return null;
    if (cache[c]) return cache[c];
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    var d = cx.getImageData(0, 0, 1, 1).data;
    var v = [d[0], d[1], d[2], d[3] / 255];
    cache[c] = v; return v;
  };
  var hex = function (v) { return '#' + [v[0], v[1], v[2]].map(function (n) { return (n | 0).toString(16).padStart(2, '0'); }).join(''); };
  var colorKey = function (c) { var v = rgba(c); if (!v || v[3] < 0.05) return null; return hex(v) + (v[3] < 0.98 ? '/' + Math.round(v[3] * 100) : ''); };
  var fam = function (f) { return (f || '').split(',')[0].trim().replace(/^["']|["']$/g, ''); };
  var isMedia = function (el) { var t = el.tagName; return t === 'IMG' || t === 'VIDEO' || t === 'CANVAS' || t === 'PICTURE' || t === 'IFRAME' || (t === 'svg' && el.getBoundingClientRect().width > 64); };

  // 1. Visible color area by point sampling across the page.
  var docH = Math.max(de.scrollHeight, D.body ? D.body.scrollHeight : 0);
  var screens = Math.max(1, Math.min(MAX_SCREENS, Math.ceil(docH / H)));
  var area = {}, gradientPts = 0, mediaPts = 0, pts = 0;
  var startY = scrollY, covered = 0;
  for (var s = 0; s < screens; s++) {
    scrollTo(0, s * H); await sleep(160);
    // The last screen clamps at the page end; skip the rows already sampled.
    var at = scrollY;
    for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++) {
      var x = (gx + 0.5) * W / GX, y = (gy + 0.5) * H / GY;
      if (at + y < covered) continue;
      var stack = D.elementsFromPoint(x, y); pts++;
      var layers = [], kind = null;
      for (var i = 0; i < stack.length; i++) {
        var el = stack[i];
        if (isMedia(el)) { kind = 'media'; break; }
        var cs = getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') { kind = /gradient/.test(cs.backgroundImage) ? 'gradient' : 'media'; break; }
        var v = rgba(cs.backgroundColor);
        if (v && v[3] > 0.02) { layers.push(v); if (v[3] > 0.98) break; }
      }
      if (kind === 'media') { mediaPts++; continue; }
      if (kind === 'gradient') { gradientPts++; continue; }
      var base = [255, 255, 255];
      for (var j = layers.length - 1; j >= 0; j--) { var L = layers[j], a = L[3]; base = [L[0] * a + base[0] * (1 - a), L[1] * a + base[1] * (1 - a), L[2] * a + base[2] * (1 - a)]; }
      inc(area, hex(base));
    }
    covered = at + H;
  }
  scrollTo(0, startY); await sleep(60);

  // 2. One bounded pass over rendered elements.
  var text = {}, textColor = {}, families = {}, pad = {}, gap = {}, vmargin = {}, radius = {}, shadow = {}, borderW = {}, borderColor = {};
  var dur = {}, ease = {}, gradients = {}, effects = { backdrop: 0, blur: 0, clipText: 0, blend: 0, animated: 0, sticky: 0, fixed: 0 };
  var grids = [], buttons = [], inputs = [], icons = {}, images = 0, imgRatios = {}, footChars = 0;
  var els = D.body ? D.body.getElementsByTagName('*') : [];
  var n = Math.min(els.length, MAX_EL);
  for (var k = 0; k < n; k++) {
    var e = els[k], c = getComputedStyle(e);
    if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) continue;
    var r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    var tag = e.tagName.toLowerCase();
    var own = 0;
    for (var cn = e.firstChild; cn; cn = cn.nextSibling) if (cn.nodeType === 3) own += cn.data.trim().length;
    // Footer legal/directory text can outweigh the page's real body copy.
    if (own > 0 && e.closest('footer, [role=contentinfo]')) { footChars += own; own = 0; }
    if (own > 0) {
      var fs = r1(px(c.fontSize)), lh = c.lineHeight === 'normal' ? r1(fs * 1.2) : r1(px(c.lineHeight));
      var key = [fs, c.fontWeight, lh, r1(px(c.letterSpacing)), fam(c.fontFamily), c.textTransform === 'none' ? '' : c.textTransform, tag].join('|');
      inc(text, key, own); inc(textColor, colorKey(c.color), own); inc(families, fam(c.fontFamily), own);
    }
    if (r.width * r.height > 400) {
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(function (p) { var v = r1(px(c[p])); if (v > 0) inc(pad, v); });
      ['marginTop', 'marginBottom'].forEach(function (p) { var v = r1(px(c[p])); if (v > 0 && v <= 256) inc(vmargin, v); });
    }
    if (/flex|grid/.test(c.display)) {
      var rg = r1(px(c.rowGap)), cg = r1(px(c.columnGap));
      if (rg > 0) inc(gap, rg); if (cg > 0 && cg !== rg) inc(gap, cg);
    }
    if (/grid/.test(c.display) && e.children.length >= 2) {
      var cols = c.gridTemplateColumns === 'none' ? 1 : c.gridTemplateColumns.split(' ').filter(function (t) { return /px/.test(t); }).length;
      grids.push([cols, r1(px(c.columnGap)), e.children.length, Math.round(r.width), Math.round(r.top + scrollY)]);
    }
    var hasBox = rgba(c.backgroundColor)[3] > 0.05 || px(c.borderTopWidth) > 0 || c.boxShadow !== 'none' || isMedia(e);
    var rad = px(c.borderTopLeftRadius);
    if (rad > 0 && hasBox) inc(radius, rad >= Math.min(r.width, r.height) / 2 - 0.5 ? 'full' : r1(rad));
    if (c.boxShadow !== 'none') inc(shadow, c.boxShadow.slice(0, 120));
    if (px(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none') { inc(borderW, r1(px(c.borderTopWidth))); inc(borderColor, colorKey(c.borderTopColor)); }
    if (/gradient/.test(c.backgroundImage)) inc(gradients, c.backgroundImage.slice(0, 60).replace(/\(.*/, ''));
    if (c.backdropFilter && c.backdropFilter !== 'none') effects.backdrop++;
    if (/blur/.test(c.filter)) effects.blur++;
    if (c.webkitBackgroundClip === 'text' || c.backgroundClip === 'text') effects.clipText++;
    if (c.mixBlendMode !== 'normal') effects.blend++;
    if (c.position === 'sticky') effects.sticky++;
    if (c.position === 'fixed') effects.fixed++;
    if (c.animationName && c.animationName !== 'none') effects.animated++;
    c.transitionDuration.split(',').forEach(function (d, i) {
      var ms = /ms$/.test(d.trim()) ? px(d) : px(d) * 1000;
      if (ms > 0) { inc(dur, Math.round(ms)); inc(ease, (c.transitionTimingFunction.split(/,(?![^(]*\))/)[i] || '').trim()); }
    });
    if (tag === 'img' || tag === 'video' || tag === 'picture') { images++; if (r.width > 160) inc(imgRatios, r1(r.width / r.height)); }
    if (tag === 'svg' && r.width <= 48) inc(icons, Math.round(r.width));
    var clickable = tag === 'button' || e.getAttribute('role') === 'button' || (tag === 'a' && (rgba(c.backgroundColor)[3] > 0.5 || px(c.borderTopWidth) > 0)) || (tag === 'input' && /submit|button/.test(e.type));
    if (clickable && r.height >= 24 && r.height <= 80 && r.width <= 480 && buttons.length < 120) {
      buttons.push({ h: r1(r.height), w: r1(r.width), padX: r1(px(c.paddingLeft)), r: rad >= r.height / 2 - 0.5 ? 'full' : r1(rad), bg: colorKey(c.backgroundColor), fg: colorKey(c.color), border: px(c.borderTopWidth) > 0 ? colorKey(c.borderTopColor) : null, fw: c.fontWeight, fs: r1(px(c.fontSize)), tt: c.textTransform, y: Math.round(r.top + scrollY) });
    }
    if ((tag === 'input' && !/submit|button|checkbox|radio|hidden|range|color|file/.test(e.type)) || tag === 'select' || tag === 'textarea') {
      if (inputs.length < 12) inputs.push({ h: r1(r.height), r: r1(rad), bg: colorKey(c.backgroundColor), border: colorKey(c.borderTopColor), bw: r1(px(c.borderTopWidth)), fs: r1(px(c.fontSize)) });
    }
  }

  // 3. Page sections: descend through single wrappers, expand tall containers.
  var vis = function (el) { var rr = el.getBoundingClientRect(); var cc = getComputedStyle(el); return rr.height > 24 && rr.width > W * 0.5 && cc.display !== 'none' && cc.position !== 'fixed'; };
  var kids = function (el) { return Array.prototype.filter.call(el.children, vis); };
  var list = D.body ? kids(D.body) : [];
  for (var pass = 0; pass < 10; pass++) {
    var next = [], changed = false;
    list.forEach(function (el) {
      var kk = kids(el), h = el.getBoundingClientRect().height, tg = el.tagName;
      var blocky = kk.filter(function (q) { return q.getBoundingClientRect().height >= 80; }).length * 2 >= kk.length;
      var leaf = /^(FOOTER|NAV|HEADER|UL|OL|LI|P|A|H[1-6]|FORM|TABLE)$/.test(tg);
      if (kk.length >= 2 && blocky && !leaf && (tg === 'MAIN' || h > docH * 0.45)) { next = next.concat(kk); changed = true; } else if (kk.length === 1 && h > H * 0.5) { next.push(kk[0]); changed = true; } else next.push(el); });
    list = next; if (!changed) break;
  }
  var sections = list.slice(0, 40).map(function (el) {
    var rr = el.getBoundingClientRect(), cc = getComputedStyle(el);
    var rows = {}, maxCols = 1, inner = el, guard = 0;
    while (inner.children.length === 1 && guard++ < 6) inner = inner.children[0];
    Array.prototype.forEach.call(inner.children, function (ch) { var q = ch.getBoundingClientRect(); if (q.width > 40 && q.height > 20) { var rk = Math.round(q.top / 12); rows[rk] = (rows[rk] || 0) + 1; if (rows[rk] > maxCols) maxCols = rows[rk]; } });
    var media = null, best = 0;
    Array.prototype.forEach.call(el.querySelectorAll('img,video,canvas,picture,svg'), function (m) { var q = m.getBoundingClientRect(); var a = q.width * q.height; if (a > best && a > rr.width * rr.height * 0.12) { best = a; var mid = q.left + q.width / 2; media = q.width > W * 0.8 ? 'full' : mid < W * 0.42 ? 'left' : mid > W * 0.58 ? 'right' : 'center'; } });
    var cw = 0;
    Array.prototype.forEach.call(el.querySelectorAll('*'), function (d) { if (cw && d.children.length === 0) return; var q = d.getBoundingClientRect(); var lg = q.left, rgp = W - q.right; if (q.width > cw && q.width < W - 16 && lg > 8 && Math.abs(lg - rgp) <= 2 && q.height > 40) cw = q.width; });
    var hd = el.querySelector('h1,h2,h3');
    return { tag: el.tagName.toLowerCase(), y: Math.round(rr.top + scrollY), h: Math.round(rr.height), bg: colorKey(cc.backgroundColor), padY: [r1(px(cc.paddingTop)), r1(px(cc.paddingBottom))], cols: maxCols, media: media, container: Math.round(cw), align: hd ? getComputedStyle(hd).textAlign : null, sticky: /sticky|fixed/.test(cc.position) || Array.prototype.some.call(el.querySelectorAll('*'), function (d, ix) { return ix < 400 && getComputedStyle(d).position === 'sticky'; }) };
  });

  // 4. Navigation chrome and declared tokens.
  var nav = null;
  var navEl = D.querySelector('header, [role=banner], nav');
  if (navEl) { var nr = navEl.getBoundingClientRect(), nc = getComputedStyle(navEl); nav = { h: Math.round(nr.height), pos: nc.position, bg: colorKey(nc.backgroundColor), backdrop: nc.backdropFilter !== 'none', links: navEl.querySelectorAll('a').length, buttons: navEl.querySelectorAll('button, a[role=button]').length }; }
  var vars = {};
  try {
    Array.prototype.forEach.call(D.styleSheets, function (sh) {
      var rules; try { rules = sh.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules || [], function (ru) {
        if (!ru.style || !/^(:root|html|:host)\b/.test(ru.selectorText || '')) return;
        for (var q = 0; q < ru.style.length && Object.keys(vars).length < 160; q++) { var nm = ru.style[q]; if (nm.indexOf('--') === 0 && nm.indexOf('--tw-') !== 0) vars[nm] = getComputedStyle(de).getPropertyValue(nm).trim().slice(0, 80); }
      });
    });
  } catch (e) {}
  var loaded = [];
  try { D.fonts.forEach(function (f) { if (f.status === 'loaded' && loaded.indexOf(f.family) < 0) loaded.push(f.family.replace(/^["']|["']$/g, '')); }); } catch (e) {}
  var meta = function (nm) { var m = D.querySelector('meta[name="' + nm + '"]'); return m ? m.getAttribute('content') : null; };

  return {
    v: 1, url: location.href, title: D.title.slice(0, 120), vw: W, vh: H, docH: docH, screens: screens,
    rootBg: colorKey(getComputedStyle(de).backgroundColor) || colorKey(getComputedStyle(D.body).backgroundColor),
    colorScheme: getComputedStyle(de).colorScheme, themeColor: meta('theme-color'), generator: meta('generator'),
    samples: { points: pts, media: mediaPts, gradient: gradientPts, area: top(area, 24) },
    text: top(text, 60), textColor: top(textColor, 16), families: top(families, 8), fontsLoaded: loaded.slice(0, 12),
    padding: top(pad), gap: top(gap, 20), vmargin: top(vmargin, 20), radius: top(radius, 12), shadow: top(shadow, 10),
    borderW: top(borderW, 6), borderColor: top(borderColor, 8), duration: top(dur, 10), easing: top(ease, 6),
    gradients: top(gradients, 6), effects: effects, grids: grids.sort(function (a, b) { return b[3] - a[3]; }).slice(0, 16),
    buttons: buttons.sort(function (a, b) { return ((b.bg || b.border) ? 1 : 0) - ((a.bg || a.border) ? 1 : 0) || a.y - b.y; }).slice(0, 16), inputs: inputs, nav: nav, sections: sections,
    images: images, imgRatios: top(imgRatios, 8), icons: top(icons, 6), vars: vars, elements: els.length, footerChars: footChars
  };
})()`;
