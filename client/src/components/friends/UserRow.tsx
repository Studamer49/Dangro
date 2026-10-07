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

export default function UserRow({ username, avatar, status, meta, actions }: UserRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-900 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar username={username} avatar={avatar} status={status} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{username}</p>
          {meta && <p className="truncate text-xs text-gray-400">{meta}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}
