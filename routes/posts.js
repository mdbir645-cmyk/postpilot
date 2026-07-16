const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const db = require("../db");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB, TikTok's own max
  fileFilter: (req, file, cb) => {
    const ok = ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype);
    cb(ok ? null : new Error("Only MP4, WebM or MOV files are allowed"), ok);
  },
});

function requireAuth(req, res, next) {
  if (!req.session.user_id) return res.status(401).json({ error: "Not logged in" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.user_id);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  req.user = user;
  next();
}

// Ask TikTok what privacy levels / interaction settings this creator's account allows.
// Required before showing the posting UI — see creator_info/query in TikTok's docs.
router.get("/creator-info", requireAuth, async (req, res) => {
  try {
    const r = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.user.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json(data.data);
  } catch (err) {
    console.error("creator-info error:", err);
    res.status(500).json({ error: "Failed to fetch creator info" });
  }
});

// Upload a video file to our own server and (optionally) schedule it
router.post("/upload", requireAuth, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video file received" });

  const {
    caption = "",
    privacy_level,
    disable_comment = "0",
    disable_duet = "0",
    disable_stitch = "0",
    is_commercial = "0",
    scheduled_for = "",
  } = req.body;

  if (!privacy_level) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "privacy_level is required" });
  }

  const scheduledForMs = scheduled_for ? new Date(scheduled_for).getTime() : null;

  const result = db
    .prepare(
      `INSERT INTO scheduled_posts
        (user_id, video_path, caption, privacy_level, disable_comment, disable_duet, disable_stitch, is_commercial, scheduled_for, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`
    )
    .run(
      req.user.id,
      req.file.filename,
      caption,
      privacy_level,
      Number(disable_comment),
      Number(disable_duet),
      Number(disable_stitch),
      Number(is_commercial),
      scheduledForMs,
      Date.now()
    );

  res.json({ id: result.lastInsertRowid, message: "Post saved" });
});

// List this user's posts (scheduled + published + failed)
router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json(rows);
});

// Publish one post immediately via the Content Posting API (PULL_FROM_URL flow).
// Our own /uploads static route must be publicly reachable for this to work,
// which is why APP_BASE_URL has to be the real deployed URL, not localhost.
async function publishPost(post, user) {
  const videoUrl = `${process.env.APP_BASE_URL}/uploads/${post.video_path}`;

  const body = {
    post_info: {
      title: post.caption || "",
      privacy_level: post.privacy_level,
      disable_comment: !!post.disable_comment,
      disable_duet: !!post.disable_duet,
      disable_stitch: !!post.disable_stitch,
      brand_content_toggle: !!post.is_commercial,
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: videoUrl,
    },
  };

  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const initData = await initRes.json();

  if (!initRes.ok || initData.error?.code !== "ok") {
    throw new Error(initData.error?.message || "TikTok init request failed");
  }

  return initData.data.publish_id;
}

router.post("/:id/publish-now", requireAuth, async (req, res) => {
  const post = db
    .prepare("SELECT * FROM scheduled_posts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  try {
    db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHING' WHERE id = ?").run(post.id);
    const publishId = await publishPost(post, req.user);
    db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', publish_id = ? WHERE id = ?").run(
      publishId,
      post.id
    );
    res.json({ publish_id: publishId });
  } catch (err) {
    db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error = ? WHERE id = ?").run(
      err.message,
      post.id
    );
    res.status(500).json({ error: err.message });
  }
});

// Poll TikTok for the real status of a publish job
router.get("/:id/status", requireAuth, async (req, res) => {
  const post = db
    .prepare("SELECT * FROM scheduled_posts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!post.publish_id) return res.json({ status: post.status });

  try {
    const r = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.user.access_token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: post.publish_id }),
    });
    const data = await r.json();
    if (data.data?.status) {
      db.prepare("UPDATE scheduled_posts SET status = ? WHERE id = ?").run(data.data.status, post.id);
    }
    res.json(data.data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

module.exports = { router, publishPost };
