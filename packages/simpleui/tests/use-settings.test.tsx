// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { type UseSettingsResult, useSettings } from '../src/hooks/use-settings.js';
import { DEFAULT_PREFS, parsePrefs } from '../src/lib/prefs-model.js';
import type { SimpleSocket } from '../src/lib/ws.js';

/**
 * Behavior coverage for the `useSettings` hook (plan B1 final slice,
 * extracted from simple-ui-session.tsx). Pins the initial state, the
 * `updatePrefs` / `switchAutonomy` wire ops (including the enhanceLanguage
 * co-patch), and the ref-sync contract the global shortcuts handler relies
 * on.
 *
 * Harness mirrors the sibling hook tests: jsdom + real `createRoot` + `act`,
 * no testing-library dependency.
 */

interface RecordedSend {
  type: string;
  payload: Record<string, unknown>;
}

interface Captured {
  current: UseSettingsResult | null;
}

function makeSocketStub(): {
  ref: React.RefObject<SimpleSocket | null>;
  sends: Array<RecordedSend>;
} {
  const sends: Array<RecordedSend> = [];
  // Structurally unrelated to the SimpleSocket class (private fields) —
  // cast through `unknown`, same pattern as the sibling hook tests.
  const ref = {
    current: {
      send: (type: string, payload: Record<string, unknown>) => {
        sends.push({ type, payload });
      },
    },
  } as unknown as React.RefObject<SimpleSocket | null>;
  return { ref, sends };
}

function renderProbe(captured: Captured, socket: ReturnType<typeof makeSocketStub>): Root {
  function Probe(): null {
    captured.current = useSettings({ socketRef: socket.ref });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  return root;
}

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe('useSettings — initial state', () => {
  it('starts with DEFAULT_PREFS, the settings panel closed, and synced refs', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    expect(captured.current?.prefs).toEqual(DEFAULT_PREFS);
    expect(captured.current?.settingsOpen).toBe(false);
    expect(captured.current?.prefsRef.current).toEqual(DEFAULT_PREFS);
    expect(captured.current?.settingsOpenRef.current).toBe(false);

    roots.push(root);
  });
});

describe('useSettings — updatePrefs', () => {
  it('applies the patch locally and pushes prefs.update', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.updatePrefs({ showModelReasoning: false });
    });

    expect(captured.current?.prefs.showModelReasoning).toBe(false);
    expect(socket.sends).toEqual([
      { type: 'prefs.update', payload: { showModelReasoning: false } },
    ]);

    roots.push(root);
  });

  it('co-patches enhanceLanguage when enhanceEnabled is set', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.updatePrefs({ enhanceEnabled: true });
    });

    expect(captured.current?.prefs.enhanceEnabled).toBe(true);
    expect(socket.sends).toEqual([
      { type: 'prefs.update', payload: { enhanceEnabled: true, enhanceLanguage: 'english' } },
    ]);

    roots.push(root);
  });

  it('applies a showTabTitle patch, pushes prefs.update, and flags isAtDefaults', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    expect(captured.current?.isAtDefaults).toBe(true);
    act(() => {
      captured.current?.updatePrefs({ showTabTitle: false });
    });

    expect(captured.current?.prefs.showTabTitle).toBe(false);
    expect(captured.current?.isAtDefaults).toBe(false);
    expect(socket.sends).toEqual([{ type: 'prefs.update', payload: { showTabTitle: false } }]);

    roots.push(root);
  });
});

describe('useSettings — isAtDefaults coverage', () => {
  // Round-6: `subagentModelPlan` is a resettable pref — resetPrefs spreads
  // DEFAULT_PREFS (so the plan IS restored) and keeps it in the durable
  // prefs.update payload — but it was missing from shallowEqualPrefs' key
  // list. Omitting a key breaks isAtDefaults, and the panel disables its
  // "Reset to defaults" button on `isAtDefaults`, so editing only the
  // subagent model plan left the button permanently disabled.
  it('flags isAtDefaults=false when only the subagent model plan changes', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    expect(captured.current?.isAtDefaults).toBe(true);

    act(() => {
      captured.current?.updatePrefs({
        subagentModelPlan: {
          ...DEFAULT_PREFS.subagentModelPlan,
          slots: [{ provider: 'anthropic', model: 'claude-opus-4' }],
        },
      });
    });

    expect(captured.current?.prefs.subagentModelPlan.slots).toHaveLength(1);
    // Must be false — the plan is a user-editable, resettable pref.
    expect(
      captured.current?.isAtDefaults,
      "FAIL: editing subagentModelPlan left isAtDefaults=true, so the panel's " +
        '"Reset to defaults" button stays disabled and the plan cannot be reset.',
    ).toBe(false);

    roots.push(root);
  });

  it('returns to isAtDefaults=true after resetPrefs restores the plan', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.updatePrefs({
        subagentModelPlan: {
          ...DEFAULT_PREFS.subagentModelPlan,
          slots: [{ provider: 'anthropic', model: 'claude-opus-4' }],
        },
      });
    });
    expect(captured.current?.isAtDefaults).toBe(false);

    act(() => {
      captured.current?.resetPrefs();
    });

    // Control: the plan was actually restored, so the equality must hold.
    expect(captured.current?.prefs.subagentModelPlan).toEqual(DEFAULT_PREFS.subagentModelPlan);
    expect(captured.current?.isAtDefaults).toBe(true);

    roots.push(root);
  });

  it('stays at isAtDefaults=true after a server echo of the SAME defaults', () => {
    // Guard against a reference-comparison fix: `parsePrefs` runs
    // `parseSubagentModelPlan`, which allocates a NEW plan object on every
    // `prefs.updated` frame. A `!==` compare against DEFAULT_PREFS would then
    // report "not at defaults" forever once the server echoes, re-enabling the
    // reset button with nothing actually changed.
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.setPrefs(parsePrefs({ ...DEFAULT_PREFS }));
    });

    // Same content, different object identity — must still compare equal.
    expect(captured.current?.prefs.subagentModelPlan).not.toBe(DEFAULT_PREFS.subagentModelPlan);
    expect(captured.current?.prefs.subagentModelPlan).toEqual(DEFAULT_PREFS.subagentModelPlan);
    expect(captured.current?.isAtDefaults).toBe(true);

    roots.push(root);
  });
});

describe('useSettings — switchAutonomy', () => {
  it('updates prefs.autonomy and sends autonomy.switch', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.switchAutonomy('auto');
    });

    expect(captured.current?.prefs.autonomy).toBe('auto');
    expect(socket.sends).toEqual([{ type: 'autonomy.switch', payload: { mode: 'auto' } }]);

    roots.push(root);
  });
});

describe('useSettings — refs track live values', () => {
  it('keeps prefsRef and settingsOpenRef in sync across updates', () => {
    const captured: Captured = { current: null };
    const socket = makeSocketStub();
    const root = renderProbe(captured, socket);

    act(() => {
      captured.current?.updatePrefs({ yolo: true });
    });
    expect(captured.current?.prefsRef.current?.yolo).toBe(true);

    act(() => {
      captured.current?.setSettingsOpen(true);
    });
    expect(captured.current?.settingsOpen).toBe(true);
    expect(captured.current?.settingsOpenRef.current).toBe(true);

    roots.push(root);
  });
});
