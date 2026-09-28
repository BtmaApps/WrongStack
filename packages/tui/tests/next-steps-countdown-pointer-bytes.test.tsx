// @vitest-environment jsdom
/**
 * End-to-end pin for the armed next-steps countdown against REAL pointer bytes.
 *
 * `next-step-countdown-animation.test.tsx` and `key-handler-replay-corpus.test.ts`
 * hand the key handler a synthesized `KeyEvent` that already carries `mouse`.
 * That leaves one link unwatched: the decoder that turns terminal bytes into
 * that event — the exact link that broke, because a pointer report reaching the
 * handler with an empty `input` used to look like just another keystroke.
 *
 * This suite closes the gap by mounting the real composer input
 * (`components/input.tsx`, the owner of the raw-stdin parser and of
 * `splitTrailingMousePartial`) and writing genuine SGR reports into its stdin,
 * then feeding what it emits into the real takeover predicate that
 * `handleKey` consults.
 *
 * Byte path under test:
 *   stdin chunk → splitTrailingMousePartial → parseMouseEvents
 *   → onKey('', { ...EMPTY_KEY, mouse, wheelDeltaY }) → shouldStopNextStepsAutoSubmit
 */

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { shouldStopNextStepsAutoSubmit } from '../src/app-key-handler.js';
import { Input, type KeyEvent } from '../src/components/input.js';
import { parseMouseEvents } from '../src/mouse.js';
import { createTestState } from './helpers/create-test-state.js';
import { makeHandler } from './helpers/key-handler-fixture.js';

/** Raw reports exactly as an xterm-family terminal emits them (SGR 1006). */
const REPORTS: [name: string, chunk: string][] = [
  ['left press', '\x1b[<0;12;4M'],
  ['left release', '\x1b[<0;12;4m'],
  ['right press', '\x1b[<2;3;9M'],
  ['drag motion', '\x1b[<32;40;7M'],
  ['wheel up', '\x1b[<64;20;6M'],
  ['wheel down', '\x1b[<65;20;6M'],
];

interface Keystroke {
  input: string;
  key: KeyEvent;
}

/** Mount the real composer input and return everything its `onKey` emitted. */
async function press(chunk: string): Promise<Keystroke[]> {
  const seen: Keystroke[] = [];
  const view = render(
    <Input
      value=""
      cursor={0}
      onKey={(input, key) => {
        seen.push({ input, key: key as KeyEvent });
      }}
    />,
  );
  try {
    view.stdin.write(chunk);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    view.unmount();
  }
  return seen;
}

/** The one pointer report this chunk decoded to, as the handler would see it. */
function pointerOf(seen: Keystroke[]): Keystroke {
  const pointer = seen.find((stroke) => stroke.key.mouse != null);
  expect(pointer, 'the byte path must emit a mouse-carrying event').toBeDefined();
  return pointer!;
}

describe('armed next-steps countdown vs. raw pointer bytes', () => {
  it.each(REPORTS)('%s arrives as a pointer report, never as typed input', async (_name, chunk) => {
    const seen = await press(chunk);

    expect(pointerOf(seen).input).toBe('');

    // Everything this real byte path produced is navigation: the armed
    // countdown survives all of it.
    for (const stroke of seen) {
      expect(shouldStopNextStepsAutoSubmit({ ...stroke, draft: '' })).toBe(false);
    }
  });

  it.each(REPORTS)(
    '%s decodes through the same parser the handler assumes',
    async (_name, chunk) => {
      const parsed = parseMouseEvents(chunk);
      expect(parsed).toHaveLength(1);
      expect(pointerOf(await press(chunk)).key.mouse).toEqual(parsed[0]);
    },
  );

  it('carries the wheel direction through to the event the handler sees', async () => {
    const wheelDown = pointerOf(await press('\x1b[<65;20;6M'));

    expect(wheelDown.key.mouse?.wheel).toBe(-1);
    expect(wheelDown.key.wheelDeltaY).toBe(-1);
  });

  it('a real keystroke still reaches the handler as input and cancels', async () => {
    const seen = await press('x');

    expect(seen).toHaveLength(1);
    expect(seen[0]!.input).toBe('x');
    expect(shouldStopNextStepsAutoSubmit({ ...seen[0]!, draft: '' })).toBe(true);
  });

  it('a pointer report is a takeover again once the composer holds text', async () => {
    const pointer = pointerOf(await press('\x1b[<0;12;4M'));

    expect(shouldStopNextStepsAutoSubmit({ ...pointer, draft: 'half typed' })).toBe(true);
  });
});

/**
 * Same bytes, one link further down the chain: the real composer input wired to
 * the real app key host — the arrangement app.tsx builds (`Input` `onKey` →
 * `createAppKeyHandler`). A regression in the WIRING between the two halves,
 * not just inside either one, surfaces here.
 */
describe('raw pointer bytes through the real app pipeline', () => {
  async function pressThroughHandler(
    chunk: string,
    draft = { buffer: '', cursor: 0 },
  ): Promise<{ fixture: ReturnType<typeof makeHandler>; seen: Keystroke[] }> {
    const fixture = makeHandler(createTestState(draft), draft);
    const seen: Keystroke[] = [];
    const view = render(
      <Input
        value=""
        cursor={0}
        onKey={(input, keyEvent) => {
          const event = keyEvent as KeyEvent;
          seen.push({ input, key: event });
          void fixture.handler(input, event);
        }}
      />,
    );
    try {
      view.stdin.write(chunk);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      view.unmount();
    }
    return { fixture, seen };
  }

  it.each(REPORTS)(
    '%s never cancels the armed countdown through the wired pipeline',
    async (_name, chunk) => {
      const { fixture, seen } = await pressThroughHandler(chunk);

      expect(pointerOf(seen).input).toBe('');
      expect(fixture.cancelNextStepsCountdown).not.toHaveBeenCalled();
    },
  );

  it('a typed character through the same pipeline does cancel', async () => {
    const { fixture, seen } = await pressThroughHandler('x');

    expect(seen[0]!.input).toBe('x');
    expect(fixture.cancelNextStepsCountdown).toHaveBeenCalled();
  });

  it('a pointer report cancels once the composer holds text', async () => {
    const { fixture } = await pressThroughHandler('\x1b[<0;12;4M', {
      buffer: 'half typed',
      cursor: 10,
    });

    expect(fixture.cancelNextStepsCountdown).toHaveBeenCalled();
  });
});
