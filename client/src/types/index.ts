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

export interface Conversation {
  id: string;
  otherUser: User;
  lastMessage: DirectMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  replyToId: string | null;
  readAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: User;
  replyTo?: DirectMessage;
}

export interface Post {
  id: string;
  authorId: string;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  author?: User;
  media?: PostMedia[];
  likes?: PostLike[];
  comments?: PostComment[];
  _count?: { likes: number; comments: number };
}

export interface PostMedia {
  id: string;
  postId: string;
  url: string;
  type: string;
  order: number;
  width: number | null;
  height: number | null;
}

export interface PostLike {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author?: User;
}

export interface Story {
  id: string;
  authorId: string;
  mediaUrl: string;
  mediaType: string;
  createdAt: string;
  expiresAt: string;
  author?: User;
}

export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: string;
  status: string;
  roomID: string;
  startedAt: string;
  endedAt: string | null;
}
