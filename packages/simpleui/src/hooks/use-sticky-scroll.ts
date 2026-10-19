import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, PendingConfirm } from '../types.js';

export interface UseStickyScrollOptions {
  messages: ChatMessage[];
  activity: string;
  pendingConfirm: PendingConfirm | null;
}

export interface UseStickyScrollResult {
  /** Attach to the scrollable container. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** True when the user has scrolled up past the threshold. */
  showJumpToLatest: boolean;
  /** Exposed for the message handler (session.start resets this). */
  setShowJumpToLatest: React.Dispatch<React.SetStateAction<boolean>>;
  /** Scroll to the bottom. */
  jumpToLatest: () => void;
  /** Attach to the container's onScroll. */
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  /** Exposed for callers that need to pin the scroll position
   *  before a new message arrives (e.g. `dispatchUserMessage`). */
  stickToBottomRef: React.RefObject<boolean>;
}

/**
 * True when the user asked the OS for reduced motion.
 *
 * The matchMedia API can be missing entirely (jsdom, locked-down webviews) -
 * `use-theme.ts` documents the same environment and degrades to a boot-time
 * answer "instead of throwing mid-effect". This hook has to degrade the same
 * way: a bare `matchMedia(...)` call raised a TypeError on the "jump to
 * latest" click, so the button the operator pressed to get back to the newest
 * message did nothing but throw, and the scroll never happened.
 */
function prefersReducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Manages chat scroll stickiness: auto-scrolls to the bottom on new
 * content when the user hasn't scrolled up, exposes a "jump to latest"
 * affordance when they have, and supports reduced-motion preference.
 *
 * Extracted from `app.tsx` in PR-6 to shrink the monolith.
 *
 * Behavioural contract:
 *  - Auto-scroll fires on `messages` / `activity` / `pendingConfirm` change
 *    (same deps as the original effect).
 *  - `onScroll` sets `stickToBottomRef` and `showJumpToLatest`.
 *  - `jumpToLatest` respects `prefers-reduced-motion`.
 *  - `stickToBottomRef` is exposed so external paths (dispatchUserMessage)
 *    can force-pin before dispatching.
 */
export function useStickyScroll(options: UseStickyScrollOptions): UseStickyScrollResult {
  const { messages, activity, pendingConfirm } = options;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // ── Auto-scroll on new content ──
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickToBottomRef.current) return;
    const frame = requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, activity, pendingConfirm]);

  // ── Jump to latest ──
  const jumpToLatest = useCallback(() => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const element = scrollRef.current;
    if (!element) return;
    const reducedMotion = prefersReducedMotion();
    element.scrollTo({ top: element.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, []);

  // ── Scroll handler ──
  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 120;
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, []);

  return {
    scrollRef,
    showJumpToLatest,
    setShowJumpToLatest,
    jumpToLatest,
    onScroll,
    stickToBottomRef,
  };
}
