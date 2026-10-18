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
  const svg = root.querySelector('svg')!;
  const nodes = [...root.querySelectorAll<SVGGElement>('[data-ambient-node]')];
  const groups = [...root.querySelectorAll<SVGGElement>('[data-ambient-burst]')];
  const bursts = groups.map((group) => ({
    group,
    ring: group.querySelector<SVGCircleElement>('[data-ring]')!,
    particles: [...group.querySelectorAll<SVGPathElement>('[data-particle]')],
    born: -Infinity,
    x: 0,
    y: 0,
  }));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  // Frames consume cached preferences; media changes use their own event lifecycle.
  let reduceMotion = reduced.matches;
  let coarsePointer = coarse.matches;
  const offsets = nodes.map(() => ({ x: 0, y: 0 }));
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
  const pointer = { x: 0, y: 0, at: -Infinity };

  const setBurstCount = (value: number) => {
    if (activeBursts === value) return;
    activeBursts = value;
    root.dataset.activeBursts = String(value);
  };
  const clearEffects = () => {
    pointer.at = -Infinity;
    for (const burst of bursts) {
      burst.born = -Infinity;
      burst.group.style.display = 'none';
    }
    setBurstCount(0);
  };
  const isRunning = () =>
    !disposed && !reduceMotion && !document.hidden && intersecting && !suspended;
  const draw = (now: number, dt: number) => {
    const influence = Math.max(0, 1 - (now - pointer.at) / 4200);
    const radius = Math.min(240, width * 0.4);
    const smoothing = 1 - Math.exp(-dt * 7);
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
      const force = (index % 3 === 0 ? -1 : 1) * 19 * model.depth * falloff;
      offset.x += ((dx / Math.max(1, distance)) * force - offset.x) * smoothing;
      offset.y += ((dy / Math.max(1, distance)) * force - offset.y) * smoothing;
      const node = nodes[index]!;
      const visible = y > -65 && y < height + 65;
      node.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      node.setAttribute(
        'transform',
        `translate(${(x + offset.x).toFixed(2)} ${(y + offset.y).toFixed(2)}) rotate(${(model.phase * 20 + Math.sin(elapsed * 0.00007 + model.phase) * 12).toFixed(2)})`,
      );
    }

    let alive = 0;
    const life = mobile ? 1000 : 1700;
    for (const burst of bursts) {
      const t = (now - burst.born) / life;
      if (t < 0 || t >= 1) {
        burst.group.style.display = 'none';
        continue;
      }
      alive++;
      burst.group.style.display = '';
      burst.group.setAttribute('transform', `translate(${burst.x} ${burst.y})`);
      burst.group.setAttribute('opacity', String(0.6 * (1 - t) ** 2));
      const spread = 1 - (1 - t) ** 3;
      burst.ring.setAttribute(
        'transform',
        `scale(${(8 + spread * (mobile ? 62 : 105)).toFixed(2)})`,
      );
      burst.particles.forEach((particle, index) => {
        particle.style.display = mobile && index > 2 ? 'none' : '';
        const angle = (index / (mobile ? 3 : 6)) * Math.PI * 2 + 0.4;
        const travel = 9 + spread * (mobile ? 34 : 62);
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
      });
      draw(performance.now(), 0);
    }
  };
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    const nextMobile = width < 768 || coarsePointer;
    if (nextMobile !== mobile) clearEffects();
    mobile = nextMobile;
    count = mobile ? 8 : width < 1280 ? 16 : 24;
    root.dataset.nodeCount = String(count);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    nodes.forEach((node, index) => {
      node.style.display = index < count ? '' : 'none';
    });
    draw(performance.now(), 0);
  };
  const interactive = (event: Event) =>
    event.composedPath().some((target) => target instanceof Element && target.matches(INTERACTIVE));
  const move = (event: PointerEvent) => {
    if (!isRunning() || coarsePointer || event.pointerType === 'touch' || interactive(event)) {
      pointer.at = -Infinity;
      return;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.at = performance.now();
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
  observer?.observe(root);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', move, { passive: true });
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
    window.removeEventListener('pointermove', move);
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
