/**
 * MongoDB model registry.
 *
 * This is a hand-written mirror of `prisma/schema.prisma`. It is the only
 * place that needs editing when a model changes: the query engine
 * (`mongoWhere` / `mongoPopulate`) is driven entirely by the metadata below.
 *
 * Ids stay UUID strings stored in `_id` so that documents are identical
 * across both backends — the same id works in Postgres and Mongo, which keeps
 * payloads stable for the client and for socket payloads.
 */

/** Where the foreign key that defines this relation lives. */
export interface RelationDef {
  /** Property name on the model, matching the Prisma relation name. */
  name: string;
  /** Model this relation points at. */
  target: string;
  /** "many" returns an array, "one" returns a single document or null. */
  kind: "one" | "many";
  /** Foreign key on THIS model (belongs-to / many-to-one). */
  ownKey?: string;
  /** Foreign key on the TARGET model (has-many / has-one). */
  backKey?: string;
  /** Sort applied when loading a "many" relation, matching Prisma's default. */
  orderBy?: Record<string, "asc" | "desc">;
}

export interface ModelDef {
  name: string;
  collection: string;
  /** Scalar fields with their declared defaults; null means optional. */
  fields: Record<string, { type: "string" | "number" | "boolean" | "date"; optional?: boolean; default?: unknown }>;
  relations: RelationDef[];
  /** Compound unique indexes, keyed by the Prisma compound key name. */
  uniques: Record<string, string[]>;
  /** Prisma uses `orderBy: { createdAt: "asc" }` for these by default. */
  defaultOrder: Record<string, "asc" | "desc">;
}

const relation = (
  name: string,
  target: string,
  kind: "one" | "many",
  key: { ownKey?: string; backKey?: string; orderBy?: Record<string, "asc" | "desc"> }
): RelationDef => ({ name, target, kind, ...key });

