document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const profileId = localStorage.getItem("pc_profile_id");

  const STATUS_MAP = {
    Available: { label: "Available", dot: "is-available" },
    OpenToOffers: { label: "Open to Offers", dot: "is-open" },
    NotLooking: { label: "Not Looking", dot: "is-not-looking" },
    NotAvailable: { label: "Not Available", dot: "is-unavailable" },
  };

  if (!token || !profileId) {
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username", "pc_avatar_url"].forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      window.location.href = "login.html?reason=session-expired";
      return;
    }

    if (!response.ok || !result.data) {
      console.error("Profile fetch failed:", response.status, result);
      loadingState.innerHTML = `<span>Couldn't load your profile (${response.status}): ${result.message || "Unknown error"}. Check the console for details.</span>`;
      return;
    }

    renderProfile(result.data);

    loadingState.hidden = true;
    content.hidden = false;

    setupDropdowns(result.data);
    setupPhotoUpload(result.data);

  } catch (err) {
    console.error("Profile fetch threw an error:", err);
    loadingState.innerHTML = `<span>Couldn't reach the server: ${err.message}. Check the console for details.</span>`;
  }

  // ---------------- Profile picture upload ----------------

  function setupPhotoUpload() {
    const uploadBtn = document.getElementById("photo-upload-btn");
    const fileInput = document.getElementById("photo-upload-input");
    const photoWrap = document.querySelector(".profile-banner__photo-wrap");
    const userId = localStorage.getItem("pc_user_id");

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      if (!userId) {
        showToast("Couldn't find your user ID — try logging in again.", "error");
        return;
      }

      const maxSizeBytes = 2 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        showToast("That image is too large. Please choose one under 2MB.", "error");
        fileInput.value = "";
        return;
      }

      uploadBtn.classList.add("is-uploading");
      photoWrap.classList.add("is-uploading");

      const formData = new FormData();
      formData.append("UserId", userId);
      formData.append("File", file);

      try {
        const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
        const response = await fetch(API_ROUTES.uploadProfilePicture, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: formData,
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.data) {
          console.error("Photo upload failed:", response.status, result);
          showToast(result.message || "Couldn't upload your photo. Please try again.", "error");
          return;
        }

        const newUrl = result.data;
        document.getElementById("profile-photo").src = newUrl;
        document.getElementById("topbar-avatar").src = newUrl;
        const sidebarAvatar = document.getElementById("sidebar-avatar");
        if (sidebarAvatar) sidebarAvatar.src = newUrl;

        // Persist so every other page (feed, messages, Networking) picks
        // up the new photo too, not just this one until next fetch.
        localStorage.setItem("pc_avatar_url", newUrl);

      } catch (err) {
        console.error("Photo upload threw an error:", err);
        showToast("Couldn't reach the server. Check your connection and try again.", "error");
      } finally {
        uploadBtn.classList.remove("is-uploading");
        photoWrap.classList.remove("is-uploading");
        fileInput.value = "";
      }
    });
  }

  // ---------------- Dropdowns ----------------

  function setupDropdowns(profile) {
    wireDropdown("topbar-user-toggle", "topbar-dropdown");
    wireDropdown("banner-more-toggle", "banner-more-dropdown");

    document.addEventListener("click", (e) => {
      document.querySelectorAll(".dropdown-menu.is-open").forEach((menu) => {
        if (!menu.parentElement.contains(e.target)) {
          menu.classList.remove("is-open");
        }
      });
    });

    const topbarLogout = document.getElementById("topbar-logout");
    if (topbarLogout) {
      topbarLogout.addEventListener("click", () => {
        ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username", "pc_avatar_url"].forEach((key) => {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        });
        window.location.href = "login.html";
      });
    }

    const shareBtn = document.getElementById("share-profile-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          shareBtn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Link copied!`;
          setTimeout(() => {
            shareBtn.innerHTML = `<i class="ti ti-share" aria-hidden="true"></i> Share Profile`;
          }, 1500);
        } catch (err) {
          console.error("Couldn't copy link:", err);
        }
      });
    }
  }

  function wireDropdown(toggleId, menuId) {
    const toggle = document.getElementById(toggleId);
    const menu = document.getElementById(menuId);
    if (!toggle || !menu) return;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));
      if (!isOpen) menu.classList.add("is-open");
    });
  }

  function renderProfile(profile) {
    const fullName = (profile.firstName || profile.lastName)
      ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim()
      : "Your Profile";

    if (!profile.firstName && !profile.lastName) {
      console.warn("GetProfessionalProfileResponse has no firstName/lastName — check the backend response shape.");
    }
    const avatarSrc = profile.profilePicture || defaultAvatar(profile.firstName);

    const sidebarName = document.getElementById("sidebar-user-name");
    if (sidebarName) sidebarName.textContent = fullName;
    document.getElementById("topbar-name").textContent = fullName;
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) sidebarAvatar.src = avatarSrc;
    document.getElementById("topbar-avatar").src = avatarSrc;

    // Persist to localStorage so other pages (feed, messages, Networking)
    // that don't fetch the full profile can still show the real photo via
    // sidebar.js's avatar-fallback logic, instead of defaulting to
    // initials until the person happens to visit their own profile page.
    if (profile.profilePicture) {
      localStorage.setItem("pc_avatar_url", profile.profilePicture);
    }

    document.getElementById("profile-photo").src = avatarSrc;
    document.getElementById("profile-name").textContent = fullName;

    document.getElementById("verified-badge").hidden = !profile.isVerified;

    // Points at the new generic view-profile page (profile.html), which
    // works for viewing either a Professional or a Recruiter. profile.id
    // here is the ProfessionalProfile's own id (not User.id) — profile.js
    // needs both id and type to know which endpoint to call.
    const viewPublicLink = document.getElementById("view-public-profile-link");
    if (viewPublicLink) viewPublicLink.href = `profile.html?id=${encodeURIComponent(profile.id)}&type=professional`;
    document.getElementById("verified-label").hidden = !profile.isVerified;

    document.getElementById("profile-headline").textContent = profile.headLine || "No headline added yet";

    const bio = profile.summary || "No summary added yet — tell recruiters what makes you great.";
    document.getElementById("banner-bio").textContent = bio;
    document.getElementById("about-text").textContent = bio;
    setupShowMore();

    document.getElementById("profile-location").hidden = true;

    const linkedinEl = document.getElementById("profile-linkedin");
    if (profile.linkedInUrl) {
      linkedinEl.href = profile.linkedInUrl;
      linkedinEl.querySelector("span").textContent = stripProtocol(profile.linkedInUrl);
      linkedinEl.hidden = false;
    }

    renderAvailabilityPill(profile.availabilityStatus);
    renderExperience(profile.experiences);
    renderEducation(profile.educations);
    renderSkills(profile.skills);
    renderCertifications(profile.certificates);
    renderPortfolio(profile.portfolioLinks);
    renderResume(profile);
    renderAvailabilityCard(profile);
    renderStatStrip(profile);
    renderStrength(profile);

    ["qa-experience", "qa-education", "qa-skills", "qa-certification"].forEach((id) => {
      const el = document.getElementById(id);
      el.href = `${id.replace("qa-", "add-")}.html?profileId=${encodeURIComponent(profile.id)}`;
    });
  }

  function setupShowMore() {
    const textEl = document.getElementById("about-text");
    const toggleBtn = document.getElementById("about-toggle");

    requestAnimationFrame(() => {
      if (textEl.scrollHeight > textEl.clientHeight + 2) {
        toggleBtn.hidden = false;
      }
    });

    toggleBtn.addEventListener("click", () => {
      const expanded = textEl.classList.toggle("is-expanded");
      toggleBtn.textContent = expanded ? "Show less" : "Show more";
    });
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  function stripProtocol(url) {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  const STATUS_BY_INDEX = ["Available", "OpenToOffers", "NotLooking", "NotAvailable"];

  function resolveStatus(status) {
    const key = typeof status === "number" ? STATUS_BY_INDEX[status] : status;
    return STATUS_MAP[key] || { label: status ?? "Unknown", dot: "" };
  }

  function renderAvailabilityPill(status) {
    const info = resolveStatus(status);
    document.getElementById("availability-pill").innerHTML =
      `<span class="status-dot ${info.dot}"></span> ${info.label}`;
  }

  function renderExperience(list) {
    const el = document.getElementById("experience-list");
    const viewAllBottom = document.getElementById("experience-view-all");
    if (!list || list.length === 0) {
      el.innerHTML = `<p class="empty-note">No experience added yet.</p>`;
      return;
    }
    el.innerHTML = list.slice(0, 3).map((e) => `
      <div class="timeline-item">
        <span class="timeline-item__logo">${initials(e.companyName)}</span>
        <div>
          <p class="timeline-item__title">${escapeHtml(e.jobTitle)}</p>
          <p class="timeline-item__sub">${escapeHtml(e.companyName)}</p>
          <span class="timeline-item__meta">${formatDate(e.startDate)} – ${e.isCurrentJob ? "Present" : formatDate(e.endDate)} · ${escapeHtml(e.location)}</span>
        </div>
      </div>
    `).join("");
    if (list.length > 0) viewAllBottom.hidden = false;
  }

  function renderEducation(list) {
    const el = document.getElementById("education-list");
    if (!list || list.length === 0) {
      el.innerHTML = `<p class="empty-note">No education added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((e) => `
      <div class="timeline-item">
        <span class="timeline-item__logo">${initials(e.institution)}</span>
        <div>
          <p class="timeline-item__title">${escapeHtml(e.degree)}</p>
          <p class="timeline-item__sub">${escapeHtml(e.institution)}</p>
          <span class="timeline-item__meta">${formatDate(e.startDate)} – ${e.endDate ? formatDate(e.endDate) : "Present"}</span>
        </div>
      </div>
    `).join("");
  }

  function renderSkills(list) {
    const el = document.getElementById("skills-list");
    if (!list || list.length === 0) {
      el.innerHTML = `<p class="empty-note">No skills added yet.</p>`;
      return;
    }
    const shown = list.slice(0, 8);
    const remaining = list.length - shown.length;
    el.innerHTML = shown.map((s) => `<span class="chip">${escapeHtml(s.skillName)}</span>`).join("")
      + (remaining > 0 ? `<span class="chip">+${remaining} more</span>` : "");
  }

  function renderCertifications(list) {
    const el = document.getElementById("certifications-list");
    if (!list || list.length === 0) {
      el.innerHTML = `<p class="empty-note">No certifications added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((c) => `
      <div class="cert-item">
        <span class="cert-item__logo"><i class="ti ti-certificate" aria-hidden="true"></i></span>
        <div class="cert-item__body">
          <p class="cert-item__name">${escapeHtml(c.name)}</p>
          <span class="cert-item__org">${escapeHtml(c.issuingOrganization)}</span>
        </div>
        <span class="cert-item__date">Issued ${formatDate(c.issueDate)}</span>
      </div>
    `).join("");
  }

  function renderPortfolio(list) {
    const el = document.getElementById("portfolio-list");
    if (!list || list.length === 0) {
      el.innerHTML = `<p class="empty-note">No portfolio links added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((l) => `
      <a href="${escapeAttr(l.url)}" target="_blank" rel="noopener" class="portfolio-link-row" data-link-id="${l.id}">
        <span class="portfolio-link-row__icon"><i class="ti ti-link" aria-hidden="true"></i></span>
        <div>
          <p class="portfolio-link-row__title">${escapeHtml(l.title)}</p>
          <span class="portfolio-link-row__url">${escapeHtml(stripProtocol(l.url))}</span>
        </div>
        <i class="ti ti-external-link portfolio-link-row__ext" aria-hidden="true"></i>
      </a>
    `).join("");

    el.querySelectorAll("[data-link-id]").forEach((a) => {
      a.addEventListener("click", () => {
        fetch(`${API_BASE_URL}/Professional/track-portfolio-link-click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.dataset.linkId }),
        }).catch(() => {});
      });
    });
  }

  function renderResume(profile) {
    const el = document.getElementById("resume-block");
    if (!profile.resumeUrl) {
      el.innerHTML = `<p class="empty-note">No resume uploaded yet. <a href="resume.html?profileId=${encodeURIComponent(profile.id)}">Upload one</a>.</p>`;
      return;
    }
    el.innerHTML = `
      <div class="resume-row">
        <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
        <div>
          <div class="resume-row__name">Resume.pdf</div>
          <div class="resume-row__meta">${profile.resumeViewCount || 0} views · ${profile.resumeDownloadCount || 0} downloads</div>
        </div>
        <div class="resume-row__actions">
          <a href="${escapeAttr(profile.resumeUrl)}" target="_blank" rel="noopener" class="icon-btn icon-btn--ghost icon-btn--sm" id="resume-download-btn"><i class="ti ti-download" aria-hidden="true"></i></a>
        </div>
      </div>
    `;

    document.getElementById("resume-download-btn").addEventListener("click", () => {
      fetch(`${API_BASE_URL}/Professional/track-resume-download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalProfileId: profile.id }),
      }).catch(() => {});
    });
  }

  function renderAvailabilityCard(profile) {
    const el = document.getElementById("availability-block");
    const info = resolveStatus(profile.availabilityStatus);
    el.innerHTML = `
      <div class="availability-row">
        <span class="status-dot ${info.dot}"></span> ${info.label}
      </div>
      <p class="availability-row__desc">
        ${resolveStatus(profile.availabilityStatus).label === "Available" ? "Actively looking for new opportunities" : (profile.willingToRelocate ? "Open to relocating" : "")}
      </p>
    `;
  }

  function renderStatStrip(profile) {
    const el = document.getElementById("stat-strip");
    const stats = [
      { icon: "ti-briefcase", label: "Experience", value: `${(profile.experiences || []).length} entries` },
      { icon: "ti-school", label: "Education", value: `${(profile.educations || []).length} entries` },
      { icon: "ti-bulb", label: "Skills", value: `${(profile.skills || []).length} skills` },
      { icon: "ti-certificate", label: "Certifications", value: `${(profile.certificates || []).length} entries` },
      { icon: "ti-file-text", label: "Resume", value: profile.resumeUrl ? "Uploaded" : "Not uploaded" },
      { icon: "ti-link", label: "Portfolio", value: `${(profile.portfolioLinks || []).length} links` },
      { icon: "ti-calendar-event", label: "Availability", value: resolveStatus(profile.availabilityStatus).label },
    ];
    el.innerHTML = stats.map((s) => `
      <div class="stat-pill">
        <span class="stat-pill__icon"><i class="ti ${s.icon}" aria-hidden="true"></i></span>
        <div>
          <strong>${escapeHtml(s.value)}</strong>
          <span>${s.label}</span>
        </div>
      </div>
    `).join("");
  }

  function renderStrength(profile) {
    const checks = [
      (profile.experiences || []).length > 0,
      (profile.skills || []).length > 0,
      (profile.educations || []).length > 0,
      (profile.certificates || []).length > 0,
      !!profile.resumeUrl,
    ];
    const doneCount = checks.filter(Boolean).length;
    const pct = Math.round((doneCount / checks.length) * 100);

    document.getElementById("strength-pct").textContent = `${pct}%`;
    document.getElementById("strength-bar").style.width = `${pct}%`;
    document.getElementById("strength-message").textContent =
      pct === 100 ? "Great job! Your profile is complete." : "Great job! Your profile is almost complete.";

    const circumference = 2 * Math.PI * 52;
    const ring = document.getElementById("strength-ring");
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
  }

  function initials(name) {
    if (!name) return "?";
    return name.trim().charAt(0).toUpperCase();
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});