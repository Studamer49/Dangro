import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Scroll behaviour that honours the Settings "Animations" toggle (and the OS
 * reduced-motion preference). JS `scrollIntoView` ignores the CSS
 * `scroll-behavior` rule, so call sites read the value from here instead of
 * hard-coding `"smooth"`.
 */
export function scrollBehavior(): ScrollBehavior {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    return "auto";
  }
  return useSettingsStore.getState().animationsEnabled ? "smooth" : "auto";
}
