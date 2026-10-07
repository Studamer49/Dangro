import type { User } from "@/types";

const STATUS_DOT: Record<User["status"], string> = {
  online: "bg-green-500",
  idle: "bg-yellow-500",
  dnd: "bg-red-500",
  offline: "bg-gray-500",
};

interface UserAvatarProps {
  username: string;
  avatar?: string | null;
  status?: User["status"];
}

export default function UserAvatar({ username, avatar, status }: UserAvatarProps) {
  return (
    <div className="relative h-10 w-10 shrink-0">
      {avatar ? (
        <img src={avatar} alt={username} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-600 text-sm font-bold text-white">
          {username[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-gray-900 ${STATUS_DOT[status]}`}
        />
      )}
    </div>
  );
}
