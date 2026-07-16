const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "data", "postpilot.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,           -- TikTok open_id
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  video_path TEXT NOT NULL,
  caption TEXT,
  privacy_level TEXT NOT NULL,
  disable_comment INTEGER DEFAULT 0,
  disable_duet INTEGER DEFAULT 0,
  disable_stitch INTEGER DEFAULT 0,
  is_commercial INTEGER DEFAULT 0,
  scheduled_for INTEGER,          -- unix ms, null = post immediately
  status TEXT DEFAULT 'PENDING',  -- PENDING, PUBLISHING, PUBLISHED, FAILED
  publish_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
`);

module.exports = db;
