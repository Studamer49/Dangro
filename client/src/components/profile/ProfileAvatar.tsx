import { useEffect, useState } from "react";

interface ProfileAvatarProps {
  username: string;
  avatar?: string | null;
  className?: string;
}

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
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-600 font-bold text-white ${className}`}
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
