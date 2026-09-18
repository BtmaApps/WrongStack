/**
 * Application-wide constants.
 * Centralized here to avoid magic numbers scattered across modules.
 */

export const OPEN_EXTERNAL_ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export {
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_MEDIUM,
  SIDEBAR_WIDTH_NARROW,
  SIDEBAR_WIDTH_WIDE,
} from '../../shared/layout.js';

export const MIN_WINDOW_WIDTH = 760;
export const MIN_WINDOW_HEIGHT = 520;

export const MAX_PENDING_WEBUI_COMMANDS = 50;
export const MAX_PENDING_FLUSH_ATTEMPTS = 80;
export const WEBUI_COMMAND_FALLBACK_MS = 350;
export const WEBUI_COMMAND_ACK_TIMEOUT_MS = 2_000;

export const WINDOW_STATE_SAVE_DEBOUNCE_MS = 350;
export const PENDING_WEBUI_FLUSH_DELAY_MS = 250;
export const LOG_NOTIFY_DEBOUNCE_MS = 250;
