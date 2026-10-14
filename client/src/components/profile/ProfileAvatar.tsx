import { useEffect, useState } from "react";

interface ProfileAvatarProps {
  username: string;
  avatar?: string | null;
  className?: string;
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
        <img
          src={avatar}
          alt={username}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        username[0]?.toUpperCase() ?? "?"
      )}
    </div>
  );
}