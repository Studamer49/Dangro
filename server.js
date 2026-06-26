const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const { initDB, getDB } = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let PORT = parseInt(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

initDB();

// ============ IN-MEMORY STATE ============
const onlineUsers = new Map(); // userId -> { ws, user }
const userSockets = new Map(); // userId -> Set<ws>
const sessions = new Map(); // token -> userId

function broadcastToUser(userId, message) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    const data = JSON.stringify(message);
    sockets.forEach(ws => {
      if (ws.readyState === 1) ws.send(data);
    });
  }
}

function broadcastToChatKey(chatKey, message, excludeUserId) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.userId && client.userId !== excludeUserId) {
      // Check if user has access to this chat
      if (hasChatAccess(client.userId, chatKey)) {
        client.send(data);
      }
    }
  });
}

function hasChatAccess(userId, chatKey) {
  if (chatKey.startsWith('dm_')) {
    const parts = chatKey.split('_');
    return parts.length >= 2 && parts.slice(1).includes(userId);
  }
  if (chatKey.startsWith('group_')) {
    const db = getDB();
    const groupId = chatKey.replace('group_', '');
    const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    return !!member;
  }
  // channel chat: serverId_channelId
  const serverId = chatKey.split('_')[0];
  const db = getDB();
  const member = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
  return !!member;
}

// ============ REST API ============

// Signup
app.post('/api/signup', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const display = displayName || username;

  db.prepare('INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(id, username, hash, display);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, id);
  sessions.set(token, id);

  res.json({ token, user: { id, username, displayName: display, bio: '', status: 'online', customStatus: '', profilePic: '', theme: 'dark' } });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  sessions.set(token, user.id);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      bio: user.bio,
      status: user.status,
      customStatus: user.custom_status,
      profilePic: user.profile_pic,
      theme: user.theme
    }
  });
});

// Verify token
app.post('/api/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const db = getDB();
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  sessions.set(token, user.id);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      bio: user.bio,
      status: user.status,
      customStatus: user.custom_status,
      profilePic: user.profile_pic,
      theme: user.theme
    }
  });
});

// Health check (used by frontend for server discovery)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', port: server.address().port, name: 'dangro' });
});

// Browse public servers
app.get('/api/servers/browse', (req, res) => {
  const db = getDB();
  const servers = db.prepare(`
    SELECT s.*, u.username as owner_name, 
      (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
    FROM servers s JOIN users u ON s.owner_id = u.id
    WHERE s.is_public = 1
    ORDER BY s.created_at DESC
  `).all();
  res.json({ servers });
});

// Get messages for a chat key
app.get('/api/messages/:chatKey', (req, res) => {
  const { chatKey } = req.params;
  const { token } = req.query;
  if (!token) return res.status(401).json({ error: 'Auth required' });

  const db = getDB();
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });

  const messages = db.prepare(`
    SELECT m.*, u.display_name as sender_name
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.chat_key = ?
    ORDER BY m.timestamp ASC
    LIMIT 200
  `).all(chatKey);

  // Attach reactions
  const result = messages.map(msg => {
    const reactions = db.prepare('SELECT user_id, emoji FROM reactions WHERE message_id = ?').all(msg.id);
    const reactionsObj = {};
    reactions.forEach(r => {
      if (!reactionsObj[r.emoji]) reactionsObj[r.emoji] = [];
      reactionsObj[r.emoji].push(r.user_id);
    });
    return {
      id: msg.id,
      sender: msg.sender_name,
      senderId: msg.sender_id,
      content: msg.content,
      timestamp: msg.timestamp,
      isImage: !!msg.is_image,
      system: !!msg.system,
      replyTo: msg.reply_to ? JSON.parse(msg.reply_to) : null,
      reactions: reactionsObj
    };
  });

  res.json({ messages: result });
});

