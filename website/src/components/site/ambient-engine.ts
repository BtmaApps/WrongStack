export const AMBIENT_NODES = Array.from({ length: 24 }, (_, index) => {
  const n = index + 1;
  return {
    x: 0.04 + ((n * 0.61803398875) % 1) * 0.92,
    y: 0.06 + ((n * 0.38196601125 + index * 0.17) % 1) * 0.88,
    depth: 0.35 + (index % 3) * 0.28,
    phase: n * 2.39996,
  };
});

const INTERACTIVE =
  'a,button,input,select,textarea,summary,label,dialog,audio,video,[role="dialog"],[role="button"],[role="link"],[role="menuitem"],[role="radio"],[role="checkbox"],[role="tab"],[role="slider"],[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"]),[data-ambient-ignore]';

/** One bounded imperative loop; React owns the SVG structure, never the frames. */
export function startAmbientBackground(root: HTMLDivElement) {
  const svgs = [...root.querySelectorAll<SVGSVGElement>('svg')];
  const nodes = [...root.querySelectorAll<SVGGElement>('[data-ambient-node]')];
  const echoes = [...root.querySelectorAll<SVGGElement>('[data-ambient-echo]')];
  const relayRings = [...root.querySelectorAll<SVGCircleElement>('[data-relay-ring]')];
  const pointerField = root.querySelector<SVGGElement>('[data-pointer-field]')!;
  const pointerOrbit = root.querySelector<SVGCircleElement>('[data-pointer-orbit]')!;
  const trails = [...root.querySelectorAll<SVGCircleElement>('[data-ambient-trail]')].map(
    (element) => ({ element, born: -Infinity, x: 0, y: 0 }),
  );
  const groups = [...root.querySelectorAll<SVGGElement>('[data-ambient-burst]')];
  const bursts = groups.map((group) => ({
    group,
    ring: group.querySelector<SVGCircleElement>('[data-ring]')!,
    secondary: group.querySelector<SVGCircleElement>('[data-ring-secondary]')!,
    particles: [...group.querySelectorAll<SVGPathElement>('[data-particle]')],
    born: -Infinity,
    x: 0,
    y: 0,
    reactions: nodes.map(() => ({ delay: Infinity, energy: 0, dx: 0, dy: 0, hop: 0 })),
  }));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  // Frames consume cached preferences; media changes use their own event lifecycle.
  let reduceMotion = reduced.matches;
  let coarsePointer = coarse.matches;
  const offsets = nodes.map(() => ({ x: 0, y: 0, orbit: 0 }));
  const positions = nodes.map(() => ({ x: 0, y: 0 }));
  let width = window.innerWidth;
  let height = window.innerHeight;
  let scroll = window.scrollY;
  let count = 24;
  let mobile = false;
  let intersecting = true;
  let suspended = false;
  let disposed = false;
  let frame: number | null = null;
  let lastFrame = 0;
  let elapsed = 0;
  let cursor = 0;
  let lastClick = -Infinity;
  let activeBursts = 0;
  let trailCursor = 0;
  let lastTrail = -Infinity;
  const pointer = { x: 0, y: 0, at: -Infinity };

  const setBurstCount = (value: number) => {
    if (activeBursts === value) return;
    activeBursts = value;
    root.dataset.activeBursts = String(value);
  };
  const clearEffects = () => {
    pointer.at = -Infinity;
    pointerField.setAttribute('opacity', '0');
    for (const trail of trails) {
      trail.born = -Infinity;
      trail.element.setAttribute('opacity', '0');
    }
    for (const burst of bursts) {
      burst.born = -Infinity;
      burst.group.style.display = 'none';
    }
    setBurstCount(0);
  };
  const isRunning = () =>
    !disposed && !reduceMotion && !document.hidden && intersecting && !suspended;
  const draw = (now: number, dt: number) => {
    const influence = Math.max(0, 1 - (now - pointer.at) / 2800);
    const radius = Math.min(360, width * 0.7);
    const smoothing = 1 - Math.exp(-dt * 8);
    const life = mobile ? 1100 : 1800;
    const relayLife = mobile ? 420 : 650;
    for (let index = 0; index < count; index++) {
      const model = AMBIENT_NODES[index]!;
      const offset = offsets[index]!;
      const x = model.x * width + Math.sin(elapsed * 0.00013 + model.phase) * 17 * model.depth;
      const period = height + 180;
      const rawY = model.y * height - scroll * model.depth * 0.055;
      const y =
        ((((rawY + 90) % period) + period) % period) -
        90 +
        Math.cos(elapsed * 0.0001 + model.phase) * 13 * model.depth;
      const dx = pointer.x - x;
      const dy = pointer.y - y;
      const distance = Math.hypot(dx, dy);
      const falloff = influence * Math.max(0, 1 - distance / radius) ** 2;
      const direction = index % 4 === 0 ? -1 : 1;
      offset.orbit =
        (offset.orbit +
          direction *
            dt *
            (0.8 + model.depth * 0.8 + Math.sin(elapsed * 0.0005 + model.phase) * 0.12) *
            falloff) %
        (Math.PI * 2);
      const angle = Math.atan2(-dy, -dx) + offset.orbit;
      const orbitRadius =
        Math.max(30, Math.min(distance, 105)) + Math.sin(elapsed * 0.0015 + model.phase) * 8;
      const orbitBlend = Math.min(1, falloff * 1.35);
      const force = (index % 3 === 0 ? -1 : 1) * (18 + 20 * model.depth) * falloff;
      let targetX =
        (pointer.x + Math.cos(angle) * orbitRadius - x) * orbitBlend +
        (dx / Math.max(1, distance)) * force;
      let targetY =
        (pointer.y + Math.sin(angle) * orbitRadius - y) * orbitBlend +
        (dy / Math.max(1, distance)) * force;
      let shock = 0;
      let relayGlow = 0;
      let relaySpin = 0;
      let ringOpacity = 0;
      let ringRadius = 1;
      for (const burst of bursts) {
        const t = (now - burst.born) / life;
        if (t < 0 || t >= 1) continue;
        const bx = x - burst.x;
        const by = y - burst.y;
        const d = Math.hypot(bx, by);
        const wave = 20 + t * (mobile ? 185 : 340);
        const envelope = Math.exp(-(((d - wave) / (mobile ? 48 : 85)) ** 2)) * (1 - t) ** 2;
        const impulse = envelope * (mobile ? 70 : 115) * (0.6 + model.depth);
        targetX += (bx / Math.max(1, d)) * impulse;
        targetY += (by / Math.max(1, d)) * impulse;
        shock += envelope;
        const reaction = burst.reactions[index]!;
        const rt = (now - burst.born - reaction.delay) / relayLife;
        if (rt < 0 || rt >= 1) continue;
        const pulse = Math.sin(Math.PI * rt) * Math.exp(-rt * 2) * reaction.energy;
        const curl =
          Math.sin(rt * Math.PI * 3) * Math.sin(rt * Math.PI) * (1 - rt) * reaction.energy * 14;
        targetX += reaction.dx * pulse * (mobile ? 70 : 100) - reaction.dy * curl;
        targetY += reaction.dy * pulse * (mobile ? 70 : 100) + reaction.dx * curl;
        relayGlow += Math.sin(Math.PI * rt) * reaction.energy;
        relaySpin += Math.sin(rt * Math.PI * 2) * reaction.energy * 12 * (1 - rt);
        const opacity = reaction.energy * 0.5 * (1 - rt) ** 2;
        if (opacity > ringOpacity) {
          ringOpacity = opacity;
          ringRadius = 12 + rt * (mobile ? 45 : 70);
        }
      }
      const limit = mobile ? 80 : 150;
      const constrain = Math.min(1, limit / Math.max(1, Math.hypot(targetX, targetY)));
      offset.x += (targetX * constrain - offset.x) * smoothing;
      offset.y += (targetY * constrain - offset.y) * smoothing;
      positions[index]!.x = x + offset.x;
      positions[index]!.y = y + offset.y;
      const node = nodes[index]!;
      const echo = echoes[index]!;
      const visible = y + offset.y > -65 && y + offset.y < height + 65;
      node.style.visibility = visible ? 'visible' : 'hidden';
      echo.style.visibility = visible ? 'visible' : 'hidden';
      echo.setAttribute(
        'opacity',
        String(Math.min(0.7, falloff * 1.3 + shock * 0.6 + relayGlow * 0.7)),
      );
      relayRings[index]!.setAttribute('opacity', String(ringOpacity));
      if (ringOpacity > 0)
        relayRings[index]!.setAttribute('transform', `scale(${ringRadius.toFixed(2)})`);
      if (!visible) continue;
      const transform = `translate(${(x + offset.x).toFixed(2)} ${(y + offset.y).toFixed(2)}) rotate(${(model.phase * 20 + Math.sin(elapsed * 0.00007 + model.phase) * 12 + Math.sin(offset.orbit) * 8 + relaySpin).toFixed(2)})`;
      node.setAttribute('transform', transform);
      echo.setAttribute('transform', transform);
    }

    pointerField.setAttribute(
      'opacity',
      String(coarsePointer ? 0 : influence * (mobile ? 0.65 : 1)),
    );
    if (influence > 0 && !coarsePointer) {
      pointerField.setAttribute('transform', `translate(${pointer.x} ${pointer.y})`);
      pointerOrbit.setAttribute('transform', `rotate(${(elapsed * 0.025).toFixed(2)})`);
    }
    for (const trail of trails) {
      const t = (now - trail.born) / 900;
      const opacity = !coarsePointer && t >= 0 && t < 1 ? (mobile ? 0.08 : 0.16) * (1 - t) ** 2 : 0;
      trail.element.setAttribute('opacity', String(opacity));
      if (!opacity) continue;
      trail.element.setAttribute(
        'transform',
        `translate(${trail.x} ${trail.y}) scale(${(0.4 + t * 1.3).toFixed(2)})`,
      );
    }
    let alive = 0;
    for (const burst of bursts) {
      const t = (now - burst.born) / life;
      if (t < 0 || t >= 1) {
        burst.group.style.display = 'none';
        continue;
      }
      alive++;
      burst.group.style.display = '';
      burst.group.setAttribute('transform', `translate(${burst.x} ${burst.y})`);
      burst.group.setAttribute('opacity', String(0.85 * (1 - t) ** 2));
      const spread = 1 - (1 - t) ** 3;
      burst.ring.setAttribute(
        'transform',
        `scale(${(8 + spread * (mobile ? 110 : 210)).toFixed(2)})`,
      );
      burst.secondary.setAttribute(
        'transform',
        `scale(${(5 + spread * (mobile ? 65 : 140)).toFixed(2)})`,
      );
      burst.particles.forEach((particle, index) => {
        particle.style.display = mobile && index > 2 ? 'none' : '';
        const angle = (index / (mobile ? 3 : 6)) * Math.PI * 2 + 0.4;
        const travel = 9 + spread * (mobile ? 55 : 105);
        particle.setAttribute(
          'transform',
          `translate(${(Math.cos(angle) * travel).toFixed(2)} ${(Math.sin(angle) * travel + t * t * 10).toFixed(2)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`,
        );
      });
    }
    setBurstCount(alive);
  };

  const tick = (now: number) => {
    frame = null;
    if (!isRunning()) return;
    const delta = lastFrame ? now - lastFrame : 0;
    if (!lastFrame || delta >= (mobile ? 32 : 16)) {
      lastFrame = now;
      elapsed += Math.min(delta, 50);
      draw(now, Math.min(delta / 1000, 0.05));
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastFrame = 0;
    clearEffects();
    root.dataset.motion = reduceMotion
      ? 'reduced'
      : document.hidden || suspended
        ? 'hidden'
        : !intersecting
          ? 'offscreen'
          : 'running';
    if (isRunning()) frame = requestAnimationFrame(tick);
    else {
      offsets.forEach((offset) => {
        offset.x = 0;
        offset.y = 0;
        offset.orbit = 0;
      });
      draw(performance.now(), 0);
    }
  };
  const resize = () => {
    const bounds = svgs[0]!.getBoundingClientRect();
    width = bounds.width || window.innerWidth;
    height = bounds.height || window.innerHeight;
    const nextMobile = width < 768 || coarsePointer;
    if (nextMobile !== mobile) clearEffects();
    mobile = nextMobile;
    count = mobile ? 8 : width < 1280 ? 16 : 24;
    root.dataset.nodeCount = String(count);
    for (const svg of svgs) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    nodes.forEach((node, index) => {
      node.style.display = index < count ? '' : 'none';
      echoes[index]!.style.display = index < count ? '' : 'none';
    });
    draw(performance.now(), 0);
  };
  const interactive = (event: Event) =>
    event.composedPath().some((target) => target instanceof Element && target.matches(INTERACTIVE));
  const move = (event: PointerEvent) => {
    if (!isRunning() || coarsePointer || event.pointerType === 'touch') {
      pointer.at = -Infinity;
      return;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.at = performance.now();
    if (pointer.at - lastTrail >= (mobile ? 70 : 35)) {
      const trail = trails[trailCursor++ % (mobile ? 6 : trails.length)]!;
      trail.born = pointer.at;
      trail.x = pointer.x;
      trail.y = pointer.y;
      lastTrail = pointer.at;
    }
  };
  const leave = () => {
    pointer.at = -Infinity;
  };
  const click = (event: MouseEvent) => {
    const now = performance.now();
    if (
      !isRunning() ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.detail === 0 ||
      interactive(event) ||
      window.getSelection()?.isCollapsed === false ||
      now - lastClick < 160
    )
      return;
    lastClick = now;
    const burst = bursts[cursor++ % (mobile ? 2 : 4)]!;
    burst.x = event.clientX;
    burst.y = event.clientY;
    burst.born = now;
    // Plan a short, attenuating graph once per click, never pairwise each frame.
    for (const reaction of burst.reactions) {
      reaction.delay = Infinity;
      reaction.energy = 0;
    }
    const life = mobile ? 1100 : 1800;
    const reach = mobile ? 185 : 340;
    const relayLife = mobile ? 420 : 650;
    let seed = -1;
    let nearest = reach * 0.85;
    for (let index = 0; index < count; index++) {
      const point = positions[index]!;
      if (point.y < 0 || point.y > height) continue;
      const distance = Math.hypot(point.x - burst.x, point.y - burst.y);
      if (distance < nearest) {
        nearest = distance;
        seed = index;
      }
    }
    if (seed < 0) return;
    const first = burst.reactions[seed]!;
    first.delay = 40 + life * (1 - Math.cbrt(1 - Math.max(0, (nearest - 20) / reach)));
    first.energy = 0.85;
    first.hop = 0;
    first.dx =
      nearest > 1 ? (positions[seed]!.x - burst.x) / nearest : Math.cos(AMBIENT_NODES[seed]!.phase);
    first.dy =
      nearest > 1 ? (positions[seed]!.y - burst.y) / nearest : Math.sin(AMBIENT_NODES[seed]!.phase);
    for (let assigned = 1; assigned < (mobile ? 3 : 6); assigned++) {
      let next = -1;
      let parent = -1;
      let arrival = Infinity;
      let edge = 1;
      for (let from = 0; from < count; from++) {
        const source = burst.reactions[from]!;
        if (!Number.isFinite(source.delay) || source.hop >= 2) continue;
        for (let to = 0; to < count; to++) {
          if (Number.isFinite(burst.reactions[to]!.delay)) continue;
          const point = positions[to]!;
          if (point.y < 0 || point.y > height) continue;
          const distance = Math.hypot(point.x - positions[from]!.x, point.y - positions[from]!.y);
          if (distance > (mobile ? 220 : 330)) continue;
          const at = source.delay + 110 + distance * 0.55;
          if (at < arrival && at <= life - relayLife) {
            next = to;
            parent = from;
            arrival = at;
            edge = Math.max(1, distance);
          }
        }
      }
      if (next < 0) break;
      const reaction = burst.reactions[next]!;
      const source = burst.reactions[parent]!;
      reaction.delay = arrival;
      reaction.energy = source.energy * 0.62;
      reaction.hop = source.hop + 1;
      reaction.dx = (positions[next]!.x - positions[parent]!.x) / edge;
      reaction.dy = (positions[next]!.y - positions[parent]!.y) / edge;
    }
  };
  const onScroll = () => {
    scroll = window.scrollY;
  };
  const pageHide = () => {
    suspended = true;
    sync();
  };
  const pageShow = () => {
    suspended = false;
    resize();
    sync();
  };
  const motionChange = (event: MediaQueryListEvent) => {
    reduceMotion = event.matches;
    sync();
  };
  const densityChange = (event: MediaQueryListEvent) => {
    coarsePointer = event.matches;
    resize();
    sync();
  };
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          const next = entry?.isIntersecting ?? false;
          if (next === intersecting) return;
          intersecting = next;
          sync();
        });
  observer?.observe(svgs[0]!);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', move, { passive: true, capture: true });
  window.addEventListener('pointerleave', leave, { passive: true });
  window.addEventListener('blur', leave);
  window.addEventListener('click', click, { passive: true });
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', motionChange);
  coarse.addEventListener('change', densityChange);
  resize();
  sync();

  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    window.removeEventListener('click', click);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
    document.removeEventListener('visibilitychange', sync);
    reduced.removeEventListener('change', motionChange);
    coarse.removeEventListener('change', densityChange);
    clearEffects();
  };
}
