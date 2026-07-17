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
  video_path TEXT NOT NULL,          -- original, untouched upload
  processed_path TEXT,               -- ffmpeg output actually sent to TikTok (NULL until ready)
  caption TEXT,
  privacy_level TEXT NOT NULL,
  disable_comment INTEGER DEFAULT 0,
  disable_duet INTEGER DEFAULT 0,
  disable_stitch INTEGER DEFAULT 0,
  is_commercial INTEGER DEFAULT 0,
  scheduled_for INTEGER,          -- unix ms, null = post immediately

  -- Editor settings (all optional; NULL/1.0/"NONE" = no-op = original bytes untouched)
  original_duration_ms INTEGER,
  trim_start_ms INTEGER,
  trim_end_ms INTEGER,
  speed REAL DEFAULT 1.0,
  filter_preset TEXT DEFAULT 'NONE',
  text_content TEXT,
  text_position TEXT DEFAULT 'BOTTOM',
  text_color TEXT DEFAULT '#FFFFFF',
  text_size INTEGER DEFAULT 42,
  cover_timestamp_ms INTEGER,

  edit_status TEXT DEFAULT 'READY',  -- READY, PROCESSING, EDIT_FAILED
  edit_error TEXT,

  status TEXT DEFAULT 'PENDING',  -- PENDING, PUBLISHING, PUBLISHED, FAILED
  publish_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
`);

module.exports = db;
