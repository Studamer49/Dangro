import type { ReactNode } from "react";
import type { User } from "@/types";
import UserAvatar from "@/components/friends/UserAvatar";

interface UserRowProps {
  username: string;
  avatar?: string | null;
  status?: User["status"];
  meta?: ReactNode;
  actions: ReactNode;
}

/**
 * One person in one of the Friends lists.
 *
 * A repeated content item, so it gets card treatment rather than panel
 * treatment: lighter frost and a lower shadow, because twenty of these stack
 * down the page and anything heavier turns the list into a wall. The hover
 * lift is small on purpose — the list is click-dense and the rows should not
 * jump out from under the cursor.
 */
export default function UserRow({ username, avatar, status, meta, actions }: UserRowProps) {
  return (
    <div className="glass-card glass-card-hover flex items-center justify-between gap-3 rounded-xl p-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar username={username} avatar={avatar} status={status} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-white">{username}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-gray-400">{meta}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}