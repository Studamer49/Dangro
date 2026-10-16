import { useEffect, useState } from "react";
import Media, { type MediaAnimation } from "@/components/Media";

interface ProfileAvatarProps {
  username: string;
  avatar?: string | null;
  className?: string;
  /**
   * The profile identity avatar animates by default: opening a profile is
   * exactly the moment the user asked to see the video/GIF move. Other callers
   * can pass `"hover"` to fall back to the pointer-gated behaviour.
   */
  animation?: MediaAnimation;
}

/**
 * The identity avatar: the one large avatar on the profile.
 *
 * Kept separate from the shared `Avatar` because this one owns the image
 * fallback state — it swaps in initials when a URL 404s, which the list avatar
 * deliberately does not do. The placeholder is an accent gradient rather than a
 * flat fill so the initials still look lit, and the caller passes `ring-lit`
 * when it wants the halo (the class is applied from the outside so the rim and
 * the surrounding layout stay in charge of the composition).
 */
export default function ProfileAvatar({
  username,
  avatar,
  className = "h-20 w-20 text-3xl",
  animation = "always",
}: ProfileAvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatar]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent-500 to-accent-700 font-bold text-white ${className}`}
    >
      {avatar && !failed ? (
        <Media
          src={avatar}
          alt={username}
          animation={animation}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        username[0]?.toUpperCase() ?? "?"
      )}
    </div>
  );
}