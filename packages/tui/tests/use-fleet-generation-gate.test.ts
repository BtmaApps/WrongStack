import { render } from 'ink-testing-library';
import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useFleetGenerationGate } from '../src/hooks/use-fleet-generation-gate.js';
import { Text } from '../src/ink.js';

describe('useFleetGenerationGate', () => {
  describe('with sessionGenerationRef', () => {
    it('tracks agent at current generation', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate({ current: 0 });
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      gate!.track('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);
    });

    it('returns false for agent tracked at previous generation', () => {
      const genRef = { current: 0 };
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        const [, forceUpdate] = useState(0);
        gate = useFleetGenerationGate(genRef);
        // Force re-render when genRef changes
        React.useEffect(() => {
          if (genRef.current > 0) forceUpdate((n) => n + 1);
        }, [genRef.current]);
        return React.createElement(Text, null, 'test');
      }

      // Mount with gen 0
      render(React.createElement(Harness));
      gate!.track('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);

      // Change genRef value but keep same object
      genRef.current = 1;
      // Track a new agent at gen 1 - since the genRef object identity is the same,
      // the useCallback deps haven't changed but the .current value has
      // isLive reads genRef.current at call time, so it sees the new value
      expect(gate!.isLive('agent-1')).toBe(false);
    });

    it('returns true for untracked agent (unknown)', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate({ current: 0 });
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      expect(gate!.isLive('unknown-agent')).toBe(true);
    });

    it('forget removes agent from tracking', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate({ current: 0 });
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      gate!.track('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);
      gate!.forget('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);
    });

    it('forget does not throw for unknown agent', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate({ current: 0 });
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      expect(() => gate!.forget('non-existent')).not.toThrow();
    });

    it('isLive returns true after generation bump for unknown agent', () => {
      const genRef = { current: 0 };
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate(genRef);
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      genRef.current = 5;
      expect(gate!.isLive('some-agent')).toBe(true);
    });

    it('keeps gating an agent whose entry the bounding sweep evicted', () => {
      // Regression (r3, 2026-09-19): the bounding sweep deletes spawn entries
      // with gen < cur - 1 to bound the map, and isLive's allow-unknown then
      // treated the evicted id as never-tracked — an agent that survived two
      // /clears flipped from gated-out to ALLOWED and its late events leaked
      // into the fresh session. Evicted ids are tombstoned instead.
      const genRef = { current: 1 };
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate(genRef);
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      gate!.track('agent-stale');
      gate!.track('agent-mid');
      genRef.current = 3;
      gate!.track('agent-new'); // sweep runs: agent-stale (gen 1 < 2) evicted

      expect(gate!.isLive('agent-stale')).toBe(false);
      expect(gate!.isLive('agent-new')).toBe(true);
      // Immediately-previous generation (gen 2) is kept in the map, not swept.
      expect(gate!.isLive('agent-mid')).toBe(false);
      expect(gate!.isLive('totally-unknown')).toBe(true);
    });

    it('track re-arms a swept agent observed at the current generation', () => {
      // useDirectorFleetBridge re-tracks agents it still sees in the
      // director's status after a /clear — a live observation at the current
      // generation overrides the eviction tombstone.
      const genRef = { current: 1 };
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate(genRef);
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      gate!.track('agent-1');
      genRef.current = 3;
      gate!.track('agent-2'); // sweep evicts agent-1
      expect(gate!.isLive('agent-1')).toBe(false);
      gate!.track('agent-1'); // still listed as live fleet work
      expect(gate!.isLive('agent-1')).toBe(true);
    });

    it('forget re-allows a swept agent (removal semantics)', () => {
      // Pinned by 'forget removes agent from tracking': removal always
      // re-allows. forget must also clear the eviction tombstone.
      const genRef = { current: 1 };
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate(genRef);
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      gate!.track('agent-1');
      genRef.current = 3;
      gate!.track('agent-2'); // sweep evicts agent-1
      expect(gate!.isLive('agent-1')).toBe(false);
      gate!.forget('agent-1'); // subagent.removed
      expect(gate!.isLive('agent-1')).toBe(true);
    });
  });

  describe('without sessionGenerationRef', () => {
    it('isLive always returns true', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate();
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      expect(gate!.isLive('any-agent')).toBe(true);
      gate!.track('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);
      gate!.forget('agent-1');
      expect(gate!.isLive('agent-1')).toBe(true);
    });

    it('track is a no-op', () => {
      let gate: ReturnType<typeof useFleetGenerationGate> | null = null;
      function Harness(): React.ReactElement {
        gate = useFleetGenerationGate();
        return React.createElement(Text, null, 'test');
      }
      render(React.createElement(Harness));
      expect(() => gate!.track('agent-1')).not.toThrow();
    });
  });
});
