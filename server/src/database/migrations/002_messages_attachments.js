export const version = 2;

export function up(db) {
  const columns = db.exec("PRAGMA table_info(messages)");
  const colNames = columns[0]?.values.map(v => v[1]) || [];
  if (!colNames.includes("attachments")) {
    db.run("ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'");
  }
}

export function down(db) {
  // SQLite does not support dropping columns
}
