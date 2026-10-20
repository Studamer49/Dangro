import Media from "@/components/Media";
import type { User } from "@/types";

/**
 * Presence colours are keyed to the status, not the theme — "this person is
 * busy" has to mean the same thing in every theme.
 */
const STATUS_DOT: Record<User["status"], string> = {
  online: "bg-emerald-400",
  idle: "bg-amber-400",
  dnd: "bg-red-500",
  offline: "bg-gray-500",
};

interface UserAvatarProps {
  username: string;
  avatar?: string | null;
  status?: User["status"];
}

/**
 * The list-row avatar. Separate from the shared `Avatar` because these rows are
 * dense and the image here is the user's *name* in alt text rather than a
 * decorative echo of text already on screen.
 *
 * The 1px rim keeps a pale photo from dissolving into a pale glass card, and
 * the placeholder gradient tracks the selected accent instead of sitting there
 * as a flat grey block.
 */
export default function UserAvatar({ username, avatar, status }: UserAvatarProps) {
  return (
    <div className="relative h-10 w-10 shrink-0">
      {avatar ? (
        <Media
          src={avatar}
          alt={username}
          className="h-10 w-10 rounded-full object-cover ring-1 ring-white/15"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-sm font-bold text-white ring-1 ring-white/15">
          {username[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      {status && (
        <span
          aria-label={status}
          className={`status-dot -bottom-0.5 -right-0.5 h-3 w-3 ${STATUS_DOT[status]}`}
        />
      )}
    </div>
  );
}