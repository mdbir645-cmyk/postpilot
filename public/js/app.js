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
      return `
        <div class="post-card">
          <div class="post-card-main">
            <div class="post-caption">${p.caption ? escapeHtml(p.caption) : "(no caption)"}</div>
            <div class="post-meta">${when} · ${p.privacy_level}</div>
          </div>
          ${statusBadge(p.status)}
        </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

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
  msg.textContent = "Uploading… 0%";

  const formData = new FormData(form);
  // checkboxes need to be sent as 1/0 explicitly
  ["disable_comment", "disable_duet", "disable_stitch", "is_commercial"].forEach((name) => {
    formData.set(name, form.elements[name].checked ? "1" : "0");
  });

  try {
    const data = await uploadWithProgress(formData, (pct) => {
      msg.textContent = `Uploading… ${pct}%`;
    });

    // If no schedule time was given, publish right away
    if (!form.scheduled_for.value) {
      msg.textContent = "Upload complete. Publishing to TikTok…";
      const pubRes = await fetch(`/api/posts/${data.id}/publish-now`, { method: "POST" });
      const pubData = await pubRes.json();
      if (!pubRes.ok) throw new Error(pubData.error || "Publish failed");
    }

    msg.textContent = "Queued.";
    form.reset();
    loadPosts();
  } catch (err) {
    msg.textContent = "Error: " + err.message;
  }
});

if (document.body.classList.contains("app")) {
  loadMe();
  loadPrivacyOptions();
  loadPosts();
  setInterval(loadPosts, 15000); // refresh statuses periodically
}
