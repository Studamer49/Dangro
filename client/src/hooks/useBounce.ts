import { useCallback, useEffect, useRef } from "react";

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
export type BounceVariant = "subtle" | "tap" | "pop" | "like";

const KEYFRAMES: Record<BounceVariant, Keyframe[]> = {
  // Barely-there press feedback for the hundreds of small buttons (search,
  // settings, send, add-media…). Noticeable only if you look for it.
  subtle: [
    { transform: "scale(1)" },
    { transform: "scale(0.975)", offset: 0.4 },
    { transform: "scale(1.012)", offset: 0.72 },
    { transform: "scale(1)" },
  ],
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
  subtle: 220,
  tap: 520,
  pop: 600,
  like: 680,
};

const EASING: Record<BounceVariant, string> = {
  subtle: "cubic-bezier(0.22, 1, 0.36, 1)",
  tap: "cubic-bezier(0.34, 1.25, 0.5, 1)",
  pop: "cubic-bezier(0.34, 1.25, 0.5, 1)",
  like: "cubic-bezier(0.34, 1.25, 0.5, 1)",
};

/** The most recent bounce we started per element, so a re-click cancels it. */
const running = new WeakMap<Element, Animation>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Plays one finite bounce on any element. Exported so a single document-level
 * listener can bounce buttons that never opted into the hook themselves.
 */
export function playBounce(el: Element | null, variant: BounceVariant = "subtle"): void {
  // Older browsers without Element.animate simply skip the flourish.
  if (!el || typeof (el as HTMLElement).animate !== "function" || prefersReducedMotion()) return;

  // Cancel any in-flight run so a rapid second click replays cleanly from 0.
  running.get(el)?.cancel();
  const animation = el.animate(KEYFRAMES[variant], {
    duration: DURATION[variant],
    easing: EASING[variant],
    iterations: 1,
    fill: "none",
  });
  running.set(el, animation);
  animation.onfinish = () => {
    if (running.get(el) === animation) running.delete(el);
  };
}

export function useBounce<T extends Element = HTMLElement>() {
  const ref = useRef<T | null>(null);

  const bounce = useCallback((variant: BounceVariant = "tap") => {
    playBounce(ref.current, variant);
  }, []);

  return { ref, bounce };
}

/**
 * Everything that should read as "press" feedback. Real `<button>`s plus the
 * other things people click that are not buttons: anchors/links, `<summary>`
 * disclosure toggles, anything wearing a button-ish ARIA role, colour swatches,
 * and any element explicitly opting in with `data-bounce-subtle`.
 */
const CLICKABLE_SELECTOR = [
  "button",
  "a[href]",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'input[type="color"]',
  "[data-bounce-subtle]",
].join(", ");

/**
 * App-wide press feedback: one capture-phase listener on `document` plays the
 * subtle bounce on whichever clickable element was pressed.
 *
 * Opt an element out when it already animates itself with `data-bounce="self"`,
 * or suppress it entirely with `data-no-bounce` (e.g. invisible tap zones).
 * Elements that are not buttons can opt in with `data-bounce-subtle`.
 */
export function useGlobalButtonBounce(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const el = target.closest(CLICKABLE_SELECTOR);
      if (!(el instanceof HTMLElement)) return;
      if (el.dataset.bounce === "self") return;
      if (el.dataset.noBounce !== undefined) return;
      // Skip anything the browser or the app has marked as not actionable.
      if (el.matches(":disabled, [disabled], [aria-disabled='true']")) return;

      playBounce(el, "subtle");
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
}
