document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const STATUS_MAP = {
    Available: { label: "Available", dot: "is-available" },
    OpenToOffers: { label: "Open to Offers", dot: "is-open" },
    NotLooking: { label: "Not Looking", dot: "is-not-looking" },
    NotAvailable: { label: "Not Available", dot: "is-unavailable" },
  };

  const EXPERIENCE_BANDS = {
    "0-2": [0, 2],
    "3-5": [3, 5],
    "5-99": [5, null],
  };

  const PAGE_SIZE = 6;
  // "Recently Active" has no real last-active timestamp anywhere in the
  // data (SavedCandidateResponse has no such field, nor does
  // ProfessionalProfile expose one to this endpoint) — this tab is
  // approximated as "saved within the last 7 days AND currently Available",
  // which is NOT true activity tracking. Flagged clearly rather than
  // silently faked; replace once real activity data exists.
  const RECENT_WINDOW_DAYS = 7;

  const state = {
    tab: "all",
    keyword: "",
    skillNames: [],
    experienceBand: "",
    locationNames: [],
    educationLevel: "",
    availability: "",
    sort: "saved-newest",
    page: 1,
  };

  let allCandidates = []; // full fetched list, filtered/sorted client-side
  let selectedIds = new Set();
  let keywordDebounceTimer = null;

  await loadSavedCandidates();
  wireControls();

  loadingState.hidden = true;
  content.hidden = false;

  // ---------------- Data loading ----------------

  async function loadSavedCandidates() {
    try {
      const params = new URLSearchParams({ usePaging: "false" });
      const response = await fetch(`${API_BASE_URL}/Recruiter?${params.toString()}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (response.status === 401) return redirectToLogin();

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        showToast(result.message || "Couldn't load saved candidates.", "error");
        return;
      }

      allCandidates = result.data.items || [];
      buildDynamicFilterOptions();
      renderAll();
    } catch (err) {
      console.error("Saved candidates fetch threw an error:", err);
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  // ---------------- Dynamic filter option lists (Skills, Location) ----------------
  // Built from whatever's actually in the saved list, rather than a fixed
  // hardcoded list — makes more sense here than on Talent Search since
  // this set is small and known upfront from the one fetch.

  function buildDynamicFilterOptions() {
    const skillNames = new Set();
    const locations = new Set();

    allCandidates.forEach((c) => {
      (c.skills || []).forEach((s) => skillNames.add(s.name));
      if (c.currentLocation) locations.add(c.currentLocation);
    });

    const skillsEl = document.getElementById("skills-filter-list");
    skillsEl.innerHTML = [...skillNames].sort().slice(0, 10).map((name) => `
      <label class="filter-checkbox">
        <input type="checkbox" name="skill-filter" value="${escapeAttr(name)}" /> ${escapeHtml(name)}
      </label>
    `).join("") || `<p class="empty-note">No skills yet.</p>`;

    const locationEl = document.getElementById("location-filter-list");
    locationEl.innerHTML = [...locations].sort().slice(0, 10).map((loc) => `
      <label class="filter-checkbox">
        <input type="checkbox" name="location-filter" value="${escapeAttr(loc)}" /> ${escapeHtml(loc)}
      </label>
    `).join("") || `<p class="empty-note">No locations yet.</p>`;
  }

  // ---------------- Wiring ----------------

  function wireControls() {
    document.querySelectorAll(".sc-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sc-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        state.tab = tab.dataset.tab;
        state.page = 1;
        renderAll();
      });
    });

    const keywordInput = document.getElementById("keyword-input");
    keywordInput.addEventListener("input", () => {
      clearTimeout(keywordDebounceTimer);
      keywordDebounceTimer = setTimeout(() => {
        state.keyword = keywordInput.value.trim().toLowerCase();
        state.page = 1;
        renderAll();
      }, 350);
    });

    document.getElementById("sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderAll();
    });

    document.getElementById("select-all-checkbox").addEventListener("change", (e) => {
      const visibleIds = getFilteredSortedPage().map((c) => c.savedCandidateId);
      if (e.target.checked) {
        visibleIds.forEach((id) => selectedIds.add(id));
      } else {
        visibleIds.forEach((id) => selectedIds.delete(id));
      }
      renderList(getFilteredSortedPage());
    });

    document.getElementById("apply-filters-btn").addEventListener("click", () => {
      state.skillNames = checkedValues("skill-filter");
      state.locationNames = checkedValues("location-filter");
      state.experienceBand = document.getElementById("experience-select").value;
      state.educationLevel = document.getElementById("education-select").value;
      state.availability = document.getElementById("availability-select").value;
      state.page = 1;
      renderAll();
    });

    document.getElementById("reset-filters-btn").addEventListener("click", () => {
      document.querySelectorAll('#skills-filter-list input, #location-filter-list input').forEach((cb) => (cb.checked = false));
      document.getElementById("experience-select").value = "";
      document.getElementById("education-select").value = "";
      document.getElementById("availability-select").value = "";
      Object.assign(state, { skillNames: [], locationNames: [], experienceBand: "", educationLevel: "", availability: "", page: 1 });
      renderAll();
    });

    // Delegated: candidate card "more" dropdown + row actions + checkbox
    document.getElementById("candidate-list").addEventListener("click", (e) => {
      const moreBtn = e.target.closest(".candidate-more-btn");
      if (moreBtn) {
        e.stopPropagation();
        const menu = moreBtn.nextElementSibling;
        document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => {
          if (m !== menu) m.classList.remove("is-open");
        });
        menu.classList.toggle("is-open");
        return;
      }

      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));

        if (action === "message") messageCandidate(actionBtn.dataset.userId);
        else if (action === "remove") removeSavedCandidate(actionBtn.dataset.profileId);
        else if (action === "report") reportCandidate(actionBtn.dataset.profileId);
        return;
      }

      const checkbox = e.target.closest(".saved-candidate-card__checkbox");
      if (checkbox) {
        const id = checkbox.dataset.id;
        if (checkbox.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      }
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));
    });
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((cb) => cb.value);
  }

  // ---------------- Filter / sort / paginate (all client-side) ----------------

  function getFilteredSorted() {
    const now = Date.now();
    const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    let items = allCandidates.filter((c) => {
      if (state.keyword) {
        const haystack = `${c.fullName} ${c.headLine || ""} ${(c.skills || []).map((s) => s.name).join(" ")}`.toLowerCase();
        if (!haystack.includes(state.keyword)) return false;
      }

      if (state.skillNames.length > 0) {
        const candidateSkillNames = (c.skills || []).map((s) => s.name);
        if (!state.skillNames.some((s) => candidateSkillNames.includes(s))) return false;
      }

      if (state.locationNames.length > 0 && !state.locationNames.includes(c.currentLocation)) return false;

      if (state.experienceBand) {
        const [min, max] = EXPERIENCE_BANDS[state.experienceBand];
        if (c.totalYearsExperience < min) return false;
        if (max !== null && c.totalYearsExperience > max) return false;
      }

      if (state.educationLevel && !(c.highestDegree || "").includes(state.educationLevel)) return false;

      if (state.availability && c.availabilityStatus !== state.availability) return false;

      if (state.tab === "recent-added") {
        if (new Date(c.savedAt).getTime() < recentCutoff) return false;
      } else if (state.tab === "recent-active") {
        // See RECENT_WINDOW_DAYS comment above — proxy only.
        if (new Date(c.savedAt).getTime() < recentCutoff || c.availabilityStatus !== "Available") return false;
      } else if (state.tab === "top-talent") {
        if (!c.isTopPick) return false;
      }

      return true;
    });

    items = [...items].sort((a, b) => {
      switch (state.sort) {
        case "saved-oldest": return new Date(a.savedAt) - new Date(b.savedAt);
        case "match-desc": return b.matchScorePercent - a.matchScorePercent;
        case "years-desc": return b.totalYearsExperience - a.totalYearsExperience;
        case "name-asc": return a.fullName.localeCompare(b.fullName);
        case "saved-newest":
        default: return new Date(b.savedAt) - new Date(a.savedAt);
      }
    });

    return items;
  }

  function getFilteredSortedPage() {
    const items = getFilteredSorted();
    const start = (state.page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }

  // ---------------- Rendering ----------------

  function renderAll() {
    document.getElementById("count-all").textContent = `(${allCandidates.length})`;

    const filtered = getFilteredSorted();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;

    renderList(filtered.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE));
    renderPagination(filtered.length, totalPages);
  }

  function renderList(items) {
    const el = document.getElementById("candidate-list");

    if (!items || items.length === 0) {
      el.innerHTML = `<div class="results-empty">No saved candidates match these filters.</div>`;
      return;
    }

    el.innerHTML = items.map((c) => {
      const info = STATUS_MAP[c.availabilityStatus] || { label: c.availabilityStatus ?? "Unknown", dot: "" };
      const skills = (c.skills || []).slice(0, 4);
      const remaining = (c.skills || []).length - skills.length;
      const circumference = 2 * Math.PI * 24;
      const offset = circumference - (Math.min(c.matchScorePercent, 100) / 100) * circumference;
      const isChecked = selectedIds.has(c.savedCandidateId);

      return `
        <div class="card saved-candidate-card" data-saved-id="${c.savedCandidateId}">
          <input type="checkbox" class="saved-candidate-card__checkbox" data-id="${c.savedCandidateId}" ${isChecked ? "checked" : ""} />

          <img class="candidate-card__avatar" src="${escapeAttr(c.profilePictureUrl || defaultAvatar(c.fullName))}" alt="" />

          <div class="candidate-card__body">
            <div class="candidate-card__name-row">
              <h4 class="candidate-card__name">${escapeHtml(c.fullName)}</h4>
              ${c.isTopPick ? `<span class="sc-top-pick-badge">Top Pick</span>` : ""}
            </div>
            <p class="candidate-card__title">${escapeHtml(c.headLine || "—")}</p>
            <div class="candidate-card__meta">
              ${c.currentLocation ? `<span><i class="ti ti-map-pin" aria-hidden="true"></i>${escapeHtml(c.currentLocation)}</span>` : ""}
              <span><i class="ti ti-briefcase" aria-hidden="true"></i>${c.totalYearsExperience}+ years</span>
            </div>
            <div class="candidate-card__skills">
              ${skills.map((s) => `<span class="chip">${escapeHtml(s.name)}</span>`).join("")}
              ${remaining > 0 ? `<span class="chip">+${remaining}</span>` : ""}
            </div>
          </div>

          <div class="candidate-card__aside">
            <div class="match-ring">
              <svg viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="24" class="ring-track" />
                <circle cx="30" cy="30" r="24" class="ring-fill" style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};" />
              </svg>
              <div class="match-ring__pct">${Math.round(c.matchScorePercent)}%</div>
            </div>
          </div>

          <div class="saved-candidate-card__saved-col">
            <span class="saved-candidate-card__saved-at">Saved ${timeAgo(c.savedAt)}</span>
            <span class="status-pill"><span class="status-dot ${info.dot}"></span> ${info.label}</span>
            <div class="candidate-card__actions">
              <a href="profile.html?id=${encodeURIComponent(c.professionalProfileId)}" class="btn-primary btn-compact">View Profile</a>
              <button type="button" class="icon-btn icon-btn--ghost icon-btn--sm" data-action="message" data-user-id="${c.userId}" title="Message"><i class="ti ti-mail" aria-hidden="true"></i></button>
              <div class="dropdown-wrap">
                <button type="button" class="icon-btn icon-btn--ghost icon-btn--sm candidate-more-btn" title="More options"><i class="ti ti-dots" aria-hidden="true"></i></button>
                <div class="dropdown-menu">
                  <button type="button" class="dropdown-menu__item dropdown-menu__item--danger" data-action="remove" data-profile-id="${c.professionalProfileId}"><i class="ti ti-bookmark-off" aria-hidden="true"></i> Remove from Saved</button>
                  <button type="button" class="dropdown-menu__item" data-action="report" data-profile-id="${c.professionalProfileId}"><i class="ti ti-flag" aria-hidden="true"></i> Report</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPagination(totalCount, totalPages) {
    const el = document.getElementById("pagination");
    el.hidden = totalCount === 0;
    if (totalCount === 0) return;

    const start = (state.page - 1) * PAGE_SIZE + 1;
    const end = Math.min(state.page * PAGE_SIZE, totalCount);
    document.getElementById("showing-info").textContent = `Showing ${start}–${end} of ${totalCount} saved candidates`;

    const pagesEl = document.getElementById("pagination-pages");
    let buttons = `<button type="button" class="sc-page-btn" id="sc-prev" ${state.page <= 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>`;
    for (let p = 1; p <= totalPages; p++) {
      buttons += `<button type="button" class="sc-page-btn${p === state.page ? " is-active" : ""}" data-page="${p}">${p}</button>`;
    }
    buttons += `<button type="button" class="sc-page-btn" id="sc-next" ${state.page >= totalPages ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>`;
    pagesEl.innerHTML = buttons;

    pagesEl.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => { state.page = Number(btn.dataset.page); renderAll(); });
    });
    const prevBtn = document.getElementById("sc-prev");
    const nextBtn = document.getElementById("sc-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); renderAll(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { state.page = Math.min(totalPages, state.page + 1); renderAll(); });
  }

  // ---------------- Actions ----------------

  // Real endpoint per RecruiterController: POST /api/Recruiter/remove
  async function removeSavedCandidate(professionalProfileId) {
    try {
      const response = await fetch(`${API_BASE_URL}/Recruiter/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ professionalProfileId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't remove candidate.", "error");
        return;
      }

      allCandidates = allCandidates.filter((c) => c.professionalProfileId !== professionalProfileId);
      buildDynamicFilterOptions();
      renderAll();
      showToast("Candidate removed from saved list.", "success");
    } catch (err) {
      console.error("Remove saved candidate threw an error:", err);
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  // Same StartConversation flow used on Talent Search.
  async function messageCandidate(recipientUserId) {
    if (!recipientUserId) {
      showToast("Couldn't determine who to message.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_ROUTES.startConversation}?recipientId=${encodeURIComponent(recipientUserId)}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't start conversation.", "error");
        return;
      }

      window.location.href = `messages.html?conversationId=${encodeURIComponent(result.data)}`;
    } catch (err) {
      console.error("Start conversation threw an error:", err);
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  // Same stub as Talent Search — no backend endpoint for reports yet.
  function reportCandidate(professionalProfileId) {
    const reason = prompt("What's the reason for reporting this candidate?");
    if (!reason) return;

    console.log("Report queued (not yet sent — no backend endpoint yet):", { professionalProfileId, reason });
    showToast("Thanks — this will be submitted once reporting is wired up on the backend.", "info");
  }

  // ---------------- Helpers ----------------

  function redirectToLogin() {
    ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username", "pc_avatar_url"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.location.href = "login.html?reason=session-expired";
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return "1 week ago";
    if (weeks < 5) return `${weeks} weeks ago`;
    const months = Math.floor(days / 30);
    return months <= 1 ? "1 month ago" : `${months} months ago`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});