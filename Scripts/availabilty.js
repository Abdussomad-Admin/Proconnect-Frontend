document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const profileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !profileId) {
    window.location.href = "login.html";
    return;
  }

  const STATUS_INFO = {
    Available: { label: "Available", desc: "Actively looking for new opportunities", dot: "av-dot-available", pillDot: "is-available", iconBg: "#E8F7EE", iconColor: "#22C55E" },
    OpenToOffers: { label: "Open to Offers", desc: "Open to interesting opportunities", dot: "av-dot-open", pillDot: "is-open", iconBg: "#FEF3E2", iconColor: "#F59E0B" },
    NotLooking: { label: "Not Looking", desc: "Not looking for new opportunities", dot: "av-dot-not-looking", pillDot: "is-not-looking", iconBg: "var(--pc-purple-light)", iconColor: "var(--pc-purple)" },
    NotAvailable: { label: "Not Available", desc: "Not available for new opportunities", dot: "av-dot-unavailable", pillDot: "is-unavailable", iconBg: "#F1F1F4", iconColor: "#9A9AAE" },
  };

  const VISIBILITY_LABELS = {
    AllRecruiters: "Visible to all recruiters",
    MyNetworkOnly: "Visible to your network only",
    Hidden: "Hidden from recruiters",
  };

  const JOB_TYPE_LABELS = {
    FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract",
    Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote",
  };

  let selectedStatus = "Available";
  let selectedVisibility = "AllRecruiters";
  let jobTypes = [];
  let locations = [];

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
      loadingState.innerHTML = `<span>Couldn't load your availability. Check the console for details.</span>`;
      console.error("Availability fetch failed:", response.status, result);
      return;
    }

    populate(result.data);

    loadingState.hidden = true;
    content.hidden = false;

  } catch (err) {
    console.error("Availability fetch threw an error:", err);
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

    selectedStatus = profile.availabilityStatus || "Available";
    selectedVisibility = profile.availabilityVisibility || "AllRecruiters";
    jobTypes = [...(profile.preferredJobTypes || [])];
    locations = [...(profile.preferredLocations || [])];

    document.getElementById("earliest-start").value = profile.earliestStartDate
      ? profile.earliestStartDate.split("T")[0] : "";
    document.getElementById("willing-relocate").checked = !!profile.willingToRelocate;
    document.getElementById("work-auth").value = profile.workAuthorization || "AuthorizedNoSponsorship";

    renderStatusCards();
    renderVisibilityCards();
    renderJobTypeChips();
    renderLocationChips();
    renderCurrentBanner();
    renderSummary(profile);

    document.getElementById("preview-photo").src = avatarSrc;
    document.getElementById("preview-name").textContent = fullName;
    document.getElementById("preview-headline").textContent = profile.headLine || "No headline added yet";

    const viewPublicLink = document.getElementById("view-public-profile-link");
    if (viewPublicLink) viewPublicLink.href = `view-public-profile.html?id=${encodeURIComponent(profile.id)}`;
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  // ---------------- Status selector ----------------

  function renderStatusCards() {
    document.querySelectorAll(".av-status-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.status === selectedStatus);
    });
    renderCurrentBanner();
    updatePreviewPill();
  }

  document.querySelectorAll(".av-status-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedStatus = card.dataset.status;
      renderStatusCards();
    });
  });

  document.getElementById("change-status-btn").addEventListener("click", () => {
    document.getElementById("status-selector-section").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  function renderCurrentBanner() {
    const info = STATUS_INFO[selectedStatus];
    document.getElementById("current-status-label").textContent = info.label;
    document.getElementById("current-status-desc").textContent = info.desc;
    document.getElementById("current-visibility-label").textContent =
      `Status visible to ${selectedVisibility === "AllRecruiters" ? "recruiters" : selectedVisibility === "MyNetworkOnly" ? "your network" : "no one"}`;

    const icon = document.getElementById("current-status-icon");
    icon.style.background = info.iconBg;
    icon.style.color = info.iconColor;

    const summaryIcon = document.getElementById("summary-status-icon");
    summaryIcon.style.background = info.iconBg;
    summaryIcon.style.color = info.iconColor;
    document.getElementById("summary-status-label").textContent = info.label;
    document.getElementById("summary-status-desc").textContent = info.desc;
  }

  function updatePreviewPill() {
    const info = STATUS_INFO[selectedStatus];
    document.getElementById("preview-status-pill").innerHTML =
      `<span class="status-dot ${info.pillDot}"></span> ${info.label}`;
  }

  // ---------------- Visibility selector ----------------

  function renderVisibilityCards() {
    document.querySelectorAll(".av-visibility-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.visibility === selectedVisibility);
    });
    renderCurrentBanner();
  }

  document.querySelectorAll(".av-visibility-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedVisibility = card.dataset.visibility;
      renderVisibilityCards();
    });
  });

  // ---------------- Job type tags ----------------

  function renderJobTypeChips() {
    const el = document.getElementById("job-types-chips");
    el.innerHTML = jobTypes.map((jt) => `
      <span class="chip chip-removable">
        ${JOB_TYPE_LABELS[jt] || jt}
        <button type="button" data-remove-job-type="${jt}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>
    `).join("");
    el.querySelectorAll("[data-remove-job-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        jobTypes = jobTypes.filter((jt) => jt !== btn.dataset.removeJobType);
        renderJobTypeChips();
      });
    });
  }

  document.getElementById("job-types-select").addEventListener("change", (e) => {
    const val = e.target.value;
    if (val && !jobTypes.includes(val)) {
      jobTypes.push(val);
      renderJobTypeChips();
    }
    e.target.value = "";
  });

  // ---------------- Location tags ----------------

  function renderLocationChips() {
    const el = document.getElementById("locations-chips");
    el.innerHTML = locations.map((loc) => `
      <span class="chip chip-removable">
        ${escapeHtml(loc)}
        <button type="button" data-remove-location="${escapeAttr(loc)}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>
    `).join("");
    el.querySelectorAll("[data-remove-location]").forEach((btn) => {
      btn.addEventListener("click", () => {
        locations = locations.filter((loc) => loc !== btn.dataset.removeLocation);
        renderLocationChips();
      });
    });
  }

  document.getElementById("locations-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && !locations.includes(val)) {
        locations.push(val);
        renderLocationChips();
      }
      e.target.value = "";
    }
  });

  // ---------------- Summary sidebar ----------------

  function renderSummary(profile) {
    const items = [
      { icon: "ti-briefcase", label: "Preferred Job Types", value: jobTypes.length ? jobTypes.map((t) => JOB_TYPE_LABELS[t] || t).join(", ") : "Not set" },
      { icon: "ti-map-pin", label: "Preferred Locations", value: locations.length ? locations.join(", ") : "Not set" },
      { icon: "ti-calendar", label: "Earliest Start Date", value: profile.earliestStartDate ? formatDate(profile.earliestStartDate) : "Not set" },
      { icon: "ti-plane", label: "Willing to Relocate", value: profile.willingToRelocate ? "Yes" : "No" },
      { icon: "ti-shield-check", label: "Work Authorization", value: workAuthLabel(profile.workAuthorization) },
    ];
    document.getElementById("summary-list").innerHTML = items.map((i) => `
      <li>
        <span class="label"><i class="ti ${i.icon}" aria-hidden="true"></i> ${i.label}</span>
        <span class="value">${escapeHtml(i.value)}</span>
      </li>
    `).join("");
  }

  function workAuthLabel(val) {
    if (val === "RequiresSponsorship") return "Requires sponsorship";
    if (val === "NotAuthorized") return "Not authorized";
    return "Authorized — no sponsorship";
  }

  // ---------------- Save ----------------

  document.getElementById("save-availability-btn").addEventListener("click", async () => {
    const body = {
      userId,
      availabilityStatus: selectedStatus,
      preferredJobTypes: jobTypes,
      preferredLocations: locations,
      earliestStartDate: document.getElementById("earliest-start").value || null,
      willingToRelocate: document.getElementById("willing-relocate").checked,
      workAuthorization: document.getElementById("work-auth").value,
      availabilityVisibility: selectedVisibility,
    };

    const btn = document.getElementById("save-availability-btn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/update-availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't save your availability.", "error");
        return;
      }

      btn.textContent = "Saved!";
      showToast("Availability updated.", "success");
      renderSummary({ ...body, earliestStartDate: body.earliestStartDate });
      setTimeout(() => { btn.textContent = originalLabel; }, 1200);

    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
      if (btn.textContent === "Saving...") btn.textContent = originalLabel;
    }
  });

  // ---------------- Helpers ----------------

  function formatDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});