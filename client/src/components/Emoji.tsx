import { useState } from "react";
import { twemojiUrl } from "@/lib/emoji";

interface EmojiProps {
  emoji: string;
  /** Square glyph size; the image is always square. */
  className?: string;
  title?: string;
  /** Marks the artwork as decorative when nearby text already names it. */
  decorative?: boolean;
}

/**
 * Renders an emoji with Discord's Twemoji artwork. If the image cannot load
 * (offline, blocked CDN) it falls back to the native glyph so a reaction is
 * never lost.
 */
export default function Emoji({ emoji, className = "h-5 w-5", title, decorative }: EmojiProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        title={title}
        aria-hidden={decorative || undefined}
        className="inline-flex items-center justify-center text-base leading-none"
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={twemojiUrl(emoji)}
      alt={decorative ? "" : emoji}
      title={title}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 select-none ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
