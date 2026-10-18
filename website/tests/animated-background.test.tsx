import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnimatedBackground } from '../src/components/site/AnimatedBackground';

let container: HTMLDivElement;
let root: Root;
let now: number;
let sequence: number;
let commits: number;
let frames: Map<number, FrameRequestCallback>;
const mediaHandlers = new Set<(event: MediaQueryListEvent) => void>();
const reduced = {
  matches: false,
  addEventListener: (_: string, handler: (event: MediaQueryListEvent) => void) =>
    mediaHandlers.add(handler),
  removeEventListener: (_: string, handler: (event: MediaQueryListEvent) => void) =>
    mediaHandlers.delete(handler),
};

function notifyMotion() {
  for (const handler of mediaHandlers) handler({ matches: reduced.matches } as MediaQueryListEvent);
}

function advance(ms = 17) {
  now += ms;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(now);
}
function background() {
  return container.querySelector<HTMLDivElement>('.ambient-background')!;
}
function click(target: Element = document.body, detail = 1) {
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail,
      clientX: 140,
      clientY: 220,
    }),
  );
  advance();
}

beforeEach(async () => {
  now = 100;
  sequence = 0;
  commits = 0;
  frames = new Map();
  reduced.matches = false;
  mediaHandlers.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1440);
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('matchMedia', (query: string) =>
    query.includes('reduced-motion')
      ? reduced
      : { matches: false, addEventListener: () => {}, removeEventListener: () => {} },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <Profiler id="ambient" onRender={() => commits++}>
        <AnimatedBackground />
      </Profiler>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('animates SVG without committing React on each frame', () => {
  const node = background().querySelector('[data-ambient-node]')!;
  const before = node.getAttribute('transform');
  const mountedCommits = commits;
  for (let i = 0; i < 90; i++) advance();
  expect(node.getAttribute('transform')).not.toBe(before);
  expect(commits).toBe(mountedCommits);
  expect(frames.size).toBe(1);
});

it('limits pointer force by distance and lets it decay after inactivity', () => {
  const nodes = [...background().querySelectorAll('[data-ambient-node]')];
  const position = (node: Element) =>
    node
      .getAttribute('transform')!
      .match(/translate\(([-\d.]+) ([-\d.]+)\)/)!
      .slice(1)
      .map(Number);
  advance();
  const near = position(nodes[0]!);
  const farIndex = nodes.findIndex((node) => {
    const p = position(node);
    return Math.hypot(p[0]! - near[0]!, p[1]! - near[1]!) > 600;
  });
  const far = position(nodes[farIndex]!);
  document.body.dispatchEvent(
    new MouseEvent('pointermove', { bubbles: true, clientX: near[0]! + 40, clientY: near[1]! }),
  );
  for (let i = 0; i < 20; i++) advance();
  const movedNear = position(nodes[0]!);
  const movedFar = position(nodes[farIndex]!);
  expect(Math.hypot(movedNear[0]! - near[0]!, movedNear[1]! - near[1]!)).toBeGreaterThan(3);
  expect(Math.hypot(movedFar[0]! - far[0]!, movedFar[1]! - far[1]!)).toBeLessThan(2);
  advance(5000);
  for (let i = 0; i < 90; i++) advance();
  const faded = position(nodes[0]!);
  reduced.matches = true;
  notifyMotion();
  const reset = position(nodes[0]!);
  expect(Math.hypot(faded[0]! - reset[0]!, faded[1]! - reset[1]!)).toBeLessThan(0.03);
});

it('reuses a bounded burst pool and expires all effects', () => {
  const domSize = background().querySelectorAll('*').length;
  for (let i = 0; i < 20; i++) {
    advance(170);
    click();
    expect(Number(background().dataset.activeBursts)).toBeLessThanOrEqual(4);
  }
  expect(background().dataset.activeBursts).toBe('4');
  expect(background().querySelectorAll('*')).toHaveLength(domSize);
  advance(2000);
  expect(background().dataset.activeBursts).toBe('0');
});

it('ignores nested interactive controls, keyboard clicks and prevented clicks', () => {
  const control = document.createElement('button');
  const child = document.createElement('span');
  control.append(child);
  container.append(control);
  click(child);
  click(document.body, 0);
  const prevent = (event: Event) => event.preventDefault();
  document.body.addEventListener('click', prevent);
  click();
  document.body.removeEventListener('click', prevent);
  expect(background().dataset.activeBursts).toBe('0');
  click();
  expect(background().dataset.activeBursts).toBe('1');
});

it('reduces mobile density and caps the mobile effect pool at two', () => {
  vi.stubGlobal('innerWidth', 375);
  window.dispatchEvent(new Event('resize'));
  expect(background().dataset.nodeCount).toBe('8');
  for (let i = 0; i < 8; i++) {
    advance(170);
    click();
  }
  expect(Number(background().dataset.activeBursts)).toBeLessThanOrEqual(2);
});

it('stops frames and interactions for reduced motion, then resumes', () => {
  click();
  reduced.matches = true;
  notifyMotion();
  expect(background().dataset.motion).toBe('reduced');
  expect(background().dataset.activeBursts).toBe('0');
  expect(frames.size).toBe(0);
  click();
  expect(frames.size).toBe(0);
  expect(background().dataset.activeBursts).toBe('0');
  reduced.matches = false;
  notifyMotion();
  expect(frames.size).toBe(1);
});

it('suspends hidden pages and removes the loop and listeners on unmount', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(background().dataset.motion).toBe('hidden');
  expect(frames.size).toBe(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(frames.size).toBe(1);
  await act(async () => root.unmount());
  expect(frames.size).toBe(0);
  expect(mediaHandlers.size).toBe(0);
  click();
  expect(frames.size).toBe(0);
  root = createRoot(container);
});
