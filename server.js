require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");

const authRoutes = require("./routes/auth");
const { router: postsRoutes } = require("./routes/posts");
const startScheduler = require("./scheduler");

const app = express();

app.use(express.json());
app.use(
  cookieSession({
    name: "postpilot_session",
    keys: [process.env.SESSION_SECRET || "dev_secret_change_me"],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
);

// Serve uploaded videos publicly - required for PULL_FROM_URL publishing
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRoutes);
app.use("/api/posts", postsRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PostPilot server running on port ${PORT}`);
  startScheduler();
});