export const MODELS: Record<string, ModelDef> = {
  user: {
    name: "user",
    collection: "users",
    fields: {
      username: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      bio: { type: "string", optional: true },
      avatar: { type: "string", optional: true },
      status: { type: "string", default: "offline" },
      lastSeen: { type: "date", default: () => new Date() },
      createdAt: { type: "date", default: () => new Date() },
      updatedAt: { type: "date", default: () => new Date() },
    },
    uniques: { username: ["username"], email: ["email"] },
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("ownedServers", "server", "many", { backKey: "ownerId", orderBy: { createdAt: "desc" } }),
      relation("memberships", "member", "many", { backKey: "userId" }),
      relation("sentMessages", "message", "many", { backKey: "authorId", orderBy: { createdAt: "desc" } }),
      relation("reactions", "reaction", "many", { backKey: "userId" }),
      relation("sentFriendRequests", "friendRequest", "many", { backKey: "senderId" }),
      relation("receivedFriendRequests", "friendRequest", "many", { backKey: "receiverId" }),
      relation("friendships1", "friend", "many", { backKey: "userId" }),
      relation("friendships2", "friend", "many", { backKey: "friendId" }),
      relation("blockedUsers1", "block", "many", { backKey: "userId" }),
      relation("blockedUsers2", "block", "many", { backKey: "blockedId" }),
      relation("notifications", "notification", "many", { backKey: "userId", orderBy: { createdAt: "desc" } }),
      relation("sentNotifications", "notification", "many", { backKey: "fromUserId", orderBy: { createdAt: "desc" } }),
      relation("attachments", "attachment", "many", { backKey: "userId" }),
      relation("conversations1", "conversation", "many", { backKey: "user1Id" }),
      relation("conversations2", "conversation", "many", { backKey: "user2Id" }),
      relation("sentDMs", "directMessage", "many", { backKey: "senderId" }),
      relation("posts", "post", "many", { backKey: "authorId", orderBy: { createdAt: "desc" } }),
      relation("postLikes", "postLike", "many", { backKey: "userId" }),
      relation("postComments", "postComment", "many", { backKey: "authorId" }),
      relation("stories", "story", "many", { backKey: "authorId", orderBy: { createdAt: "desc" } }),
      relation("followers", "follow", "many", { backKey: "followingId" }),
      relation("following", "follow", "many", { backKey: "followerId" }),
      relation("sentCalls", "call", "many", { backKey: "callerId" }),
      relation("receivedCalls", "call", "many", { backKey: "receiverId" }),
    ],
  },

  friendRequest: {
    name: "friendRequest",
    collection: "friend_requests",
    fields: {
      senderId: { type: "string" },
      receiverId: { type: "string" },
      status: { type: "string", default: "pending" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { senderId_receiverId: ["senderId", "receiverId"] },
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("sender", "user", "one", { ownKey: "senderId" }),
      relation("receiver", "user", "one", { ownKey: "receiverId" }),
    ],
  },

  friend: {
    name: "friend",
    collection: "friends",
    fields: {
      userId: { type: "string" },
      friendId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { userId_friendId: ["userId", "friendId"] },
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("friend", "user", "one", { ownKey: "friendId" }),
    ],
  },

  block: {
    name: "block",
    collection: "blocks",
    fields: {
      userId: { type: "string" },
      blockedId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { userId_blockedId: ["userId", "blockedId"] },
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("blocked", "user", "one", { ownKey: "blockedId" }),
    ],
  },

  server: {
    name: "server",
    collection: "servers",
    fields: {
      name: { type: "string" },
      icon: { type: "string", optional: true },
      ownerId: { type: "string" },
      inviteCode: { type: "string", default: () => crypto.randomUUID() },
      createdAt: { type: "date", default: () => new Date() },
      updatedAt: { type: "date", default: () => new Date() },
    },
    uniques: { inviteCode: ["inviteCode"] },
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("owner", "user", "one", { ownKey: "ownerId" }),
      relation("members", "member", "many", { backKey: "serverId" }),
      relation("channels", "channel", "many", { backKey: "serverId" }),
    ],
  },

  member: {
    name: "member",
    collection: "members",
    fields: {
      userId: { type: "string" },
      serverId: { type: "string" },
      role: { type: "string", default: "member" },
      joinedAt: { type: "date", default: () => new Date() },
    },
    uniques: { userId_serverId: ["userId", "serverId"] },
    defaultOrder: { joinedAt: "asc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("server", "server", "one", { ownKey: "serverId" }),
    ],
  },

  channel: {
    name: "channel",
    collection: "channels",
    fields: {
      name: { type: "string" },
      type: { type: "string", default: "text" },
      serverId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("server", "server", "one", { ownKey: "serverId" }),
      relation("messages", "message", "many", { backKey: "channelId", orderBy: { createdAt: "desc" } }),
    ],
  },

  message: {
    name: "message",
    collection: "messages",
    fields: {
      content: { type: "string" },
      authorId: { type: "string" },
      channelId: { type: "string" },
      replyToId: { type: "string", optional: true },
      edited: { type: "boolean", default: false },
      createdAt: { type: "date", default: () => new Date() },
      updatedAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("author", "user", "one", { ownKey: "authorId" }),
      relation("channel", "channel", "one", { ownKey: "channelId" }),
      relation("replyTo", "message", "one", { ownKey: "replyToId" }),
      relation("replies", "message", "many", { backKey: "replyToId", orderBy: { createdAt: "asc" } }),
      relation("reactions", "reaction", "many", { backKey: "messageId" }),
      relation("attachments", "attachment", "many", { backKey: "messageId" }),
    ],
  },

  reaction: {
    name: "reaction",
    collection: "reactions",
    fields: {
      emoji: { type: "string" },
      userId: { type: "string" },
      messageId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { userId_messageId_emoji: ["userId", "messageId", "emoji"] },
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("message", "message", "one", { ownKey: "messageId" }),
    ],
  },

  attachment: {
    name: "attachment",
    collection: "attachments",
    fields: {
      filename: { type: "string" },
      url: { type: "string" },
      size: { type: "number" },
      mimeType: { type: "string" },
      messageId: { type: "string" },
      userId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("message", "message", "one", { ownKey: "messageId" }),
      relation("user", "user", "one", { ownKey: "userId" }),
    ],
  },

  notification: {
    name: "notification",
    collection: "notifications",
    fields: {
      type: { type: "string" },
      message: { type: "string" },
      userId: { type: "string" },
      fromUserId: { type: "string", optional: true },
      serverId: { type: "string", optional: true },
      channelId: { type: "string", optional: true },
      read: { type: "boolean", default: false },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("fromUser", "user", "one", { ownKey: "fromUserId" }),
    ],
  },

  conversation: {
    name: "conversation",
    collection: "conversations",
    fields: {
      user1Id: { type: "string" },
      user2Id: { type: "string" },
      lastMessageAt: { type: "date", optional: true },
      status: { type: "string", default: "active" },
      requestSenderId: { type: "string", optional: true },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { user1Id_user2Id: ["user1Id", "user2Id"] },
    defaultOrder: { lastMessageAt: "desc" },
    relations: [
      relation("user1", "user", "one", { ownKey: "user1Id" }),
      relation("user2", "user", "one", { ownKey: "user2Id" }),
      relation("messages", "directMessage", "many", { backKey: "conversationId", orderBy: { createdAt: "asc" } }),
    ],
  },

  directMessage: {
    name: "directMessage",
    collection: "direct_messages",
    fields: {
      content: { type: "string" },
      senderId: { type: "string" },
      conversationId: { type: "string" },
      attachmentUrl: { type: "string", optional: true },
      attachmentType: { type: "string", optional: true },
      replyToId: { type: "string", optional: true },
      edited: { type: "boolean", default: false },
      readAt: { type: "date", optional: true },
      deliveredAt: { type: "date", optional: true },
      createdAt: { type: "date", default: () => new Date() },
      updatedAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("sender", "user", "one", { ownKey: "senderId" }),
      relation("conversation", "conversation", "one", { ownKey: "conversationId" }),
      relation("replyTo", "directMessage", "one", { ownKey: "replyToId" }),
      relation("replies", "directMessage", "many", { backKey: "replyToId", orderBy: { createdAt: "asc" } }),
    ],
  },

  post: {
    name: "post",
    collection: "posts",
    fields: {
      authorId: { type: "string" },
      caption: { type: "string", optional: true },
      createdAt: { type: "date", default: () => new Date() },
      updatedAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("author", "user", "one", { ownKey: "authorId" }),
      relation("media", "postMedia", "many", { backKey: "postId" }),
      relation("likes", "postLike", "many", { backKey: "postId" }),
      relation("comments", "postComment", "many", { backKey: "postId", orderBy: { createdAt: "asc" } }),
    ],
  },

  postMedia: {
    name: "postMedia",
    collection: "post_media",
    fields: {
      postId: { type: "string" },
      url: { type: "string" },
      type: { type: "string" },
      order: { type: "number", default: 0 },
      width: { type: "number", optional: true },
      height: { type: "number", optional: true },
    },
    uniques: {},
    defaultOrder: { order: "asc" },
    relations: [relation("post", "post", "one", { ownKey: "postId" })],
  },

  postLike: {
    name: "postLike",
    collection: "post_likes",
    fields: {
      postId: { type: "string" },
      userId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { postId_userId: ["postId", "userId"] },
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("user", "user", "one", { ownKey: "userId" }),
      relation("post", "post", "one", { ownKey: "postId" }),
    ],
  },

  postComment: {
    name: "postComment",
    collection: "post_comments",
    fields: {
      postId: { type: "string" },
      authorId: { type: "string" },
      content: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: {},
    defaultOrder: { createdAt: "asc" },
    relations: [
      relation("author", "user", "one", { ownKey: "authorId" }),
      relation("post", "post", "one", { ownKey: "postId" }),
    ],
  },

  story: {
    name: "story",
    collection: "stories",
    fields: {
      authorId: { type: "string" },
      mediaUrl: { type: "string" },
      mediaType: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
      expiresAt: { type: "date" },
    },
    uniques: {},
    defaultOrder: { createdAt: "desc" },
    relations: [relation("author", "user", "one", { ownKey: "authorId" })],
  },

  follow: {
    name: "follow",
    collection: "follows",
    fields: {
      followerId: { type: "string" },
      followingId: { type: "string" },
      createdAt: { type: "date", default: () => new Date() },
    },
    uniques: { followerId_followingId: ["followerId", "followingId"] },
    defaultOrder: { createdAt: "desc" },
    relations: [
      relation("follower", "user", "one", { ownKey: "followerId" }),
      relation("following", "user", "one", { ownKey: "followingId" }),
    ],
  },

  call: {
    name: "call",
    collection: "calls",
    fields: {
      callerId: { type: "string" },
      receiverId: { type: "string" },
      type: { type: "string" },
      status: { type: "string", default: "ringing" },
      roomID: { type: "string" },
      startedAt: { type: "date", default: () => new Date() },
      endedAt: { type: "date", optional: true },
    },
    uniques: {},
    defaultOrder: { startedAt: "desc" },
    relations: [
      relation("caller", "user", "one", { ownKey: "callerId" }),
      relation("receiver", "user", "one", { ownKey: "receiverId" }),
    ],
  },
};

export function getModel(name: string): ModelDef {
  const model = MODELS[name];
  if (!model) throw new Error(`Unknown model "${name}" — add it to mongoSchema.ts`);
  return model;
}

/** Prisma exposes models as `prisma.directMessage`; this maps that to the registry key. */
export function resolveModelName(key: string): string {
  if (MODELS[key]) return key;
  throw new Error(`Unknown model "${key}" — add it to mongoSchema.ts`);
}