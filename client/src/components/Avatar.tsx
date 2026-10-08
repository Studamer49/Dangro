import type { User } from "@/types";

interface AvatarProps {
  user?: Pick<User, "username" | "avatar"> | null;
  className?: string;
}

export default function Avatar({ user, className = "" }: AvatarProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-600 font-bold ${className}`}
    >
      {user?.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        user?.username?.[0]?.toUpperCase() ?? "?"
      )}
    </span>
  );
}