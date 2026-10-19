import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Canonical Oxog signature, with the Mammoth studio's repeating stroke animation. */
export function OxogMark({
  animated = false,
  className,
}: {
  animated?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!animated) return;
    let inView = !('IntersectionObserver' in window);
    const sync = () => setSeen(inView && !document.hidden);
    const observer =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => {
              inView = entry?.isIntersecting ?? false;
              sync();
            },
            { threshold: 0.2 },
          )
        : null;
    if (ref.current) observer?.observe(ref.current);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [animated]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 130"
      fill="none"
      aria-hidden="true"
      className={cn('oxog-mark', className)}
      data-animate={animated}
      data-seen={seen}
    >
      <path
        className="oxog-stroke"
        d="M93 56 72 35C49 13 14 24 9 53 3 84 23 104 46 103"
        stroke="#ed0878"
        strokeWidth="12"
      />
      <path
        className="oxog-stroke oxog-stroke--second"
        d="M146 25c24-7 45 10 47 34 3 26-16 46-39 44-14-1-24-11-41-27"
        stroke="#ed0878"
        strokeWidth="12"
      />
      <path
        className="oxog-stroke oxog-stroke--loop"
        d="M76 18c30-20 75 1 77 40 1 12-1 24-6 33M53 36c-19 41 14 84 50 79 9-1 16-3 22-7"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        className="oxog-stroke oxog-stroke--slash"
        d="m74 87 54-51"
        stroke="#ed0878"
        strokeWidth="12"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function OxogWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display font-bold tracking-tight', className)}>
      oxog<span className="font-normal opacity-60">net</span>
      <span className="text-[#ed0878]">.</span>
    </span>
  );
}
