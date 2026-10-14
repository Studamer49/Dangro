export interface User {
  id: string;
  username: string;
  email: string;
  bio: string | null;
  avatar: string | null;
  /** Profile banner image; null falls back to the accent gradient cover. */
  cover?: string | null;
  /** When true, this profile's posts are hidden from non-followers. */
  isPrivate?: boolean;
  status: "online" | "idle" | "dnd" | "offline";
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}

export type Role = "owner" | "admin" | "moderator" | "member";

export interface Server {
  id: string;
  name: string;
  icon: string | null;
  description?: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  members?: Member[];
  channels?: Channel[];
  categories?: Category[];
  roles?: ServerRole[];
  _count?: { members: number };
}

/** A server ban: a user barred from rejoining until the ban is lifted. */
export interface Ban {
  id: string;
  serverId: string;
  userId: string;
  /** The moderator who issued the ban; null if that account is later deleted. */
  moderatorId: string | null;
  reason: string | null;
  createdAt: string;
  user?: Pick<User, "id" | "username" | "avatar">;
  moderator?: Pick<User, "id" | "username"> | null;
}

export interface Member {
  id: string;
  userId: string;
  serverId: string;
  nickname?: string | null;
  /** Legacy single role. `roleIds` is the real answer now. */
  role: Role;
  /** Every role this member holds. */
  roleIds?: string[];
  /** Highest position among those roles; drives the hierarchy in the UI. */
  position?: number;
  isOwner?: boolean;
  joinedAt: string;
  user?: User;
}

/** A per-server role: a named bundle of permissions, ordered by position. */
export interface ServerRole {
  id: string;
  serverId: string;
  name: string;
  color: string | null;
  position: number;
  permissions: string[];
  /** The implicit baseline every member holds; cannot be deleted. */
  isEveryone: boolean;
  /** Shown separately in the member list rather than folded into a tag. */
  hoist: boolean;
  memberCount?: number;
}

export interface PermissionMeta {
  label: string;
  description: string;
}

export interface PermissionGroup {
  name: string;
  permissions: Record<string, PermissionMeta>;
}

/** A Discord-style folder grouping channels in the sidebar. */
export interface Category {
  id: string;
  name: string;
  serverId: string;
  position: number;
  channels?: Channel[];
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  topic?: string | null;
  serverId: string;
  categoryId?: string | null;
  position: number;
  createdAt: string;
  messages?: Message[];
}

/** A managed server invite with its own expiry and use cap. */
export interface Invite {
  id: string;
  code: string;
  serverId: string;
  channelId: string | null;
  inviterId: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  /** Server-computed, so the UI does not re-derive expiry from the clock. */
  expired: boolean;
  exhausted: boolean;
  url: string;
  channel?: { id: string; name: string } | null;
  inviter?: Partial<User>;
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
  /** The other user's id — a friendship is stored as two directed rows. */
  id: string;
  createdAt: string;
  friend?: User;
}

export interface Conversation {
  id: string;
  otherUser: User;
  lastMessage: DirectMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  status: "active" | "pending";
  requestSenderId: string | null;
}

export interface DirectMessage {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  /** Cloudinary asset id, present only for images uploaded through Cloudinary. */
  attachmentPublicId?: string | null;
  replyToId: string | null;
  edited: boolean;
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

export interface StoryGroup {
  author: User;
  stories: Story[];
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
  /** Spelled `roomId` everywhere else (callStore, socket handlers). */
  roomId: string;
  startedAt: string;
  endedAt: string | null;
}
