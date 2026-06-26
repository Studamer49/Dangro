import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../data");
const dbPath = process.env.DATABASE_PATH || path.join(DATA_DIR, "dangro.db");

let db = null;
let SQL = null;

export async function initDatabase() {
  SQL = await initSqlJs();
  await loadDb();
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

export function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dbPath, buffer);
}

async function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch {
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON");
  runSchema();
  seedIfEmpty();
}

function run(sql, params = []) {
  if (params.length > 0) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
  } else {
    db.run(sql);
  }
  saveDb();
  return { changes: db.getRowsModified() };
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function runSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'D'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (id, server_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_key TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL,
      is_image INTEGER NOT NULL DEFAULT 0,
      system INTEGER NOT NULL DEFAULT 0,
      reply_to_sender TEXT,
      reply_to_content TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (message_id, emoji, username),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      discriminator TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      custom_status TEXT NOT NULL DEFAULT '',
      avatar_color TEXT NOT NULL DEFAULT '#555555'
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS group_chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      username TEXT NOT NULL,
      PRIMARY KEY (group_id, username),
      FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'online',
      custom_status TEXT NOT NULL DEFAULT '',
      profile_pic TEXT NOT NULL DEFAULT ''
    );
  `);
}

function seedIfEmpty() {
  const count = getOne("SELECT COUNT(*) as count FROM servers");
  if (count && count.count > 0) return;

  db.run("INSERT OR IGNORE INTO servers (id, name, icon) VALUES ('dangro-hq', 'Dangro HQ', 'D')");
  db.run("INSERT OR IGNORE INTO servers (id, name, icon) VALUES ('gamers-sanctuary', 'Gamers Sanctuary', 'G')");
  db.run("INSERT OR IGNORE INTO servers (id, name, icon) VALUES ('creative-lounge', 'Creative Lounge', 'C')");

  const channels = [
    ["general", "dangro-hq", "general"], ["announcements", "dangro-hq", "announcements"],
    ["memes", "dangro-hq", "memes"], ["dev-chat", "dangro-hq", "dev-chat"],
    ["lobby", "gamers-sanctuary", "lobby"], ["clips", "gamers-sanctuary", "clips"],
    ["hardware-talk", "gamers-sanctuary", "hardware-talk"],
    ["art-gallery", "creative-lounge", "art-gallery"], ["music-vibes", "creative-lounge", "music-vibes"],
    ["writing", "creative-lounge", "writing"],
  ];
  for (const [id, serverId, name] of channels) {
    db.run("INSERT OR IGNORE INTO channels (id, server_id, name) VALUES (?, ?, ?)", [id, serverId, name]);
  }

  db.run("INSERT OR IGNORE INTO users (username, password, display_name, bio, status, custom_status, profile_pic) VALUES ('admin', 'admin', 'You', '', 'online', '', '')");

  saveDb();
}

export { run, getAll, getOne };
