'use client';
import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Counts up from 0 to `value` on mount (ease-out). Respects
 * prefers-reduced-motion. Takes a `suffix` STRING (e.g. "%"), not a
 * formatter function — a function prop can't cross the server/client
 * boundary from a Server Component (Next.js can only pass serializable
 * props, or Server Actions, into a Client Component; a plain arrow function
 * throws "Functions cannot be passed directly to Client Components" at
 * runtime), and this is meant to be rendered straight from Server Component
 * pages like the dashboard.
 */
export function AnimatedNumber({
  value,
  duration = 800,
  suffix = '',
}: {
  value: number;
  duration?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(prefersReducedMotion() ? value : 0);
  const mounted = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = mounted.current ? display : 0;
    mounted.current = true;
    function step(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {Math.round(display).toLocaleString()}
      {suffix}
    </span>
  );
}

/** A thin bar that grows from 0 to `percent` width on mount. Respects prefers-reduced-motion. */
export function AnimatedBar({
  percent,
  className = 'bg-primary',
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const [width, setWidth] = useState(prefersReducedMotion() ? clamped : 0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${className}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
