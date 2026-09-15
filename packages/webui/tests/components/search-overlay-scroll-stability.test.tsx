// Regression test for SearchOverlay auto-scroll bug.
//
// Bug: the scroll effect depended on `hits` (a useMemo array), whose
// identity changed on every message update (streaming deltas, tool
// progress). This caused requestScrollToMessage to be called repeatedly,
// re-scrolling to the active hit even after the user had navigated
// elsewhere.
//
// Fix: extract `hits[activeHit]` as a primitive string (`activeHitId`)
// and depend on that instead. The scroll now fires only when the target
// message id actually changes.
//
// This test verifies the fix by updating the messages array identity
// (new reference, same content) and asserting that scrollTarget.nonce
// does NOT increment.

import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchOverlay } from '../../src/components/SearchOverlay';
import type { ChatMessage } from '../../src/stores';
import { useChatStore, useUIStore } from '../../src/stores';

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

// Animation frames are queued here instead of running on jsdom's real rAF
// timer. SearchOverlay's repaint chain is three setState calls spread across
// three frames; on a real timer they land *after* the test's await points and
// React reports each one as "a test was not wrapped in act(...)".
//
// The queue must not be flushed synchronously *inside* requestAnimationFrame:
// the chain assigns back to its own binding (`let raf = requestAnimationFrame(
// tick)` where tick reassigns `raf`), so a re-entrant call hits the temporal
// dead zone. Queueing keeps rescheduling legal, and flushFrames() runs the
// callbacks inside act() so the updates are covered.
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

/** Run the queued animation frames inside act(). */
async function flushFrames(rounds = 3): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    if (frames.size === 0) return;
    const pending = [...frames.values()];
    frames.clear();
    await act(async () => {
      for (const cb of pending) cb(0);
    });
  }
}

beforeEach(() => {
  frames = new Map();
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  useUIStore.setState({
    searchOpen: false,
    searchQuery: '',
    searchActiveMessageId: null,
    scrollTarget: null,
  });
  useChatStore.setState({ messages: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Store resets moved to beforeEach: resetting here would touch the stores
  // while the previous test's tree is still mounted (RTL's auto-cleanup runs in
  // its own afterEach), re-rendering SearchOverlay outside act().
});

describe('SearchOverlay scroll stability', () => {
  it('does NOT re-scroll when the messages array identity changes but the active hit id stays the same', async () => {
    // Two messages, both matching "needle". Active hit defaults to index 0
    // → resolved id "hit-a".
    const initialMessages = [
      msg({ id: 'hit-a', content: 'find the needle here' }),
      msg({ id: 'hit-b', content: 'another needle match' }),
    ];

    useChatStore.setState({ messages: initialMessages });
    useUIStore.setState({
      searchOpen: true,
      searchQuery: 'needle',
    });

    render(<SearchOverlay />);

    // Drive the queued repaint frames inside act().
    await flushFrames();

    // Wait for the initial scroll request to fire — scrollTarget should be
    // set with nonce 1 pointing at the first hit.
    await waitFor(() => {
      expect(useUIStore.getState().scrollTarget).not.toBeNull();
    });
    const firstNonce = useUIStore.getState().scrollTarget!.nonce;
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-a');

    // ── Simulate a streaming delta / tool progress tick ───────────────
    // Replace the messages array with a NEW reference that has the same
    // content. This is exactly what happens when appendToMessage creates
    // a new array for a coalesced stream flush. The `hits` useMemo will
    // recompute (new array identity), but hits[0] is still "hit-a".
    //
    // With the old bug (dependency on `hits` array), the scroll effect
    // would re-fire here, incrementing the nonce. With the fix
    // (dependency on `activeHitId` primitive), it must NOT.
    act(() => {
      useChatStore.setState({
        messages: [...initialMessages], // new array, same content
      });
    });

    // Give React a tick to process the re-render + any effects.
    await waitFor(() => {
      // The nonce must be unchanged — no re-scroll.
      expect(useUIStore.getState().scrollTarget!.nonce).toBe(firstNonce);
    });

    // Also verify the target id hasn't changed.
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-a');
    expect(useUIStore.getState().scrollTarget!.nonce).toBe(firstNonce);
  });

  it('DOES re-scroll when the active hit actually changes (user navigates to next hit)', async () => {
    const initialMessages = [
      msg({ id: 'hit-a', content: 'find the needle here' }),
      msg({ id: 'hit-b', content: 'another needle match' }),
    ];

    useChatStore.setState({ messages: initialMessages });
    useUIStore.setState({
      searchOpen: true,
      searchQuery: 'needle',
    });

    render(<SearchOverlay />);

    // Drive the queued repaint frames inside act().
    await flushFrames();

    // Initial scroll to hit-a.
    await waitFor(() => {
      expect(useUIStore.getState().scrollTarget).not.toBeNull();
    });
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-a');
    const firstNonce = useUIStore.getState().scrollTarget!.nonce;

    // Simulate the user pressing ArrowDown to step to the next hit.
    // SearchOverlay's step() increments activeHit, which changes
    // activeHitId from "hit-a" to "hit-b" — the scroll effect SHOULD fire.
    const input = document.querySelector('input');
    expect(input).not.toBeNull();
    // Dispatch ArrowDown keydown to step to the next hit.
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // The nonce should now increment because the active hit id changed.
    await waitFor(() => {
      expect(useUIStore.getState().scrollTarget!.nonce).toBeGreaterThan(firstNonce);
    });
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-b');
  });

  it('does NOT re-scroll when a non-matching message is appended to the transcript', async () => {
    const initialMessages = [msg({ id: 'hit-a', content: 'find the needle here' })];

    useChatStore.setState({ messages: initialMessages });
    useUIStore.setState({
      searchOpen: true,
      searchQuery: 'needle',
    });

    render(<SearchOverlay />);

    // Drive the queued repaint frames inside act().
    await flushFrames();

    await waitFor(() => {
      expect(useUIStore.getState().scrollTarget).not.toBeNull();
    });
    const firstNonce = useUIStore.getState().scrollTarget!.nonce;
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-a');

    // Append a new message that does NOT match the search query.
    // The messages array gets a new identity, hits recomputes (still just
    // ["hit-a"]), but activeHitId is unchanged → no re-scroll.
    act(() => {
      useChatStore.setState({
        messages: [
          ...initialMessages,
          msg({ id: 'msg-new', content: 'totally unrelated content' }),
        ],
      });
    });

    await waitFor(() => {
      expect(useUIStore.getState().scrollTarget!.nonce).toBe(firstNonce);
    });
    expect(useUIStore.getState().scrollTarget!.id).toBe('hit-a');
  });
});
