const cron = require("node-cron");
const db = require("./db");
const { publishPost } = require("./routes/posts");

// Runs every minute, checks for scheduled posts whose time has arrived and publishes them.
function startScheduler() {
  cron.schedule("* * * * *", async () => {
    const now = Date.now();
    const due = db
      .prepare(
        `SELECT * FROM scheduled_posts WHERE status = 'PENDING' AND edit_status = 'READY' AND scheduled_for IS NOT NULL AND scheduled_for <= ?`
      )
      .all(now);

    for (const post of due) {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(post.user_id);
      if (!user) continue;

      db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHING' WHERE id = ?").run(post.id);
      try {
        const publishId = await publishPost(post, user);
        db.prepare("UPDATE scheduled_posts SET status = 'PUBLISHED', publish_id = ? WHERE id = ?").run(
          publishId,
          post.id
        );
        console.log(`Published scheduled post #${post.id}`);
      } catch (err) {
        db.prepare("UPDATE scheduled_posts SET status = 'FAILED', error = ? WHERE id = ?").run(
          err.message,
          post.id
        );
        console.error(`Failed to publish post #${post.id}:`, err.message);
      }
    }
  });
}

module.exports = startScheduler;
