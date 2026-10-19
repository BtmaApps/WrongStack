/**
 * Process-wide lockdown switches, set once at boot by `--restricted` and never
 * cleared.
 *
 * They live here, below every consumer, because the values they override have
 * several writers: `allowOutsideProjectRoot` comes from config for subagents,
 * from the session wiring for the leader, and from `/settings` at runtime; YOLO
 * from config, `/yolo`, WebUI and HQ. Locking each writer would leave the next
 * one added unlocked. The readers — `Context.allowOutsideProjectRoot` and the
 * permission policy's effective YOLO — consult these instead.
 */

let projectRootLocked = false;
let yoloLockedOff = false;
let networkLockedOff = false;

/** File tools stay inside the project root for the rest of the process. */
export function lockToProjectRoot(): void {
  projectRootLocked = true;
}

export function isProjectRootLocked(): boolean {
  return projectRootLocked;
}

/** YOLO reads as off for the rest of the process, whatever sets it. */
export function lockYoloOff(): void {
  yoloLockedOff = true;
}

export function isYoloLockedOff(): boolean {
  return yoloLockedOff;
}

/**
 * Outbound network stays off for tools whose capability set cannot say so per
 * action — `--restricted` removes `net.outbound` tools by capability, but the
 * `design` tool only reaches the network in `extract`/`compare`, and dropping
 * the whole tool would also drop its offline token actions.
 */
export function lockNetworkOff(): void {
  networkLockedOff = true;
}

export function isNetworkLockedOff(): boolean {
  return networkLockedOff;
}

/** Tests only: the switches are one-way in production. */
export function __resetProcessLockdownForTests(): void {
  projectRootLocked = false;
  yoloLockedOff = false;
  networkLockedOff = false;
}
