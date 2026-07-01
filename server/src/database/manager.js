import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(__dirname, "../../data");
const DB_FILE = process.env.DATABASE_PATH || path.join(DATA_DIR, "dangro.db");

let db = null;
let SQL = null;

export async function initDatabase() {
  SQL = await initSqlJs();
  await loadDb();
  await runMigrations();
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, buffer);
}

async function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const buffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON");
}

async function runMigrations() {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  saveDb();

  const applied = new Set(
    db.exec("SELECT version FROM _migrations ORDER BY version")
      .flatMap(r => r.values.map(v => v[0]))
  );

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.match(/^\d+.*\.js$/))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const fileUrl = new URL(`file://${filePath.replace(/\\/g, "/")}`).href;
    const migration = await import(fileUrl);
    if (!applied.has(migration.version)) {
      console.log(`Running migration ${file}...`);
      migration.up(db);
      db.run("INSERT INTO _migrations (version) VALUES (?)", [migration.version]);
      saveDb();
      console.log(`Migration ${file} applied.`);
    }
  }
}

export function run(sql, params = []) {
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

export function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}
