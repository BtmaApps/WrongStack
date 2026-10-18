'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AMBIENT_NODES, startAmbientBackground } from './ambient-engine';
import { useAmbientMotion } from './AmbientMotionProvider';
import './animated-background.css';

function Geometry({ kind }: { kind: number }) {
  switch (kind % 6) {
    case 0:
      return (
        <>
          <circle r="28" />
          <circle r="18" strokeDasharray="3 8" />
          <path d="M-36 0h10M26 0h10M0-36v10M0 26v10" />
          <circle cx="28" cy="0" r="2" fill="currentColor" />
        </>
      );
    case 1:
      return (
        <>
          <path d="m0-22 24 13v27L0 32-24 18V-9Zm0 27L24-9M0 5-24-9M0 5v27" />
          <path d="M-10-16 14-3" strokeDasharray="2 5" />
        </>
      );
    case 2:
      return (
        <>
          <path d="M-32 8h22L2-8h30" />
          <circle cx="-32" cy="8" r="3" />
          <circle cx="32" cy="-8" r="3" />
          <path d="M-6 18h18" />
        </>
      );
    case 3:
      return (
        <>
          <rect x="-21" y="-24" width="42" height="48" rx="5" />
          <path d="M-12-12H4M-12-4h24M-12 4h17M-12 14h6" />
          <circle cx="14" cy="-15" r="2" />
        </>
      );
    case 4:
      return (
        <>
          <path d="m0-19 19 19L0 19-19 0Zm0-28v8M0 20v8M-28 0h8M20 0h8" />
          <circle r="3" />
        </>
      );
    default:
      return (
        <>
          <path d="M-22-10v-12h12M10-22h12v12M22 10v12H10M-10 22h-12V10M-7 0H7M0-7V7" />
          <circle cx="22" cy="22" r="2" fill="currentColor" />
        </>
      );
  }
}

/** Bounded SVG decoration; all motion lives in one imperative, pausable loop. */
export function AnimatedBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof startAmbientBackground> | null>(null);
  const { enabled, preference } = useAmbientMotion();
  useEffect(() => {
    if (!ref.current) return;
    const controller = startAmbientBackground(ref.current, { interactionsEnabled: false });
    engine.current = controller;
    return () => {
      controller.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setInteractionsEnabled(enabled, preference === 'on');
  }, [enabled, preference]);
  return (
    <div
      ref={ref}
      className={cn('ambient-background', className)}
      aria-hidden="true"
      data-motion="static"
      data-interactions={enabled ? 'on' : 'off'}
      data-motion-preference={preference}
      data-active-bursts="0"
    >
      <svg
        className="ambient-layer ambient-field"
        viewBox="0 0 1440 900"
        fill="none"
        focusable="false"
        aria-hidden="true"
      >
        {AMBIENT_NODES.map((node, index) => (
          <g
            key={node.phase}
            data-ambient-node=""
            data-tone={index % 4 === 0 ? 'pink' : index % 3 === 0 ? 'orange' : 'neutral'}
            transform={`translate(${node.x * 1440} ${node.y * 900})`}
            opacity={(0.35 + Math.abs(node.x - 0.5) * 0.7) * (0.55 + node.depth * 0.4)}
          >
            <Geometry kind={index} />
          </g>
        ))}
      </svg>
      <svg
        className="ambient-layer ambient-effects"
        viewBox="0 0 1440 900"
        fill="none"
        focusable="false"
        aria-hidden="true"
      >
        {AMBIENT_NODES.map((node, index) => (
          <g
            key={node.phase}
            data-ambient-echo=""
            data-tone={index % 4 === 0 ? 'pink' : index % 3 === 0 ? 'orange' : 'neutral'}
            opacity="0"
          >
            <Geometry kind={index} />
            <circle data-relay-ring="" r="1" opacity="0" />
          </g>
        ))}
        {Array.from({ length: 12 }, (_, index) => (
          <circle
            key={index}
            data-ambient-trail=""
            data-tone="pink"
            r="1.2"
            fill="currentColor"
            stroke="none"
            opacity="0"
          />
        ))}
        <g data-pointer-field="" opacity="0">
          <circle
            data-pointer-orbit=""
            r="11"
            data-tone="pink"
            strokeDasharray="3 14"
            opacity="0.2"
          />
          <circle r="1.3" data-tone="orange" fill="currentColor" stroke="none" opacity="0.25" />
        </g>
        {[0, 1, 2, 3].map((slot) => (
          <g
            key={slot}
            data-ambient-burst=""
            data-tone={slot % 2 ? 'pink' : 'orange'}
            style={{ display: 'none' }}
          >
            <circle data-ring="" r="1" />
            <circle data-ring-secondary="" r="1" opacity="0.4" strokeDasharray="3 5" />
            {[0, 1, 2, 3, 4, 5].map((particle) => (
              <path key={particle} data-particle="" d="M-2 0h4" />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
