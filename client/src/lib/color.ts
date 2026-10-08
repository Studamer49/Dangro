/** Build a 50→950 Tailwind-style scale from a single brand hex color. */

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const to = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Mix a hex color toward another by `weight` (0 = current, 1 = target). */
function mix(from: string, target: string, weight: number): string {
  const [fr, fg, fb] = parseHex(from);
  const [tr, tg, tb] = parseHex(target);
  const w = Math.max(0, Math.min(1, weight));
  return toHex(fr + (tr - fr) * w, fg + (tg - fg) * w, fb + (tb - fb) * w);
}

export function buildAccentScale(base: string): Record<string, string> {
  const white = "#ffffff";
  const black = "#000000";
  return {
    "50": mix(base, white, 0.9),
    "100": mix(base, white, 0.78),
    "200": mix(base, white, 0.6),
    "300": mix(base, white, 0.42),
    "400": mix(base, white, 0.25),
    "500": mix(base, white, 0.12),
    "600": base,
    "700": mix(base, black, 0.15),
    "800": mix(base, black, 0.3),
    "900": mix(base, black, 0.45),
    "950": mix(base, black, 0.6),
  };
}

/** Convert a hex color to an `r g b` triplet (for `rgb(var(…-rgb) / α)` CSS). */
export function rgbTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex);
  return `${r} ${g} ${b}`;
}