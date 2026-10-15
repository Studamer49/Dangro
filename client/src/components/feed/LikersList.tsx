import Avatar from "@/components/Avatar";
import type { User } from "@/types";

interface LikersListProps {
  users: User[] | null;
  loading: boolean;
  emptyLabel?: string;
}

/**
 * The rows shown when an author opens "who liked". Shared by the post
 * context-menu and the story viewer panel so both read the same.
 */
export default function LikersList({ users, loading, emptyLabel = "No likes yet" }: LikersListProps) {
  if (loading) {
    return <p className="px-2.5 py-2 text-sm text-gray-400">Loading…</p>;
  }

  if (!users || users.length === 0) {
    return <p className="px-2.5 py-2 text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <div className="max-h-64 space-y-0.5 overflow-y-auto">
      {users.map((user) => (
        <div key={user.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/5">
          <Avatar user={user} className="h-7 w-7 text-xs" />
          <span className="truncate text-sm font-medium text-gray-200">{user.username}</span>
        </div>
      ))}
    </div>
  );
}
