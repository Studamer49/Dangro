import { Link } from "react-router-dom";
import type { User } from "@/types";

interface AvatarProps {
  user?: Pick<User, "id" | "username" | "avatar"> | null;
  className?: string;
  /**
   * Wraps the picture in a link to the user's profile. Turn it off where the
   * avatar already sits inside a button or a call overlay.
   */
  linkToProfile?: boolean;
  status?: User["status"];
  lit?: boolean;
}

/**
 * Status colour: the online/away/busy/offline dot. Kept as a small palette
 * rather than the full accent system because it reads as a signal, not chrome.
 */
const STATUS_STYLES: Record<User["status"], { dot: string; ring: string }> = {
  online: { dot: "bg-emerald-400", ring: "" },
  idle: { dot: "bg-amber-400", ring: "shadow-[0_0_8px_1px_rgb(245_158_11/0.5)]" },
  dnd: { dot: "bg-red-500", ring: "shadow-[0_0_8px_1px_rgb(239_68_68/0.5)]" },
  offline: { dot: "bg-gray-500", ring: "" },
};

export default function Avatar({
  user,
  className = "",
  linkToProfile = true,
  status,
  lit = false,
}: AvatarProps) {
  // Gradient from the accent hue keeps the placeholder initials from looking
  // like a flat grey block, while still tracking whatever accent is selected.
  const avatar = (
    <span className={`relative inline-flex shrink-0 select-none ${className}`}>
      <span
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent-500 to-accent-700 font-bold text-white ${
          lit ? "ring-lit" : ""
        }`}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          user?.username?.[0]?.toUpperCase() ?? "?"
        )}
      </span>

      {status && (
        <span
          className={`status-dot bottom-0 right-0 h-[30%] min-h-[8px] w-[30%] min-w-[8px] ${
            STATUS_STYLES[status].dot
          } ${STATUS_STYLES[status].ring}`}
          aria-label={status}
        />
      )}
    </span>
  );

  if (linkToProfile && user?.id) {
    return (
      <Link
        to={`/profile/${user.id}`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex"
        aria-label={`View ${user.username}'s profile`}
      >
        {avatar}
      </Link>
    );
  }

  return avatar;
}
