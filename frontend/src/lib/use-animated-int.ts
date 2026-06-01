"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lightweight rAF-based integer count-up for hero numbers.
 *
 * - Animates from previous value to `target` over `duration` ms.
 * - Honors `prefers-reduced-motion`: returns the target instantly.
 * - Cancels in-flight tweens when `target` changes (no zigzag).
 * - Always rounds to integer — fits "229 km" style displays.
 *
 * Intentionally minimal; we don't bring in a tween library for one number.
 */
export function useAnimatedInt(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion || duration <= 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = value;
    const delta = target - from;
    if (delta === 0) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic — quick start, gentle land. Feels native on mobile.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + delta * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally exclude `value` from deps: we only want to retween
    // when the *target* changes, using whatever value is currently shown
    // as the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
