async function loadMe() {
  const res = await fetch("/auth/me");
  if (!res.ok) {
    window.location.href = "/";
    return;
  }
  const user = await res.json();
  document.getElementById("display-name").textContent = user.display_name;
  if (user.avatar_url) {
    const img = document.getElementById("avatar");
    img.src = user.avatar_url;
    img.hidden = false;
  }
}

async function loadPrivacyOptions() {
  const select = document.getElementById("privacy_level");
  try {
    const res = await fetch("/api/posts/creator-info");
    const data = await res.json();
    const options = data.privacy_level_options || [];
    select.innerHTML = "";
    const labels = {
      PUBLIC_TO_EVERYONE: "Everyone",
      MUTUAL_FOLLOW_FRIENDS: "Friends",
      FOLLOWER_OF_CREATOR: "Followers",
      SELF_ONLY: "Only me",
    };
    options.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt;
      el.textContent = labels[opt] || opt;
      select.appendChild(el);
    });
    if (options.length === 0) {
      select.innerHTML = '<option value="SELF_ONLY">Only me (unaudited app default)</option>';
    }
  } catch (err) {
    select.innerHTML = '<option value="SELF_ONLY">Only me (unaudited app default)</option>';
  }
}

function statusBadge(status) {
  return `<span class="status-badge status-${status}">${status}</span>`;
}

