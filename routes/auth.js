const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");
const db = require("../db");

const router = express.Router();

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

// Scopes: user.info.basic to show profile, video.publish to post content
const SCOPES = "user.info.basic,video.publish";

function randomString(len = 32) {
  return crypto.randomBytes(len).toString("hex");
}

// Step 1: redirect the user to TikTok's consent screen
router.get("/tiktok", (req, res) => {
  const state = randomString(16);
  req.session.oauth_state = state;

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    state,
  });

  res.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
});

// Step 2: TikTok redirects back here with an authorization code
router.get("/tiktok/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`TikTok auth error: ${error} - ${error_description || ""}`);
  }
  if (!code || state !== req.session.oauth_state) {
    return res.status(400).send("Invalid state or missing code. Please try logging in again.");
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error("Token exchange failed:", tokenData);
      return res.status(500).send("Failed to exchange code for token. Check server logs.");
    }

    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    // Fetch basic profile info
    const profileRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const profileData = await profileRes.json();
    const profile = profileData?.data?.user || {};

    const now = Date.now();
    db.prepare(
      `INSERT INTO users (id, access_token, refresh_token, expires_at, display_name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=excluded.refresh_token,
         expires_at=excluded.expires_at,
         display_name=excluded.display_name,
         avatar_url=excluded.avatar_url`
    ).run(
      open_id,
      access_token,
      refresh_token,
      now + expires_in * 1000,
      profile.display_name || "TikTok Creator",
      profile.avatar_url || "",
      now
    );

    req.session.user_id = open_id;
    res.redirect("/dashboard.html");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Something went wrong during login.");
  }
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

router.get("/me", (req, res) => {
  if (!req.session.user_id) return res.status(401).json({ error: "Not logged in" });
  const user = db.prepare("SELECT id, display_name, avatar_url FROM users WHERE id = ?").get(req.session.user_id);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json(user);
});

module.exports = router;
