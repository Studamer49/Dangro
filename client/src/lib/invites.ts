/**
 * Pull invite codes out of message text.
 *
 * A shareable invite link is `<origin>/invite/<code>`; people paste the whole
 * thing. The code is always lowercase alphanumeric (see the server's
 * `normalizeCode`), and a message rarely needs more than a couple of embeds,
 * so this returns a short, de-duplicated list in the order they appear.
 */

const INVITE_IN_TEXT = /\/invite\/([a-z0-9]{4,32})/gi;

const MAX_EMBEDS_PER_MESSAGE = 3;

export function extractInviteCodes(text: string | null | undefined): string[] {
  if (!text || !text.includes("/invite/")) return [];

  const seen = new Set<string>();
  const codes: string[] = [];
  for (const match of text.matchAll(INVITE_IN_TEXT)) {
    const code = match[1]?.toLowerCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= MAX_EMBEDS_PER_MESSAGE) break;
  }
  return codes;
}
