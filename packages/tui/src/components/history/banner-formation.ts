import { useEffect, useState } from 'react';
import { useMotionStatic } from '../../motion.js';

export const BANNER_FORMATION_DURATION_MS = 1_200;
const FRAME_MS = 60;

/** Stable reveal order: filled pixels appear once and never flicker away. */
function pixelVisible(column: number, pixelRow: number, progress: number): boolean {
  const hash = Math.imul(column + 1, 374761393) ^ Math.imul(pixelRow + 1, 668265263);
  const mixed = Math.imul(hash ^ (hash >>> 13), 1274126177);
  const threshold = ((mixed ^ (mixed >>> 16)) >>> 0) / 0x100000000;
  return progress > threshold;
}

/** Reveal the two bitmap pixels in each terminal cell independently. */
export function pixelFormationLine(
  line: string,
  row: number,
  progress: number,
  columnOffset = 0,
): string {
  if (progress >= 1) return line;
  if (!(progress > 0)) return ' '.repeat(line.length);
  return [...line]
    .map((cell, column) => {
      const top =
        (cell === '█' || cell === '▀') && pixelVisible(column + columnOffset, row * 2, progress);
      const bottom =
        (cell === '█' || cell === '▄') &&
        pixelVisible(column + columnOffset, row * 2 + 1, progress);
      return top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
    })
    .join('');
}

/** A bounded clock owned only by the brand leaf, never by input or history. */
export function useBannerFormation(startedAt: number | undefined): number {
  const motionStatic = useMotionStatic();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === undefined || motionStatic) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      const current = Date.now();
      setNow(current);
      const remaining = startedAt + BANNER_FORMATION_DURATION_MS - current;
      if (remaining > 0) timeout = setTimeout(tick, Math.min(FRAME_MS, remaining));
    };
    tick();
    return () => clearTimeout(timeout);
  }, [startedAt, motionStatic]);
  return startedAt === undefined || motionStatic
    ? BANNER_FORMATION_DURATION_MS
    : Math.max(0, now - startedAt);
}
