# PostPilot

A real, working content scheduler **and editor** for TikTok creators. Connect
your TikTok account, upload a video, trim it, set a cover frame, add text,
adjust speed, apply a color filter, choose who can see it, optionally
schedule a future publish time, and PostPilot posts it through TikTok's
official Content Posting API.

No mock data anywhere — every post in the dashboard is a real row in a
SQLite database, every edit is a real `ffmpeg` render, and every "Publish"
click is a real call to `open.tiktokapis.com`.

## Editor

- **Trim** — pick an in/out point on the timeline.
- **Cover frame** — scrub to any frame and use it as the TikTok cover
  (sent as `video_cover_timestamp_ms`, TikTok's own native cover mechanism —
  no extra image processing needed).
- **Text overlay** — position (top/center/bottom), color, size.
- **Speed** — 0.5x–3x, audio pitch-corrected with `atempo`.
- **Filters** — Vivid, Black & white, Warm, Cool, Vintage.

**Quality policy:** if you don't touch the editor at all, the file that
reaches TikTok is byte-for-byte your original upload — zero re-encoding.
The moment you use any editor control, PostPilot re-encodes once, server-side,
at `-crf 17` (visually near-lossless) so the edit can actually happen —
this is unavoidable for trim/speed/filter/text, but it's the *only*
re-encode in the pipeline, and nothing is compressed beyond what's needed
to apply what you asked for.

Processing runs with `ffmpeg-static` (a bundled ffmpeg binary — no server
setup needed) and a bundled DejaVu Sans font (`fonts/DejaVuSans-Bold.ttf`)
for text overlays, so it works the same on Render as anywhere else.

## 1. Create your TikTok app

1. Go to https://developers.tiktok.com/ → **Manage apps** → **Create app**.
2. Give it a name that does **not** contain "TikTok" (e.g. "PostPilot").
3. Add these products: **Login Kit** and **Content Posting API**.
4. Under Login Kit, add a Redirect URI — this must exactly match
   `TIKTOK_REDIRECT_URI` below, e.g. `https://your-app.onrender.com/auth/tiktok/callback`.
5. Copy your **Client Key** and **Client Secret**.

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://your-app.onrender.com/auth/tiktok/callback
APP_BASE_URL=https://your-app.onrender.com
SESSION_SECRET=some-long-random-string
```

Publishing uses TikTok's `FILE_UPLOAD` method: PostPilot pushes the video
bytes directly to the `upload_url` TikTok gives back, instead of asking
TikTok to pull from a URL on our own domain. This means **no domain/URL
verification is required** in the TikTok dashboard — that step is only
needed for `PULL_FROM_URL`, which this app doesn't use.

## 3. Run locally

```
npm install
npm start
```

Visit `http://localhost:3000`.

## 4. Deploy (Render)

1. Push this folder to a GitHub repo.
2. Render → **New Web Service** → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add a **persistent disk** mounted at `/data` sized ~1GB if you want
   uploaded videos and the SQLite file to survive restarts (adjust
   `UPLOAD_DIR`/db path in `db.js` and `routes/posts.js` if you move them).
5. Add the environment variables from step 2, using your real Render URL.
6. Deploy, then go back to the TikTok app dashboard and confirm the
   Redirect URI matches exactly.

## 5. Before submitting for TikTok review

- [ ] Fill in the real contact details in `public/privacy.html` and `public/terms.html`, and link both from your live app's settings page in the TikTok dashboard.
- [ ] Log in end-to-end on the live URL at least once so you know OAuth works.
- [ ] Upload a real test video and confirm it reaches `PUBLISHED` status (it will be private/`SELF_ONLY` until your app is audited — that's expected).
- [ ] Record a demo video (≤5 clips, ≤50MB each) showing: login → upload → privacy/interaction settings → the consent checkbox → publish → status updating in the call sheet.
- [ ] In the review form, explain your scopes: `user.info.basic` to show who's logged in, `video.publish` to post the content the user uploaded.

## Project structure

```
server.js          Express app entry point
db.js               SQLite schema + connection
scheduler.js        Cron job that publishes posts when their scheduled time arrives
routes/auth.js       TikTok OAuth login/callback
routes/posts.js      Upload, creator-info, publish, status endpoints
public/              Static frontend (landing, dashboard, privacy, terms)
uploads/             Uploaded video files (served statically)
data/                SQLite database file
```