// ============ WEBSOCKET ============
wss.on('connection', (ws) => {
  ws.userId = null;
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(ws, msg);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (ws.userId) {
      const sockets = userSockets.get(ws.userId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          userSockets.delete(ws.userId);
          onlineUsers.delete(ws.userId);
          notifyFriendsStatus(ws.userId, 'offline');
        }
      }
    }
  });

  ws.send(JSON.stringify({ type: 'connected', message: 'Connected to Dangro server' }));
});

function handleMessage(ws, msg) {
  const { type } = msg;

  switch (type) {
    case 'auth': {
      const { token } = msg;
      const db = getDB();
      const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
      if (!session) return ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
      if (!user) return ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));

      ws.userId = user.id;
      if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
      userSockets.get(user.id).add(ws);

      const wasOffline = !onlineUsers.has(user.id);
      onlineUsers.set(user.id, user);

      // Send init data
      const userData = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        bio: user.bio,
        status: user.status,
        customStatus: user.custom_status,
        profilePic: user.profile_pic,
        theme: user.theme
      };

      // Get friends
      const friends = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.bio, u.status, u.custom_status, u.profile_pic,
          f.status as friend_status
        FROM friends f JOIN users u ON (f.friend_id = u.id)
        WHERE f.user_id = ? AND f.status = 'accepted'
        UNION
        SELECT u.id, u.username, u.display_name, u.bio, u.status, u.custom_status, u.profile_pic,
          f.status as friend_status
        FROM friends f JOIN users u ON (f.user_id = u.id)
        WHERE f.friend_id = ? AND f.status = 'accepted'
      `).all(user.id, user.id);

      // Get pending requests
      const pendingIn = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.status, u.profile_pic
        FROM friends f JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
      `).all(user.id);

      const pendingOut = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.status, u.profile_pic
        FROM friends f JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
      `).all(user.id);

      // Get servers user is a member of
      const servers = db.prepare(`
        SELECT s.*, u.username as owner_name,
          (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
        FROM servers s
        JOIN server_members sm ON s.id = sm.server_id
        JOIN users u ON s.owner_id = u.id
        WHERE sm.user_id = ?
      `).all(user.id);

      // Get channels for each server
      const serversWithChannels = servers.map(s => {
        const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY name').all(s.id);
        return { ...s, channels };
      });

      // Get group chats
      const groupChats = db.prepare(`
        SELECT gc.*, u.username as owner_name
        FROM group_chats gc
        JOIN group_members gm ON gc.id = gm.group_id
        JOIN users u ON gc.owner_id = u.id
        WHERE gm.user_id = ?
      `).all(user.id);

      const groupsWithMembers = groupChats.map(g => {
        const members = db.prepare(`
          SELECT u.id, u.username, u.display_name, u.status
          FROM group_members gm JOIN users u ON gm.user_id = u.id
          WHERE gm.group_id = ?
        `).all(g.id);
        return { ...g, members: members.map(m => ({ id: m.id, username: m.username, displayName: m.display_name, status: m.status })) };
      });

      // Get all users (for adding friends)
      const allUsers = db.prepare('SELECT id, username, display_name, status FROM users WHERE id != ?').all(user.id);

      ws.send(JSON.stringify({
        type: 'init',
        user: userData,
        friends: friends.map(f => ({
          id: f.id, username: f.username, displayName: f.display_name,
          discriminator: f.id.substring(0, 4), status: onlineUsers.has(f.id) ? 'online' : (f.status || 'offline'),
          customStatus: f.custom_status || '', avatarColor: '#555', profilePic: f.profile_pic || ''
        })),
        pendingRequests: {
          incoming: pendingIn.map(u => ({ id: u.id, username: u.username, displayName: u.display_name })),
          outgoing: pendingOut.map(u => ({ id: u.id, username: u.username, displayName: u.display_name }))
        },
        servers: serversWithChannels,
        groupChats: groupsWithMembers,
        allUsers: allUsers.map(u => ({ id: u.id, username: u.username, displayName: u.display_name }))
      }));

      if (wasOffline) notifyFriendsStatus(user.id, 'online');
      break;
    }

    case 'message:send': {
      if (!ws.userId) return;
      const { chatKey, content, replyTo } = msg;
      if (!chatKey || !content) return;

      const db = getDB();
      const id = uuidv4();
      const user = onlineUsers.get(ws.userId);
      const isImage = !!(content.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) || content.startsWith('https://images.unsplash.com/'));

      db.prepare('INSERT INTO messages (id, chat_key, sender_id, content, is_image, reply_to) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, chatKey, ws.userId, content, isImage ? 1 : 0, replyTo ? JSON.stringify(replyTo) : null
      );

      const message = {
        id,
        sender: user ? user.display_name : 'Unknown',
        senderId: ws.userId,
        content,
        timestamp: new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        isImage,
        system: false,
        replyTo: replyTo || null,
        reactions: {}
      };

      // Send to sender
      ws.send(JSON.stringify({ type: 'message:new', chatKey, message }));

      // Broadcast to others with access
      broadcastToChatKey(chatKey, { type: 'message:new', chatKey, message }, ws.userId);
      break;
    }

    case 'typing': {
      if (!ws.userId) return;
      const { chatKey, isTyping } = msg;
      const user = onlineUsers.get(ws.userId);
      broadcastToChatKey(chatKey, { type: 'typing', chatKey, username: user ? user.display_name : 'Someone', isTyping }, ws.userId);
      break;
    }

    case 'message:react': {
      if (!ws.userId) return;
      const { messageId, emoji } = msg;
      if (!messageId || !emoji) return;

      const db = getDB();
      const existing = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, ws.userId, emoji);

      if (existing) {
        db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, ws.userId, emoji);
      } else {
        db.prepare('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?)').run(messageId, ws.userId, emoji);
      }

      broadcastToChatKey(msg.chatKey || '', { type: 'message:reacted', messageId, emoji, userId: ws.userId, active: !existing }, ws.userId);
      ws.send(JSON.stringify({ type: 'message:reacted', messageId, emoji, userId: ws.userId, active: !existing }));
      break;
    }

    case 'friend:request': {
      if (!ws.userId) return;
      const { username } = msg;
      if (!username) return;

      const db = getDB();
      const target = db.prepare('SELECT id, username, display_name FROM users WHERE username = ?').get(username);
      if (!target) return ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
      if (target.id === ws.userId) return ws.send(JSON.stringify({ type: 'error', message: 'Cannot add yourself' }));

      const existing = db.prepare('SELECT status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').get(ws.userId, target.id, target.id, ws.userId);
      if (existing) return ws.send(JSON.stringify({ type: 'error', message: existing.status === 'accepted' ? 'Already friends' : 'Request already pending' }));

      db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, "pending")').run(ws.userId, target.id);
      ws.send(JSON.stringify({ type: 'friend:request:sent', to: { id: target.id, username: target.username, displayName: target.display_name } }));

      // Notify target if online
      const user = onlineUsers.get(ws.userId);
      broadcastToUser(target.id, {
        type: 'friend:request:incoming',
        from: { id: ws.userId, username: user ? user.username : 'Unknown', displayName: user ? user.display_name : 'Unknown' }
      });
      break;
    }

    case 'friend:accept': {
      if (!ws.userId) return;
      const { friendId } = msg;
      if (!friendId) return;

      const db = getDB();
      const request = db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = "pending"').get(friendId, ws.userId);
      if (!request) return ws.send(JSON.stringify({ type: 'error', message: 'No pending request' }));

      db.prepare('UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?').run(friendId, ws.userId);

      // Also create reverse entry
      const reverse = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(ws.userId, friendId);
      if (!reverse) {
        db.prepare('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, "accepted")').run(ws.userId, friendId);
      } else {
        db.prepare('UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?').run(ws.userId, friendId);
      }

      const friend = db.prepare('SELECT id, username, display_name, status, custom_status, profile_pic FROM users WHERE id = ?').get(friendId);
      const user = onlineUsers.get(ws.userId);

      const friendData = {
        id: friend.id, username: friend.username, displayName: friend.display_name,
        discriminator: friend.id.substring(0, 4), status: onlineUsers.has(friend.id) ? 'online' : 'offline',
        customStatus: friend.custom_status || '', avatarColor: '#555', profilePic: friend.profile_pic || ''
      };

      ws.send(JSON.stringify({ type: 'friend:accepted', friend: friendData }));

      // Notify the other user
      const userData = {
        id: ws.userId, username: user ? user.username : 'Unknown', displayName: user ? user.display_name : 'Unknown',
        discriminator: ws.userId.substring(0, 4), status: 'online',
        customStatus: user ? user.custom_status || '' : '', avatarColor: '#555', profilePic: user ? user.profile_pic || '' : ''
      };
      broadcastToUser(friendId, { type: 'friend:accepted', friend: userData });
      break;
    }

    case 'friend:remove': {
      if (!ws.userId) return;
      const { friendId } = msg;

      const db = getDB();
      db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(ws.userId, friendId, friendId, ws.userId);

      ws.send(JSON.stringify({ type: 'friend:removed', friendId }));
      broadcastToUser(friendId, { type: 'friend:removed', friendId: ws.userId });
      break;
    }

    case 'server:create': {
      if (!ws.userId) return;
      const { name, icon } = msg;
      if (!name) return;

      const db = getDB();
      const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + uuidv4().substring(0, 6);
      const inviteCode = uuidv4().substring(0, 8);

      db.prepare('INSERT INTO servers (id, name, icon, owner_id, invite_code) VALUES (?, ?, ?, ?, ?)').run(id, name, icon || 'S', ws.userId, inviteCode);
      db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(id, ws.userId);

      // Create default channel
      db.prepare('INSERT INTO channels (id, server_id, name) VALUES (?, ?, ?)').run('general', id, 'general');

      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
      ws.send(JSON.stringify({
        type: 'server:created',
        server: { ...server, channels: [{ id: 'general', name: 'general' }], member_count: 1 }
      }));
      break;
    }

    case 'server:join': {
      if (!ws.userId) return;
      const { inviteCode } = msg;

      const db = getDB();
      const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(inviteCode);
      if (!server) return ws.send(JSON.stringify({ type: 'error', message: 'Invalid invite code' }));

      const already = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(server.id, ws.userId);
      if (already) return ws.send(JSON.stringify({ type: 'error', message: 'Already a member' }));

      db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(server.id, ws.userId);

      const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(server.id);
      ws.send(JSON.stringify({
        type: 'server:joined',
        server: { ...server, channels, member_count: db.prepare('SELECT COUNT(*) as c FROM server_members WHERE server_id = ?').get(server.id).c }
      }));

      // Notify server members
      const user = onlineUsers.get(ws.userId);
      broadcastToChatKey(server.id + '_general', {
        type: 'message:new',
        chatKey: server.id + '_general',
        message: {
          id: uuidv4(), sender: 'System', content: (user ? user.display_name : 'Someone') + ' joined the server',
          timestamp: new Date().toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          system: true, reactions: {}, replyTo: null, isImage: false
        }
      }, null);
      break;
    }

    case 'channel:create': {
      if (!ws.userId) return;
      const { serverId, name } = msg;
      if (!serverId || !name) return;

      const db = getDB();
      const channelId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
      const existing = db.prepare('SELECT 1 FROM channels WHERE id = ? AND server_id = ?').get(channelId, serverId);
      if (existing) return ws.send(JSON.stringify({ type: 'error', message: 'Channel already exists' }));

      db.prepare('INSERT INTO channels (id, server_id, name) VALUES (?, ?, ?)').run(channelId, serverId, name);
      ws.send(JSON.stringify({ type: 'channel:created', serverId, channel: { id: channelId, name } }));
      break;
    }

    case 'group:create': {
      if (!ws.userId) return;
      const { name, memberIds } = msg;
      if (!name || !memberIds || !memberIds.length) return;

      const db = getDB();
      const id = uuidv4();

      db.prepare('INSERT INTO group_chats (id, name, owner_id) VALUES (?, ?, ?)').run(id, name, ws.userId);
      db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(id, ws.userId);

      const allMembers = [ws.userId, ...memberIds];
      const insertMember = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)');
      allMembers.forEach(mid => insertMember.run(id, mid));

      const user = onlineUsers.get(ws.userId);
      const members = allMembers.map(mid => {
        const u = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(mid);
        return u ? { id: u.id, username: u.username, displayName: u.display_name, status: onlineUsers.has(mid) ? 'online' : 'offline' } : null;
      }).filter(Boolean);

      ws.send(JSON.stringify({ type: 'group:created', group: { id, name, owner_id: ws.userId, members, owner_name: user ? user.display_name : 'Unknown' } }));
      break;
    }

    case 'profile:update': {
      if (!ws.userId) return;
      const { displayName, bio, status, customStatus, profilePic, theme } = msg;

      const db = getDB();
      const updates = [];
      const params = [];
      if (displayName !== undefined) { updates.push('display_name = ?'); params.push(displayName); }
      if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (customStatus !== undefined) { updates.push('custom_status = ?'); params.push(customStatus); }
      if (profilePic !== undefined) { updates.push('profile_pic = ?'); params.push(profilePic); }
      if (theme !== undefined) { updates.push('theme = ?'); params.push(theme); }

      if (updates.length) {
        params.push(ws.userId);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
      if (user) onlineUsers.set(ws.userId, user);

      ws.send(JSON.stringify({ type: 'profile:updated', profile: { id: ws.userId, displayName: user ? user.display_name : displayName, bio: user ? user.bio : bio, status: user ? user.status : status, customStatus: user ? user.custom_status : customStatus, profilePic: user ? user.profile_pic : profilePic, theme: user ? user.theme : theme } }));
      break;
    }

    case 'call:offer': {
      if (!ws.userId) return;
      const { targetUserId, sdp } = msg;
      const user = onlineUsers.get(ws.userId);
      broadcastToUser(targetUserId, { type: 'call:offer', fromUserId: ws.userId, username: user ? user.display_name : 'Unknown', sdp });
      break;
    }

    case 'call:answer': {
      if (!ws.userId) return;
      const { targetUserId, sdp } = msg;
      broadcastToUser(targetUserId, { type: 'call:answer', fromUserId: ws.userId, sdp });
      break;
    }

    case 'call:ice': {
      if (!ws.userId) return;
      const { targetUserId, candidate } = msg;
      broadcastToUser(targetUserId, { type: 'call:ice', fromUserId: ws.userId, candidate });
      break;
    }

    case 'call:end': {
      if (!ws.userId) return;
      const { targetUserId } = msg;
      broadcastToUser(targetUserId, { type: 'call:ended', fromUserId: ws.userId });
      break;
    }
  }
}

function notifyFriendsStatus(userId, status) {
  const db = getDB();
  const friends = db.prepare(`
    SELECT user_id FROM friends WHERE friend_id = ? AND status = 'accepted'
    UNION
    SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'
  `).all(userId, userId);

  friends.forEach(f => {
    broadcastToUser(f.user_id, { type: 'user:status', userId, status });
  });
}

// Heartbeat
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Cleanup old sessions periodically
setInterval(() => {
  const db = getDB();
  db.prepare('DELETE FROM sessions WHERE created_at < datetime("now", "-7 days")').run();
}, 3600000);

function tryPort(port) {
  server.listen(port, '0.0.0.0')
    .once('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < PORT + 10) {
        tryPort(port + 1);
      } else if (err.code === 'EADDRINUSE') {
        console.error(`Ports ${PORT}-${PORT + 10} all in use. Please free a port or set PORT env.`);
        process.exit(1);
      } else {
        console.error('Server error:', err);
      }
    })
    .once('listening', () => {
      const addr = server.address();
      PORT = addr.port;
      console.log(`Dangro server running on port ${addr.port}`);
      console.log(`Open http://localhost:${addr.port} in your browser`);
    });
}

tryPort(PORT);
