/**
 * Shared type definitions for the Dangro platform.
 * These serve as documentation and can be used as a reference
 * for TypeScript migration in the future.
 *
 * @typedef {Object} User
 * @property {string} username
 * @property {string} password
 * @property {string} displayName
 * @property {string} bio
 * @property {'online'|'idle'|'dnd'|'offline'} status
 * @property {string} customStatus
 * @property {string} profilePic
 *
 * @typedef {Object} Server
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {Channel[]} channels
 *
 * @typedef {Object} Channel
 * @property {string} id
 * @property {string} name
 *
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} sender
 * @property {string} content
 * @property {string} timestamp
 * @property {boolean} isImage
 * @property {boolean} system
 * @property {Object<string, string[]>} reactions
 * @property {{ sender: string, content: string }|null} replyTo
 *
 * @typedef {Object} Friend
 * @property {string} id
 * @property {string} username
 * @property {string} discriminator
 * @property {'online'|'idle'|'dnd'|'offline'|'pending_in'|'pending_out'} status
 * @property {string} customStatus
 * @property {string} avatarColor
 * @property {string} profilePic
 *
 * @typedef {Object} GroupChat
 * @property {string} id
 * @property {string} name
 * @property {string[]} members
 * @property {string} createdBy
 * @property {string} createdAt
 *
 * @typedef {Object} YouTubeVideo
 * @property {string} id
 * @property {string} title
 * @property {string} channelName
 * @property {string} views
 * @property {string} likes
 * @property {string} thumbnail
 *
 * @typedef {Object} InstagramPost
 * @property {string} id
 * @property {string} username
 * @property {string} userAvatarColor
 * @property {string} image
 * @property {number} likes
 * @property {string} caption
 * @property {boolean} liked
 * @property {{ username: string, text: string }[]} comments
 *
 * @typedef {Object} AppState
 * @property {User|null} user
 * @property {Server[]} servers
 * @property {Friend[]} friends
 * @property {GroupChat[]} groupChats
 * @property {Object<string, Message[]>} messages
 * @property {'channel'|'dm'|'group'} activeChatType
 * @property {string} activeServerId
 * @property {string} activeChannelId
 * @property {string|null} activeDmFriendId
 * @property {string|null} activeGroupChatId
 * @property {'servers'|'groupchats'|'dms'} activeNavTab
 * @property {string} activeLeftTab
 * @property {string} displayName
 * @property {string} bio
 * @property {string} status
 * @property {string} customStatus
 * @property {string} profilePic
 * @property {number} leftPanelWidth
 * @property {number} rightPanelWidth
 * @property {boolean} leftPanelCollapsed
 * @property {boolean} rightPanelCollapsed
 * @property {YouTubeVideo[]} youtubeVideos
 * @property {InstagramPost[]} instagramPosts
 * @property {string} activeYtVideoId
 * @property {string} friendSearchQuery
 * @property {string} chatSearchQuery
 * @property {string} activeFriendSubtab
 */

export {};
