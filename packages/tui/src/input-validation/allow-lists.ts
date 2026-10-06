/** History entry kinds that carry text (must be non-empty to be stored). */
export const TEXT_BEARING_ENTRY_KINDS = new Set([
  'user',
  'assistant',
  'thinking',
  'info',
  'warn',
  'error',
  'turn-summary',
]);

/** All valid history entry kinds. */
export const ALLOWED_ENTRY_KINDS = new Set([
  ...TEXT_BEARING_ENTRY_KINDS,
  'tool',
  'memory-activation',
  'memory-lifecycle',
  'banner',
  'divider',
  'model-switch',
]);

/** Fleet subagent status values. */
export const ALLOWED_FLEET_STATUSES = new Set([
  'idle',
  'running',
  'success',
  'failed',
  'timeout',
  'stopped',
]);

/** Mouse event kinds */
export const ALLOWED_MOUSE_KINDS = new Set(['press', 'release', 'move', 'wheel']);

/** Mouse buttons */
export const ALLOWED_MOUSE_BUTTONS = new Set(['left', 'middle', 'right', 'none']);

/** Keyboard modifier keys. */
export const ALLOWED_KEY_EVENT_FIELDS = new Set([
  'upArrow',
  'downArrow',
  'leftArrow',
  'rightArrow',
  'return',
  'escape',
  'ctrl',
  'meta',
  'shift',
  'tab',
  'backspace',
  'delete',
  'pageUp',
  'pageDown',
  'home',
  'end',
  'wheelDeltaY',
  'mouse',
  'fn',
]);

/** Autonomy mode values. */
export const ALLOWED_AUTONOMY_MODES = new Set([
  'off',
  'suggest',
  'auto',
  'eternal',
  'eternal-parallel',
]);

/** Known send modes. */
export const ALLOWED_SEND_MODES = new Set(['queue', 'steer', 'btw', 'direct']);

/** FleetChat verbosity modes. */
export const ALLOWED_FLEET_CHAT_MODES = new Set(['off', 'concise', 'full']);

/** Collaboration verdicts. */
export const ALLOWED_COLLAB_VERDICTS = new Set(['approve', 'needs_revision', 'reject']);

/** Known terminal capability keys. */
export const ALLOWED_CAPABILITY_FIELDS = new Set(['colorDepth', 'mouseProtocol', 'supportsTitle']);
