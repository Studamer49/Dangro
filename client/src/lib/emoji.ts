/**
 * Twemoji (Twitter's open-source set, the artwork Discord uses) is published as
 * one SVG per emoji, named by its code points in hex. The picker and reaction
 * chips render those images so a reaction looks identical on every platform
 * instead of falling back to the OS font.
 *
 * Twemoji drops the trailing variation selector from a lone emoji, so `❤️`
 * (U+2764 U+FE0F) is `2764.svg`, while a zero-width-joiner sequence keeps every
 * selector. The curated reaction set only contains lone emojis, which is what
 * the two-point rule below covers.
 */
const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.0.3/assets/svg";

export function twemojiCodePoint(emoji: string): string {
  const points = Array.from(emoji, (char) => char.codePointAt(0) ?? 0);
  if (points.length === 2 && points[1] === 0xfe0f) points.pop();
  return points.map((point) => point.toString(16)).join("-");
}

export function twemojiUrl(emoji: string): string {
  return `${TWEMOJI_BASE}/${twemojiCodePoint(emoji)}.svg`;
}
