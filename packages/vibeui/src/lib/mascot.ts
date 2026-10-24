export const MASCOT_WIDTH = 88;
export const MASCOT_HEIGHT = 64;
export const MASCOT_HOME = 'translate(0px, 0px) scale(0.5)';
export const MASCOT_REACTION_MS = 2400;
export type MascotGesture = 'highfive' | 'dance' | 'stretch';
export type MascotMood = 'idle' | 'working' | 'done' | 'offline' | 'attention' | 'stopped';

export function mascotState({
  connected,
  working,
  outcome,
  attention = false,
}: {
  connected: boolean;
  working: boolean;
  outcome: 'done' | 'aborted' | 'error' | null;
  attention?: boolean;
}): { mood: MascotMood; status: string } {
  if (!connected)
    return { mood: 'offline', status: 'I’ll stay here while the connection comes back.' };
  if (working) return { mood: 'working', status: 'Keeping you company while work is happening.' };
  if (outcome === 'error')
    return {
      mood: 'attention',
      status: 'Some work needs another look. One little step at a time.',
    };
  if (outcome === 'aborted')
    return { mood: 'stopped', status: 'Work has stopped. Take your time.' };
  if (attention)
    return {
      mood: 'attention',
      status: 'Some work needs another look. One little step at a time.',
    };
  if (outcome === 'done')
    return { mood: 'done', status: 'All done for now. What shall we make next?' };
  return { mood: 'idle', status: 'Ready for your next little idea.' };
}

export function mascotStopIndex(step: number) {
  return Number.isSafeInteger(step) && step >= 0 ? [0, 1, 2, 1][step % 4]! : 0;
}

export function mascotMoveDuration(distance: number) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  return Math.min(3400, Math.max(1600, Math.round(900 + safeDistance * 8)));
}

/** Stay in the spare left gutter, above the composer and below the navigation. */
export function mascotWaypoints({
  width,
  height,
  contentTop,
  composerTop,
}: {
  width: number;
  height: number;
  contentTop: number;
  composerTop: number;
}) {
  if (![width, height, contentTop, composerTop].every(Number.isFinite)) return [];
  const gutter = (width - 848) / 2;
  const top = Math.max(110, contentTop + 14);
  const bottom = Math.min(height - MASCOT_HEIGHT - 20, composerTop - MASCOT_HEIGHT - 22);
  if (width < 1120 || height < 480 || gutter < MASCOT_WIDTH + 32 || bottom - top < 90) return [];
  return [
    { x: 16, y: top },
    { x: Math.min(40, gutter - MASCOT_WIDTH - 20), y: (top + bottom) / 2 },
    { x: 16, y: bottom },
  ];
}
