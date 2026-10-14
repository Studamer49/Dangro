import { useCallback, useRef } from "react";

/**
 * Tiny bounce animations for taps/clicks.
 *
 * Uses the Web Animations API instead of CSS classes + React state so that:
 *  - a re-click restarts from the beginning (we cancel the previous run),
 *  - React re-renders never wipe a class mid-flight,
 *  - the animation is always finite (one iteration) and releases the element
 *    when it finishes.
 *
 * Every animation ends at `transform: scale(1)`, so the element settles back
 * to its resting shape and never loops.
 */
export type BounceVariant = "tap" | "pop" | "like";

const KEYFRAMES: Record<BounceVariant, Keyframe[]> = {
  // Gentle press feedback for nav tabs and list rows.
  tap: [
    { transform: "scale(1)" },
    { transform: "scale(0.94)", offset: 0.4 },
    { transform: "scale(1.03)", offset: 0.7 },
    { transform: "scale(1)" },
  ],
  // Softer pop for icons and server buttons.
  pop: [
    { transform: "scale(1)" },
    { transform: "scale(1.16)", offset: 0.35 },
    { transform: "scale(0.97)", offset: 0.6 },
    { transform: "scale(1.04)", offset: 0.8 },
    { transform: "scale(1)" },
  ],
  // Like heart: pulls in, then overshoots before settling.
  like: [
    { transform: "scale(1)" },
    { transform: "scale(0.88)", offset: 0.2 },
    { transform: "scale(1.2)", offset: 0.5 },
    { transform: "scale(0.97)", offset: 0.72 },
    { transform: "scale(1)" },
  ],
};

const DURATION: Record<BounceVariant, number> = {
  tap: 520,
  pop: 600,
  like: 680,
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useBounce<T extends Element = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const animationRef = useRef<Animation | null>(null);

  const bounce = useCallback((variant: BounceVariant = "tap") => {
    const el = ref.current;
    // Older browsers without Element.animate simply skip the flourish.
    if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return;

    // Cancel any in-flight run so a rapid second click replays cleanly from 0.
    animationRef.current?.cancel();
    const animation = el.animate(KEYFRAMES[variant], {
      duration: DURATION[variant],
      easing: "cubic-bezier(0.34, 1.25, 0.5, 1)",
      iterations: 1,
      fill: "none",
    });
    animationRef.current = animation;
  }, []);

  return { ref, bounce };
}
