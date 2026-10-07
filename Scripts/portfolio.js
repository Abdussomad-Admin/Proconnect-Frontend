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

  let allLinks = [];
  let activeFilter = "all";

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
      loadingState.innerHTML = `<span>Couldn't load your portfolio. Check the console for details.</span>`;
      console.error("Portfolio fetch failed:", response.status, result);
      return;
    }

    populate(result.data);

    loadingState.hidden = true;
    content.hidden = false;

  } catch (err) {
    console.error("Portfolio fetch threw an error:", err);
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

    const viewPublicLink = document.getElementById("view-public-profile-link");
    if (viewPublicLink) viewPublicLink.href = `view-public-profile.html?id=${encodeURIComponent(profile.id)}`;

    allLinks = profile.portfolioLinks || [];
    renderStats();
    renderTabs();
    renderLinkList();
    renderStrength(profile);
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  // ---------------- Stats ----------------
  // "Profile Views" and "Link Clicks" are all-time totals summed across
  // every link's ViewCount/ClickCount — the reference design's "last 30
  // days" framing isn't something the backend tracks (no per-event
  // timestamps exist), so this shows an honest all-time total instead.

  function renderStats() {
    document.getElementById("stat-total-links").textContent = allLinks.length;
    document.getElementById("stat-total-views").textContent =
      allLinks.reduce((sum, l) => sum + (l.viewCount || 0), 0);
    document.getElementById("stat-total-clicks").textContent =
      allLinks.reduce((sum, l) => sum + (l.clickCount || 0), 0);
  }

  // ---------------- Tabs ----------------

  function renderTabs() {
    const counts = { Website: 0, Project: 0, Design: 0, Other: 0 };
    allLinks.forEach((l) => { if (counts[l.linkType] !== undefined) counts[l.linkType]++; });

    document.getElementById("count-all").textContent = `(${allLinks.length})`;
    document.getElementById("count-website").textContent = `(${counts.Website})`;
    document.getElementById("count-project").textContent = `(${counts.Project})`;
    document.getElementById("count-design").textContent = `(${counts.Design})`;
    document.getElementById("count-other").textContent = `(${counts.Other})`;
  }

  document.querySelectorAll(".pf-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".pf-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      activeFilter = tab.dataset.filter;
      renderLinkList();
    });
  });

  // ---------------- Link list ----------------

  function renderLinkList() {
    const el = document.getElementById("pf-link-list");
    const list = activeFilter === "all" ? allLinks : allLinks.filter((l) => l.linkType === activeFilter);

    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No links in this category yet.</p>`;
      return;
    }

    el.innerHTML = list.map((l) => `
      <div class="pf-link-card">
        ${l.thumbnailUrl
          ? `<img src="${escapeAttr(l.thumbnailUrl)}" alt="" class="pf-link-card__thumb" />`
          : `<div class="pf-link-card__thumb"></div>`}
        <div class="pf-link-card__body">
          <div class="pf-link-card__title-row">
            <strong>${escapeHtml(l.title)}</strong>
            <span class="chip">${escapeHtml(l.linkType)}</span>
          </div>
          <a href="${escapeAttr(l.url)}" target="_blank" rel="noopener" class="pf-link-card__url" data-track-click="${l.id}">
            ${escapeHtml(stripProtocol(l.url))} <i class="ti ti-external-link" aria-hidden="true"></i>
          </a>
          <p class="pf-link-card__desc">${escapeHtml(l.description || "")}</p>
          <span class="pf-link-card__date"><i class="ti ti-calendar" aria-hidden="true"></i> Added ${formatDate(l.dateCreated)}</span>
        </div>
        <div class="pf-link-card__stats">
          <div class="pf-link-card__stat"><strong>${l.viewCount || 0}</strong>Views</div>
          <div class="pf-link-card__stat"><strong>${l.clickCount || 0}</strong>Clicks</div>
          <div class="dropdown-wrap">
            <button class="icon-btn icon-btn--ghost icon-btn--sm" data-menu-toggle="${l.id}"><i class="ti ti-dots" aria-hidden="true"></i></button>
            <div class="dropdown-menu dropdown-menu--right" id="menu-${l.id}">
              <button type="button" class="dropdown-menu__item" data-edit-link="${l.id}"><i class="ti ti-pencil" aria-hidden="true"></i> Edit</button>
              <button type="button" class="dropdown-menu__item dropdown-menu__item--danger" data-delete-link="${l.id}"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>
            </div>
          </div>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-track-click]").forEach((a) => {
      a.addEventListener("click", () => {
        fetch(`${API_BASE_URL}/Professional/track-portfolio-link-click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.dataset.trackClick }),
        }).catch(() => {});
      });
    });

    el.querySelectorAll("[data-menu-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById(`menu-${btn.dataset.menuToggle}`);
        document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => { if (m !== menu) m.classList.remove("is-open"); });
        menu.classList.toggle("is-open");
      });
    });

    el.querySelectorAll("[data-edit-link]").forEach((btn) => {
      btn.addEventListener("click", () => openModal(allLinks.find((l) => l.id === btn.dataset.editLink)));
    });
    el.querySelectorAll("[data-delete-link]").forEach((btn) => {
      btn.addEventListener("click", () => deleteLink(btn.dataset.deleteLink));
    });
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));
  });

  // ---------------- Strength ----------------

  function renderStrength(profile) {
    const hasWebsite = allLinks.some((l) => l.linkType === "Website");
    const hasProjectCaseStudy = allLinks.some((l) => l.linkType === "Project");
    const hasDesign = allLinks.some((l) => l.linkType === "Design");
    const hasThreeLinks = allLinks.length >= 3;

    const checks = [
      { label: "Add at least 3 portfolio links", done: hasThreeLinks },
      { label: "Include project case studies", done: hasProjectCaseStudy },
      { label: "Add a personal website", done: hasWebsite },
      { label: "Add design projects", done: hasDesign },
    ];
    const pct = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

    document.getElementById("pf-strength-pct").textContent = `${pct}%`;
    document.getElementById("pf-strength-message").textContent =
      pct === 100 ? "Excellent! Your portfolio stands out." :
      pct >= 50 ? "Good progress! Add more to stand out." :
      "Add links to build your portfolio.";

    const circumference = 2 * Math.PI * 52;
    const ring = document.getElementById("pf-strength-ring");
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;

    document.getElementById("pf-checklist").innerHTML = checks.map((c) => `
      <li class="${c.done ? "is-done" : "is-todo"}">
        <i class="ti ${c.done ? "ti-circle-check-filled" : "ti-circle"}" aria-hidden="true"></i>
        ${c.label}
      </li>
    `).join("");
  }

  // ---------------- Modal ----------------

  const backdrop = document.getElementById("link-modal-backdrop");
  const form = document.getElementById("link-form");

  document.getElementById("add-link-btn-top").addEventListener("click", () => openModal(null));
  document.getElementById("add-link-btn-bottom").addEventListener("click", () => openModal(null));
  document.getElementById("link-modal-close").addEventListener("click", closeModal);
  document.getElementById("link-modal-cancel").addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

  function openModal(link) {
    document.getElementById("link-modal-title").textContent = link ? "Edit Link" : "Add New Link";
    document.getElementById("link-id").value = link ? link.id : "";
    document.getElementById("link-title").value = link ? link.title : "";
    document.getElementById("link-url").value = link ? link.url : "";
    document.getElementById("link-type").value = link ? link.linkType : "Website";
    document.getElementById("link-desc").value = link && link.description ? link.description : "";
    document.getElementById("link-thumbnail").value = "";
    backdrop.hidden = false;
  }

  function closeModal() {
    backdrop.hidden = true;
    form.reset();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("link-id").value;
    const submitBtn = document.getElementById("link-modal-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const formData = new FormData();
    if (id) formData.append("Id", id);
    else formData.append("ProfessionalProfileId", profileId);
    formData.append("Title", document.getElementById("link-title").value.trim());
    formData.append("Url", document.getElementById("link-url").value.trim());
    formData.append("LinkType", document.getElementById("link-type").value);
    formData.append("Description", document.getElementById("link-desc").value.trim());
    if (!id) formData.append("CreatedBy", userId);

    const thumbFile = document.getElementById("link-thumbnail").files[0];
    if (thumbFile) formData.append("Thumbnail", thumbFile);

    const url = id
      ? `${API_BASE_URL}/Professional/update-portfolio-link`
      : `${API_BASE_URL}/Professional/add-portfolio-link`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't save this link.", "error");
        return;
      }

      closeModal();
      await reload();

    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save";
    }
  });

  async function deleteLink(id) {
    if (!confirm("Delete this portfolio link?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/delete-portfolio-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ id, deletePermanently: false }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't delete this link.", "error");
        return;
      }

      await reload();
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

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

  function stripProtocol(url) {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});