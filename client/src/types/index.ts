export interface User {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  avatar: string | null;
  status: "online" | "idle" | "dnd" | "offline";
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export interface Server {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  members?: Member[];
  channels?: Channel[];
  _count?: { members: number };
}

export interface Member {
  id: string;
  userId: string;
  serverId: string;
  role: "owner" | "admin" | "moderator" | "member";
  joinedAt: string;
  user?: User;
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  serverId: string;
  createdAt: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  content: string;
  authorId: string;
  channelId: string;
  replyToId: string | null;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  author?: User;
  attachments?: Attachment[];
  reactions?: Reaction[];
  replyTo?: Message;
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  messageId: string;
  createdAt: string;
  user?: User;
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  messageId: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  userId: string;
  fromUserId: string | null;
  serverId: string | null;
  channelId: string | null;
  read: boolean;
  createdAt: string;
  fromUser?: User;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  sender?: User;
  receiver?: User;
}

export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  createdAt: string;
  friend?: User;
}
