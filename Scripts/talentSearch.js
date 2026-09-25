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

  // Experience-level checkbox bands map to [min, max] pairs. The search API
  // only accepts a single MinYearsExperience/MaxYearsExperience pair, so
  // checking more than one band widens the range to cover all checked bands
  // rather than truly OR-ing disjoint ranges.
  const EXPERIENCE_BANDS = {
    "0-2": [0, 2],
    "3-5": [3, 5],
    "5-99": [5, null],
  };

  // Saved Searches are stored per-browser until a real backend endpoint
  // exists for them. Move this to a server-side SavedSearch entity/command
  // if you want these to follow the recruiter across devices.
  const SAVED_SEARCHES_KEY = "pc_saved_talent_searches";
  const KEYWORD_DEBOUNCE_MS = 400;

  const state = {
    keyword: "",
    skillNames: [], // NOTE: stored as free-text names, not Guids — see note below
    experienceValues: [],
    educationValues: [],
    location: "",
    availabilityValues: [],
    pageNumber: 1,
    pageSize: 5,
    sort: "relevance",
  };

  let lastResults = [];
  let keywordDebounceTimer = null;

  wireStaticControls();
  renderSavedSearches();
  await Promise.all([loadInsights(), loadResults()]);

  loadingState.hidden = true;
  content.hidden = false;

  // ---------------- Wiring ----------------

  function wireStaticControls() {
    const keywordInput = document.getElementById("keyword-input");

    // Debounced-as-you-type search. Enter/Search-button still work and fire
    // immediately, clearing any pending debounce so there's no double fetch.
    keywordInput.addEventListener("input", () => {
      clearTimeout(keywordDebounceTimer);
      keywordDebounceTimer = setTimeout(() => {
        state.keyword = keywordInput.value.trim();
        state.pageNumber = 1;
        loadResults();
      }, KEYWORD_DEBOUNCE_MS);
    });

    document.getElementById("search-btn").addEventListener("click", () => {
      clearTimeout(keywordDebounceTimer);
      state.keyword = keywordInput.value.trim();
      state.pageNumber = 1;
      loadResults();
    });

    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("search-btn").click();
      }
    });

    document.getElementById("apply-filters-btn").addEventListener("click", () => {
      state.experienceValues = checkedValues("experience");
      state.educationValues = checkedValues("education");
      state.availabilityValues = checkedValues("availability");
      state.location = document.getElementById("location-input").value.trim();
      state.pageNumber = 1;
      loadResults();
    });

    document.getElementById("reset-filters-btn").addEventListener("click", () => {
      document.querySelectorAll('.filter-checkbox-list input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      document.getElementById("location-input").value = "";
      document.getElementById("keyword-input").value = "";
      state.skillNames = [];
      renderSkillChips();
      Object.assign(state, {
        keyword: "", experienceValues: [], educationValues: [], location: "", availabilityValues: [], pageNumber: 1,
      });
      loadResults();
    });

    document.getElementById("sort-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      renderCandidateList(sortResults(lastResults));
    });

    document.getElementById("page-prev-btn").addEventListener("click", () => {
      if (state.pageNumber > 1) {
        state.pageNumber -= 1;
        loadResults();
      }
    });

    document.getElementById("page-next-btn").addEventListener("click", () => {
      state.pageNumber += 1;
      loadResults();
    });

    document.getElementById("filters-toggle-btn").addEventListener("click", () => {
      document.getElementById("filter-panel").classList.toggle("is-open");
    });

    const skillInput = document.getElementById("skill-input");
    skillInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && skillInput.value.trim()) {
        e.preventDefault();
        addSkillChip(skillInput.value.trim());
        skillInput.value = "";
      }
    });

    // ---------------- Candidate card "more" dropdown + actions ----------------
    // Event delegation on the list container, since cards are re-rendered
    // on every search/page change — binding directly to buttons would lose
    // listeners each time.

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

        if (action === "save") saveCandidate(actionBtn.dataset.id, actionBtn);
        else if (action === "message") messageCandidate(actionBtn.dataset.userId);
        else if (action === "report") reportCandidate(actionBtn.dataset.id);
      }
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));
    });

    // ---------------- Saved Searches ----------------
    // Guarded: only wires up if talent-search.html includes the Saved
    // Searches card (added when the old "Save time with AI" card was
    // replaced). Missing it here previously crashed every listener below
    // it in this function — if this logs a warning, you're on an older
    // copy of talent-search.html.

    const saveSearchBtn = document.getElementById("save-search-btn");
    if (saveSearchBtn) {
      saveSearchBtn.addEventListener("click", saveCurrentSearch);
    } else {
      console.warn("#save-search-btn not found — talent-search.html may be out of date (missing the Saved Searches card).");
    }
  }

  function checkedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((cb) => cb.value);
  }

  // ---------------- Skill chips ----------------
  // TODO: these are free-text names, not the Guid SkillIds the search API
  // expects (TalentSearchFilterRequest.SkillIds : List<Guid>). There's no
  // skills-lookup/autocomplete wired into this page yet to resolve a typed
  // name to an id, so skill chips are currently UI-only and are NOT sent to
  // the search request below.

  function addSkillChip(name) {
    if (state.skillNames.includes(name)) return;
    state.skillNames.push(name);
    renderSkillChips();
  }

  function renderSkillChips() {
    const el = document.getElementById("skill-chips");
    el.innerHTML = state.skillNames.map((name, i) => `
      <span class="filter-skill-chip">
        ${escapeHtml(name)}
        <button type="button" data-index="${i}" aria-label="Remove ${escapeAttr(name)}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>
    `).join("");

    el.querySelectorAll("button[data-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.skillNames.splice(Number(btn.dataset.index), 1);
        renderSkillChips();
      });
    });
  }

  // ---------------- Data loading ----------------

  function buildSearchParams(pageSize) {
    const params = new URLSearchParams();

    if (state.keyword) params.set("Keyword", state.keyword);
    if (state.location) params.set("Location", state.location);

    if (state.educationValues.length > 0) params.set("EducationLevel", state.educationValues[0]);
    if (state.availabilityValues.length > 0) params.set("Availability", state.availabilityValues[0]);

    if (state.experienceValues.length > 0) {
      const ranges = state.experienceValues.map((v) => EXPERIENCE_BANDS[v]);
      const mins = ranges.map((r) => r[0]);
      const maxes = ranges.map((r) => r[1]);
      params.set("MinYearsExperience", Math.min(...mins));
      if (!maxes.includes(null)) params.set("MaxYearsExperience", Math.max(...maxes));
    }

    params.set("PageNumber", state.pageNumber);
    params.set("PageSize", pageSize ?? state.pageSize);
    params.set("UsePaging", "true");

    return params;
  }

  async function loadResults() {
    const list = document.getElementById("candidate-list");
    list.innerHTML = `<div class="results-loading"><span class="spinner spinner--dark"></span> Loading candidates...</div>`;

    try {
      const params = buildSearchParams();
      const response = await fetch(`${API_BASE_URL}/talent-search?${params.toString()}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (response.status === 401) return redirectToLogin();

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        list.innerHTML = `<div class="results-error">Couldn't load candidates: ${escapeHtml(result.message || response.status)}</div>`;
        return;
      }

      const page = result.data;
      lastResults = page.items || [];
      document.getElementById("results-count").textContent = page.totalCount ?? lastResults.length;
      renderCandidateList(sortResults(lastResults));
      renderPagination(page);
    } catch (err) {
      console.error("Talent search fetch threw an error:", err);
      list.innerHTML = `<div class="results-error">Couldn't reach the server. Check your connection and try again.</div>`;
    }
  }

  async function loadInsights() {
    try {
      const response = await fetch(`${API_BASE_URL}/talent-search/insights`, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (response.status === 401) return redirectToLogin();

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        console.error("Insights fetch failed:", response.status, result);
        return;
      }

      renderInsights(result.data);
    } catch (err) {
      console.error("Insights fetch threw an error:", err);
    }

    try {
      const params = new URLSearchParams({ PageNumber: 1, PageSize: 5, UsePaging: "true" });
      const response = await fetch(`${API_BASE_URL}/talent-search?${params.toString()}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status) {
        const items = [...(result.data.items || [])].sort((a, b) => b.matchScorePercent - a.matchScorePercent);
        renderRecommended(items);
      }
    } catch (err) {
      console.error("Recommended candidates fetch threw an error:", err);
    }
  }

  // ---------------- Rendering ----------------

  function sortResults(items) {
    const copy = [...items];
    if (state.sort === "years-desc") {
      copy.sort((a, b) => b.totalYearsExperience - a.totalYearsExperience);
    } else if (state.sort === "relevance") {
      copy.sort((a, b) => b.matchScorePercent - a.matchScorePercent);
    }
    return copy;
  }

  function renderCandidateList(items) {
    const el = document.getElementById("candidate-list");

    if (!items || items.length === 0) {
      el.innerHTML = `<div class="results-empty">No candidates match these filters. Try broadening your search.</div>`;
      return;
    }

    el.innerHTML = items.map((c) => {
      const info = STATUS_MAP[c.availabilityStatus] || { label: c.availabilityStatus ?? "Unknown", dot: "" };
      const skills = (c.skills || []).slice(0, 4);
      const remaining = (c.skills || []).length - skills.length;
      const circumference = 2 * Math.PI * 24;
      const offset = circumference - (Math.min(c.matchScorePercent, 100) / 100) * circumference;

      return `
        <div class="card candidate-card" data-profile-id="${c.professionalProfileId}">
          <img class="candidate-card__avatar" src="${escapeAttr(c.profilePictureUrl || defaultAvatar(c.fullName))}" alt="" />
          <div class="candidate-card__body">
            <div class="candidate-card__name-row">
              <h4 class="candidate-card__name">${escapeHtml(c.fullName)}</h4>
              <span class="status-pill"><span class="status-dot ${info.dot}"></span> ${info.label}</span>
            </div>
            <p class="candidate-card__title">${escapeHtml(c.headLine || "—")}</p>
            <div class="candidate-card__meta">
              ${c.currentLocation ? `<span><i class="ti ti-map-pin" aria-hidden="true"></i>${escapeHtml(c.currentLocation)}</span>` : ""}
              <span><i class="ti ti-briefcase" aria-hidden="true"></i>${c.totalYearsExperience}+ years</span>
              ${c.highestDegree ? `<span><i class="ti ti-school" aria-hidden="true"></i>${escapeHtml(c.highestDegree)}${c.institution ? " · " + escapeHtml(c.institution) : ""}</span>` : ""}
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
            <div class="candidate-card__actions">
              <a href="profile.html?id=${encodeURIComponent(c.professionalProfileId)}" class="btn-primary btn-compact">View Profile</a>
              <div class="dropdown-wrap">
                <button type="button" class="icon-btn icon-btn--ghost icon-btn--sm candidate-more-btn" title="More options"><i class="ti ti-dots" aria-hidden="true"></i></button>
                <div class="dropdown-menu">
                  <button type="button" class="dropdown-menu__item" data-action="save" data-id="${c.professionalProfileId}"><i class="ti ti-bookmark" aria-hidden="true"></i> Save Candidate</button>
                  <button type="button" class="dropdown-menu__item" data-action="message" data-user-id="${c.userId}"><i class="ti ti-message-circle" aria-hidden="true"></i> Message</button>
                  <a href="profile.html?id=${encodeURIComponent(c.professionalProfileId)}" class="dropdown-menu__item"><i class="ti ti-eye" aria-hidden="true"></i> View Full Profile</a>
                  <button type="button" class="dropdown-menu__item dropdown-menu__item--danger" data-action="report" data-id="${c.professionalProfileId}"><i class="ti ti-flag" aria-hidden="true"></i> Report</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPagination(page) {
    const el = document.getElementById("pagination");
    const totalPages = Math.max(1, Math.ceil(page.totalCount / page.pageSize));
    el.hidden = totalPages <= 1;
    document.getElementById("page-info").textContent = `Page ${page.pageNumber} of ${totalPages}`;
    document.getElementById("page-prev-btn").disabled = page.pageNumber <= 1;
    document.getElementById("page-next-btn").disabled = page.pageNumber >= totalPages;
  }

  function renderInsights(insights) {
    const el = document.getElementById("insight-stats");
    const stats = [
      { icon: "ti-users", value: insights.totalCandidates, label: "Total Candidates" },
      { icon: "ti-trending-up", value: insights.newThisWeek, label: "New This Week" },
      { icon: "ti-target", value: `${Math.round(insights.averageMatchRatePercent)}%`, label: "Match Rate (Avg.)" },
      { icon: "ti-briefcase", value: insights.hiresThisMonth, label: "Hires This Month" },
    ];
    el.innerHTML = stats.map((s) => `
      <div class="insight-stat">
        <span class="insight-stat__icon"><i class="ti ${s.icon}" aria-hidden="true"></i></span>
        <div>
          <strong>${s.value}</strong>
          <span>${s.label}</span>
        </div>
      </div>
    `).join("");

    const skillsEl = document.getElementById("top-skills-list");
    skillsEl.innerHTML = (insights.topSkills || []).map((s) => `
      <span class="top-skill-tag">${escapeHtml(s.skillName)} <span>(${s.candidateCount})</span></span>
    `).join("") || `<p class="empty-note">No skill data yet.</p>`;
  }

  function renderRecommended(items) {
    const el = document.getElementById("recommended-list");
    if (!items || items.length === 0) {
      el.innerHTML = `<p class="empty-note">No recommendations yet.</p>`;
      return;
    }
    el.innerHTML = items.map((c) => `
      <div class="recommended-row">
        <img class="recommended-row__avatar" src="${escapeAttr(c.profilePictureUrl || defaultAvatar(c.fullName))}" alt="" />
        <div>
          <p class="recommended-row__name">${escapeHtml(c.fullName)}</p>
          <span class="recommended-row__title">${escapeHtml(c.headLine || "—")}</span>
        </div>
        <span class="recommended-row__match">${Math.round(c.matchScorePercent)}% match</span>
      </div>
    `).join("");
  }

  // ---------------- Candidate card actions ----------------

  // Real endpoint: POST /api/saved-candidates, body { professionalProfileId }.
  // Matches SavedCandidatesController.Save / SaveCandidateRequest.
  async function saveCandidate(professionalProfileId, btn) {
    const original = btn.innerHTML;
    btn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/saved-candidates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ professionalProfileId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't save candidate.", "error");
        return;
      }

      showToast("Candidate saved.", "success");
      btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Saved`;
      setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
      return;
    } catch (err) {
      console.error("Save candidate threw an error:", err);
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }

    btn.disabled = false;
  }

  // Uses the real MessagesController: POST /api/Messages/start-conversation
  // with recipientId as a query param (matches StartConversationCommand's
  // (currentUserId, recipientId) shape). recipientId here is the
  // candidate's User.Id (CandidateCardResponse.UserId), NOT their
  // ProfessionalProfileId — those are different ids. result.data is the
  // conversation id.
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

  // No backend endpoint for reports exists yet. This collects the reason
  // and logs it so the UI isn't a dead end — paste whatever command/route
  // handles reporting and I'll wire this to actually submit.
  function reportCandidate(professionalProfileId) {
    const reason = prompt("What's the reason for reporting this candidate?");
    if (!reason) return;

    console.log("Report queued (not yet sent — no backend endpoint yet):", { professionalProfileId, reason });
    showToast("Thanks — this will be submitted once reporting is wired up on the backend.", "info");
  }

  // ---------------- Saved Searches (localStorage) ----------------

  function loadSavedSearches() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function persistSavedSearches(list) {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(list));
  }

  function saveCurrentSearch() {
    const hasAnyFilter = state.keyword || state.location || state.experienceValues.length
      || state.educationValues.length || state.availabilityValues.length;

    if (!hasAnyFilter) {
      showToast("Apply at least one filter or search term before saving.", "error");
      return;
    }

    const defaultLabel = [state.keyword, state.location].filter(Boolean).join(" · ") || "Untitled search";
    const label = prompt("Name this saved search:", defaultLabel);
    if (!label) return;

    const saved = loadSavedSearches();
    saved.unshift({
      id: `${Date.now()}`,
      label,
      filters: {
        keyword: state.keyword,
        location: state.location,
        experienceValues: [...state.experienceValues],
        educationValues: [...state.educationValues],
        availabilityValues: [...state.availabilityValues],
      },
    });
    persistSavedSearches(saved.slice(0, 10)); // cap so this never grows unbounded
    renderSavedSearches();
  }

  function applySavedSearch(id) {
    const saved = loadSavedSearches().find((s) => s.id === id);
    if (!saved) return;

    const f = saved.filters;
    document.getElementById("keyword-input").value = f.keyword || "";
    document.getElementById("location-input").value = f.location || "";

    document.querySelectorAll('input[name="experience"]').forEach((cb) => (cb.checked = f.experienceValues.includes(cb.value)));
    document.querySelectorAll('input[name="education"]').forEach((cb) => (cb.checked = f.educationValues.includes(cb.value)));
    document.querySelectorAll('input[name="availability"]').forEach((cb) => (cb.checked = f.availabilityValues.includes(cb.value)));

    Object.assign(state, {
      keyword: f.keyword || "",
      location: f.location || "",
      experienceValues: [...f.experienceValues],
      educationValues: [...f.educationValues],
      availabilityValues: [...f.availabilityValues],
      pageNumber: 1,
    });

    loadResults();
  }

  function deleteSavedSearch(id) {
    persistSavedSearches(loadSavedSearches().filter((s) => s.id !== id));
    renderSavedSearches();
  }

  function renderSavedSearches() {
    const el = document.getElementById("saved-search-list");
    const saved = loadSavedSearches();

    if (saved.length === 0) {
      el.innerHTML = `<p class="empty-note">No saved searches yet.</p>`;
      return;
    }

    el.innerHTML = saved.map((s) => `
      <div class="saved-search-row" data-id="${s.id}">
        <i class="ti ti-bookmark saved-search-row__icon" aria-hidden="true"></i>
        <span class="saved-search-row__label">${escapeHtml(s.label)}</span>
        <button type="button" class="saved-search-row__delete" data-delete-id="${s.id}" title="Delete"><i class="ti ti-x" aria-hidden="true"></i></button>
      </div>
    `).join("");

    el.querySelectorAll(".saved-search-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-delete-id]")) return;
        applySavedSearch(row.dataset.id);
      });
    });

    el.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSavedSearch(btn.dataset.deleteId);
      });
    });
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

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});