async function loadPosts() {
  const list = document.getElementById("post-list");
  const res = await fetch("/api/posts");
  const posts = await res.json();

  if (!posts.length) {
    list.innerHTML = '<p class="empty-state">Nothing queued yet — your scheduled and published posts will line up here.</p>';
    return;
  }

  list.innerHTML = posts
    .map((p) => {
      const when = p.scheduled_for
        ? new Date(p.scheduled_for).toLocaleString()
        : "Posted immediately";
      const editBadge =
        p.edit_status === "EDIT_FAILED"
          ? `<span class="status-badge status-FAILED" title="${escapeHtml(p.edit_error || "")}">EDIT FAILED</span>`
          : "";
      return `
        <div class="post-card">
          <div class="post-card-main">
            <div class="post-caption">${p.caption ? escapeHtml(p.caption) : "(no caption)"}</div>
            <div class="post-meta">${when} · ${p.privacy_level}</div>
          </div>
          ${editBadge}${statusBadge(p.status)}
        </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Dropzone ----------

const videoInput = document.getElementById("video-input");
const dropzone = document.getElementById("dropzone");
const dropzoneInner = document.getElementById("dropzone-inner");
const dropzoneFile = document.getElementById("dropzone-file");
const dropzoneFilename = document.getElementById("dropzone-filename");

function showChosenFile(file) {
  dropzoneInner.hidden = true;
  dropzoneFile.hidden = false;
  dropzoneFilename.textContent = file.name;
}

function clearChosenFile() {
  videoInput.value = "";
  dropzoneInner.hidden = false;
  dropzoneFile.hidden = true;
  document.getElementById("editor").hidden = true;
}

videoInput?.addEventListener("change", () => {
  if (videoInput.files[0]) showChosenFile(videoInput.files[0]);
});

document.getElementById("dropzone-clear")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearChosenFile();
});

["dragover", "dragenter"].forEach((evt) =>
  dropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone?.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
  })
);
dropzone?.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) {
    videoInput.files = e.dataTransfer.files;
    showChosenFile(file);
    videoInput.dispatchEvent(new Event("change"));
  }
});

// ---------- Editor ----------

const FILTER_CSS = {
  NONE: "none",
  VIVID: "saturate(1.4) contrast(1.15)",
  BW: "grayscale(1) contrast(1.1)",
  WARM: "sepia(0.18) saturate(1.15)",
  COOL: "hue-rotate(170deg) saturate(1.05) brightness(1.02)",
  VINTAGE: "sepia(0.3) contrast(0.9) saturate(0.85)",
};

const editorState = {
  durationMs: 0,
  trimStartMs: 0,
  trimEndMs: null,
  coverMs: null,
};

function formatTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateTrimReadout() {
  const readout = document.getElementById("trim-readout");
  const endSec = (editorState.trimEndMs ?? editorState.durationMs) / 1000;
  const startSec = editorState.trimStartMs / 1000;
  const isFull = editorState.trimStartMs === 0 && editorState.trimEndMs == null;
  readout.textContent = isFull
    ? "Full clip"
    : `${formatTime(startSec)} – ${formatTime(endSec)} (${formatTime(endSec - startSec)})`;
}

function applyLivePreviewFilter() {
  const video = document.getElementById("preview-video");
  const preset = document.getElementById("filter-select").value;
  video.style.filter = FILTER_CSS[preset] || "none";
}

function applyTextOverlayPreview() {
  const overlay = document.getElementById("text-overlay-preview");
  const text = document.getElementById("text-content").value;
  const position = document.getElementById("text-position").value;
  const color = document.getElementById("text-color").value;
  const size = document.getElementById("text-size").value;

  overlay.textContent = text;
  overlay.style.color = color;
  overlay.style.fontSize = Math.max(12, size / 2.2) + "px";
  overlay.classList.toggle("hidden-overlay", !text);
  overlay.style.alignItems = position === "TOP" ? "flex-start" : position === "CENTER" ? "center" : "flex-end";
}

document.getElementById("video-input")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  const editor = document.getElementById("editor");
  if (!file) {
    editor.hidden = true;
    return;
  }

  const video = document.getElementById("preview-video");
  video.src = URL.createObjectURL(file);
  editor.hidden = false;
  editor.classList.remove("entering");
  void editor.offsetWidth; // restart animation
  editor.classList.add("entering");

  video.addEventListener(
    "loadedmetadata",
    () => {
      editorState.durationMs = Math.round(video.duration * 1000);
      editorState.trimStartMs = 0;
      editorState.trimEndMs = null;
      editorState.coverMs = null;

      const startSlider = document.getElementById("trim-start");
      const endSlider = document.getElementById("trim-end");
      startSlider.max = video.duration;
      endSlider.max = video.duration;
      startSlider.value = 0;
      endSlider.value = video.duration;

      updateTrimReadout();
      document.getElementById("cover-readout").textContent = "No cover chosen — TikTok will pick one";
    },
    { once: true }
  );
});

document.getElementById("trim-start")?.addEventListener("input", (e) => {
  const video = document.getElementById("preview-video");
  const val = parseFloat(e.target.value);
  const endSlider = document.getElementById("trim-end");
  if (val >= parseFloat(endSlider.value)) e.target.value = endSlider.value;
  editorState.trimStartMs = Math.round(parseFloat(e.target.value) * 1000);
  video.currentTime = parseFloat(e.target.value);
  updateTrimReadout();
});

document.getElementById("trim-end")?.addEventListener("input", (e) => {
  const video = document.getElementById("preview-video");
  const startSlider = document.getElementById("trim-start");
  const val = parseFloat(e.target.value);
  if (val <= parseFloat(startSlider.value)) e.target.value = startSlider.value;
  const full = editorState.durationMs / 1000;
  editorState.trimEndMs = Math.abs(parseFloat(e.target.value) - full) < 0.05 ? null : Math.round(parseFloat(e.target.value) * 1000);
  video.currentTime = parseFloat(e.target.value);
  updateTrimReadout();
});

document.getElementById("btn-set-start")?.addEventListener("click", () => {
  const video = document.getElementById("preview-video");
  document.getElementById("trim-start").value = video.currentTime;
  document.getElementById("trim-start").dispatchEvent(new Event("input"));
});

document.getElementById("btn-set-end")?.addEventListener("click", () => {
  const video = document.getElementById("preview-video");
  document.getElementById("trim-end").value = video.currentTime;
  document.getElementById("trim-end").dispatchEvent(new Event("input"));
});

document.getElementById("btn-set-cover")?.addEventListener("click", () => {
  const video = document.getElementById("preview-video");
  const canvas = document.getElementById("cover-canvas");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  editorState.coverMs = Math.round(video.currentTime * 1000);
  document.getElementById("cover-readout").textContent = `Cover set at ${formatTime(video.currentTime)}`;
});

document.getElementById("filter-select")?.addEventListener("change", applyLivePreviewFilter);
["text-content", "text-position", "text-color", "text-size"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", applyTextOverlayPreview);
});

// ---------- Upload ----------

function uploadWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/posts/upload");
    xhr.timeout = 10 * 60 * 1000; // 10 minutes — generous for slow mobile networks

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload — check your connection"));
    xhr.ontimeout = () => reject(new Error("Upload timed out after 10 minutes — try a smaller file or a better connection"));

    xhr.send(formData);
  });
}

document.getElementById("post-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById("form-message");
  const submitBtn = document.getElementById("submit-btn");
  const btnLabel = submitBtn.querySelector(".btn-label");
  const btnSpinner = submitBtn.querySelector(".btn-spinner");
  const track = document.getElementById("progress-track");
  const fill = document.getElementById("progress-fill");

  submitBtn.disabled = true;
  btnLabel.textContent = "Uploading…";
  btnSpinner.hidden = false;
  track.hidden = false;
  fill.classList.remove("indeterminate");
  fill.style.width = "0%";
  msg.textContent = "";

  const formData = new FormData(form);
  // checkboxes need to be sent as 1/0 explicitly
  ["disable_comment", "disable_duet", "disable_stitch", "is_commercial"].forEach((name) => {
    formData.set(name, form.elements[name].checked ? "1" : "0");
  });

  // Editor settings
  formData.set("original_duration_ms", editorState.durationMs || "");
  formData.set("trim_start_ms", editorState.trimStartMs || "");
  formData.set("trim_end_ms", editorState.trimEndMs ?? "");
  formData.set("speed", document.getElementById("speed-select")?.value || "1");
  formData.set("filter_preset", document.getElementById("filter-select")?.value || "NONE");
  formData.set("text_content", document.getElementById("text-content")?.value || "");
  formData.set("text_position", document.getElementById("text-position")?.value || "BOTTOM");
  formData.set("text_color", document.getElementById("text-color")?.value || "#ffffff");
  formData.set("text_size", document.getElementById("text-size")?.value || "42");
  formData.set("cover_timestamp_ms", editorState.coverMs ?? "");

  try {
    const data = await uploadWithProgress(formData, (pct) => {
      fill.style.width = pct + "%";
      if (pct < 100) {
        btnLabel.textContent = `Uploading… ${pct}%`;
      } else {
        btnLabel.textContent = "Applying your edits…";
        fill.classList.add("indeterminate");
      }
    });

    // If no schedule time was given, publish right away
    if (!form.scheduled_for.value) {
      btnLabel.textContent = "Publishing to TikTok…";
      fill.classList.add("indeterminate");
      const pubRes = await fetch(`/api/posts/${data.id}/publish-now`, { method: "POST" });
      const pubData = await pubRes.json();
      if (!pubRes.ok) throw new Error(pubData.error || "Publish failed");
    }

    msg.textContent = "✓ Queued.";
    msg.classList.remove("msg-error");
    msg.classList.add("msg-success");
    form.reset();
    document.getElementById("editor").hidden = true;
    clearChosenFile();
    loadPosts();
  } catch (err) {
    msg.textContent = "Error: " + err.message;
    msg.classList.remove("msg-success");
    msg.classList.add("msg-error");
  } finally {
    submitBtn.disabled = false;
    btnLabel.textContent = "Queue this post";
    btnSpinner.hidden = true;
    fill.classList.remove("indeterminate");
    setTimeout(() => {
      track.hidden = true;
      fill.style.width = "0%";
    }, 600);
  }
});

if (document.body.classList.contains("app")) {
  loadMe();
  loadPrivacyOptions();
  loadPosts();
  setInterval(loadPosts, 15000); // refresh statuses periodically
}
