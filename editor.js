const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
// Uses the full ffmpeg build installed system-wide via the Dockerfile (apt-get
// install ffmpeg). The npm "ffmpeg-static" package's minimal binary is missing
// filters like drawtext and curves that this editor depends on.

const FONT_PATH = path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf");

// Named color-grade presets, built from plain ffmpeg filters (no LUT files needed).
const FILTER_PRESETS = {
  NONE: null,
  VIVID: "eq=saturation=1.4:contrast=1.15",
  BW: "hue=s=0,eq=contrast=1.1",
  WARM: "eq=gamma_r=1.06:gamma_b=0.94",
  COOL: "eq=gamma_b=1.08:gamma_r=0.94",
  VINTAGE: "curves=preset=vintage,eq=saturation=0.85",
};

function hasAnyEdit(post) {
  return !!(
    (post.trim_start_ms && post.trim_start_ms > 0) ||
    post.trim_end_ms ||
    (post.speed && post.speed !== 1) ||
    (post.filter_preset && post.filter_preset !== "NONE") ||
    (post.text_content && post.text_content.trim())
  );
}

function textYExpr(position) {
  switch (position) {
    case "TOP":
      return "60";
    case "CENTER":
      return "(h-text_h)/2";
    case "BOTTOM":
    default:
      return "h-text_h-80";
  }
}

/**
 * Runs ffmpeg against the original upload according to the post's edit settings
 * and writes a new file. Returns the output filename (not full path).
 * Only called when hasAnyEdit(post) is true — otherwise the original file is
 * used as-is with zero re-encoding, so "no edits" really does mean zero quality loss.
 */
function renderEditedVideo(post, uploadDir) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(uploadDir, post.video_path);
    const outName = `edited-${post.id}-${Date.now()}.mp4`;
    const outputPath = path.join(uploadDir, outName);

    const speed = post.speed && post.speed > 0 ? post.speed : 1;
    const hasTrim = !!(post.trim_start_ms || post.trim_end_ms);
    const startSec = (post.trim_start_ms || 0) / 1000;
    const endSec = post.trim_end_ms ? post.trim_end_ms / 1000 : null;

    const vf = [];
    const af = [];

    if (hasTrim) {
      vf.push(endSec ? `trim=start=${startSec}:end=${endSec}` : `trim=start=${startSec}`);
      vf.push("setpts=PTS-STARTPTS");
      af.push(endSec ? `atrim=start=${startSec}:end=${endSec}` : `atrim=start=${startSec}`);
      af.push("asetpts=PTS-STARTPTS");
    }

    if (speed !== 1) {
      vf.push(`setpts=(1/${speed})*PTS`);
      af.push(`atempo=${speed}`);
    }

    const preset = FILTER_PRESETS[post.filter_preset] || null;
    if (preset) vf.push(preset);

    let textFilePath = null;
    if (post.text_content && post.text_content.trim()) {
      textFilePath = path.join(uploadDir, `text-${post.id}-${Date.now()}.txt`);
      fs.writeFileSync(textFilePath, post.text_content);
      const color = (post.text_color || "#FFFFFF").replace("#", "0x");
      const size = post.text_size || 42;
      const y = textYExpr(post.text_position);
      const fontfileEscaped = FONT_PATH.replace(/\\/g, "/").replace(/:/g, "\\:");
      const textfileEscaped = textFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");
      vf.push(
        `drawtext=fontfile='${fontfileEscaped}':textfile='${textfileEscaped}':fontcolor=${color}:fontsize=${size}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.4:boxborderw=10`
      );
    }

    const command = ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-preset medium",
        "-crf 17", // visually near-lossless; re-encoding is unavoidable once any real edit is applied
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ]);

    if (vf.length) command.videoFilters(vf);
    if (af.length) command.audioFilters(af);

    command
      .on("error", (err) => {
        if (textFilePath) fs.unlink(textFilePath, () => {});
        reject(err);
      })
      .on("end", () => {
        if (textFilePath) fs.unlink(textFilePath, () => {});
        resolve(outName);
      })
      .save(outputPath);
  });
}

/**
 * Works out the video_cover_timestamp_ms to send TikTok, translating the cover
 * point the user picked on the ORIGINAL timeline into a position on the final,
 * possibly trimmed/sped-up output.
 */
function computeCoverTimestampMs(post) {
  if (post.cover_timestamp_ms == null) return undefined;

  const trimStart = post.trim_start_ms || 0;
  const trimEnd = post.trim_end_ms || post.original_duration_ms || post.cover_timestamp_ms;
  const speed = post.speed && post.speed > 0 ? post.speed : 1;

  const clamped = Math.min(Math.max(post.cover_timestamp_ms, trimStart), trimEnd);
  const relativeMs = clamped - trimStart;
  return Math.round(relativeMs / speed);
}

module.exports = { hasAnyEdit, renderEditedVideo, computeCoverTimestampMs, FILTER_PRESETS };
