document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const profileId = localStorage.getItem("pc_profile_id");

  if (!token || !profileId) {
    window.location.href = "login.html";
    return;
  }

  // ---------------- Load ----------------

  try {
    const response = await fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (response.status === 401) {
      clearAuthAndRedirect();
      return;
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.data) {
      loadingState.innerHTML = `<span>Couldn't load your resume. Check the console for details.</span>`;
      console.error("Resume fetch failed:", response.status, result);
      return;
    }

    populate(result.data);

    loadingState.hidden = true;
    content.hidden = false;

    // Viewing this management page itself counts as a "view" of the
    // resume section — mirrors the pattern used for portfolio link views.
    if (result.data.resumeUrl) {
      trackView();
    }

  } catch (err) {
    console.error("Resume fetch threw an error:", err);
    loadingState.innerHTML = `<span>Couldn't reach the server: ${err.message}.</span>`;
    return;
  }

  function clearAuthAndRedirect() {
    ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.location.href = "login.html?reason=session-expired";
  }

  // ---------------- Populate ----------------

  function populate(profile) {
    const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Your Profile";
    const avatarSrc = profile.profilePicture || defaultAvatar(profile.firstName);

    document.getElementById("topbar-name").textContent = fullName;
    document.getElementById("topbar-avatar").src = avatarSrc;
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) sidebarAvatar.src = avatarSrc;
    const sidebarName = document.getElementById("sidebar-user-name");
    if (sidebarName) sidebarName.textContent = fullName;

    document.getElementById("rs-stat-views").textContent = profile.resumeViewCount || 0;
    document.getElementById("rs-stat-downloads").textContent = profile.resumeDownloadCount || 0;

    renderCurrent(profile);
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  // ---------------- Current resume panel ----------------

  function renderCurrent(profile) {
    const el = document.getElementById("rs-current-body");
    const statusChip = document.getElementById("rs-status-chip");

    if (!profile.resumeUrl) {
      statusChip.hidden = true;
      el.innerHTML = `
        <div class="rs-empty">
          <i class="ti ti-file-off" aria-hidden="true"></i>
          <p>No resume uploaded yet. Add one so recruiters can learn more about you.</p>
          <button type="button" class="btn-primary btn-compact" id="upload-first-btn">
            <i class="ti ti-upload" aria-hidden="true"></i> Upload Resume
          </button>
        </div>
      `;
      document.getElementById("upload-first-btn").addEventListener("click", triggerFilePicker);
      return;
    }

    statusChip.hidden = false;

    const fileName = profile.resumeFileName || guessFileNameFromUrl(profile.resumeUrl);
    const fileSize = profile.resumeFileSizeBytes ? formatFileSize(profile.resumeFileSizeBytes) : null;
    const uploadedAt = profile.resumeUploadedAt ? formatRelative(profile.resumeUploadedAt) : null;

    el.innerHTML = `
      <div class="rs-current-file">
        <span class="rs-current-file__icon"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></span>
        <div class="rs-current-file__body">
          <p class="rs-current-file__name">${escapeHtml(fileName)}</p>
          <p class="rs-current-file__meta">${["PDF", fileSize].filter(Boolean).join(" • ")}</p>
          ${uploadedAt ? `<span class="rs-current-file__uploaded"><i class="ti ti-clock" aria-hidden="true"></i> Uploaded ${uploadedAt}</span>` : ""}
        </div>
        <div class="rs-current-file__actions">
          <a href="${escapeAttr(profile.resumeUrl)}" target="_blank" rel="noopener" class="btn-primary btn-compact" id="download-btn">
            <i class="ti ti-download" aria-hidden="true"></i> Download
          </a>
          <button type="button" class="btn-outline btn-compact" id="replace-btn">
            <i class="ti ti-upload" aria-hidden="true"></i> Replace
          </button>
          <button type="button" class="btn-outline btn-compact" id="delete-btn" style="color: var(--pc-danger); border-color: #F3D2D2;">
            <i class="ti ti-trash" aria-hidden="true"></i> Delete
          </button>
        </div>
      </div>
      <div class="rs-visible-note">
        <i class="ti ti-circle-check" aria-hidden="true"></i> Your resume is visible to recruiters
      </div>
    `;

    document.getElementById("download-btn").addEventListener("click", trackDownload);
    document.getElementById("replace-btn").addEventListener("click", triggerFilePicker);
    document.getElementById("delete-btn").addEventListener("click", deleteResume);
  }

  // ---------------- Upload / Replace ----------------

  function triggerFilePicker() {
    document.getElementById("resume-file-input").click();
  }

  document.getElementById("resume-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      showToast("Please upload a PDF file.", "error");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast("That file is too large. Please choose one under 5MB.", "error");
      e.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("ProfessionalProfileId", profileId);
    formData.append("File", file);

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/upload-resume`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        showToast(result.message || "Couldn't upload your resume.", "error");
        return;
      }

      await reload();
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      e.target.value = "";
    }
  });

  // ---------------- Delete ----------------
  // Relies on the new DeleteResumeCommand — confirm this endpoint exists
  // on your ProfessionalController as /Professional/delete-resume.

  async function deleteResume() {
    if (!confirm("Delete your resume? Recruiters won't be able to see it until you upload a new one.")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/delete-resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ professionalProfileId: profileId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't delete your resume.", "error");
        return;
      }

      await reload();
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  // ---------------- Tracking ----------------

  function trackView() {
    fetch(`${API_BASE_URL}/Professional/track-resume-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalProfileId: profileId }),
    }).catch(() => {});
  }

  function trackDownload() {
    fetch(`${API_BASE_URL}/Professional/track-resume-download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalProfileId: profileId }),
    }).catch(() => {});
  }

  // ---------------- Reload ----------------

  async function reload() {
    const response = await fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.data) {
      populate(result.data);
    }
  }

  // ---------------- Helpers ----------------

  function guessFileNameFromUrl(url) {
    // Fallback only — used if resumeFileName wasn't captured (e.g. a
    // resume uploaded before the ResumeFileName field existed).
    try {
      const parts = new URL(url).pathname.split("/");
      return decodeURIComponent(parts[parts.length - 1]) || "Resume.pdf";
    } catch {
      return "Resume.pdf";
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function formatRelative(dateStr) {
    const then = new Date(dateStr);
    const now = new Date();
    const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return "1 month ago";
    if (months < 12) return `${months} months ago`;
    const years = Math.floor(months / 12);
    return years === 1 ? "1 year ago" : `${years} years ago`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});