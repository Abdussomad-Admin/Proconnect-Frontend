document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  let mode = "all"; // "all" | "recommended"
  let currentPage = 1;
  const pageSize = 10;
  let currentWorkType = "";
  let savedJobIds = new Set();
  let totalCount = 0;
  let loadedCount = 0;

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Thin wrapper kept so every existing showAlert(message, isSuccess) call
  // site below didn't need touching — now routes to the global toast
  // (auto-dismisses on its own, so the old setTimeout hide is gone too).
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function experienceLabel(level) {
    const map = { EntryLevel: "Entry Level", Junior: "Junior", MidLevel: "Mid Level", Senior: "Senior", Lead: "Lead", Executive: "Executive" };
    return map[level] || level;
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    return `${Math.floor(days / 30)} month(s) ago`;
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `${currency} ${fmt(min)}-${fmt(max)}`;
    return `${currency} ${fmt(min || max)}+`;
  }

  // ---------------- Load saved job ids ----------------

  async function loadSavedJobIds() {
    try {
      const params = new URLSearchParams({ professionalProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getSavedJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        savedJobIds = new Set((result.data.items || []).map((s) => s.jobId));
      }
    } catch (err) {
      console.error("Saved jobs fetch threw an error:", err);
    }
  }

  // ---------------- Load categories (filter dropdown + strip) ----------------

  async function loadCategories() {
    try {
      const response = await fetch(API_ROUTES.getJobCategories, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        const select = document.getElementById("filter-category");
        result.data.forEach((cat) => {
          const opt = document.createElement("option");
          opt.value = cat.id;
          opt.textContent = cat.name;
          select.appendChild(opt);
        });

        const strip = document.getElementById("category-chips");
        strip.innerHTML = result.data.slice(0, 6).map((cat) => `
          <button type="button" class="js-category-chip" data-category-id="${cat.id}">
            ${escapeHtml(cat.name)} <span>${cat.jobCount}</span>
          </button>
        `).join("");

        strip.querySelectorAll("[data-category-id]").forEach((chip) => {
          chip.addEventListener("click", () => {
            if (mode !== "all") switchMode("all");
            document.getElementById("filter-category").value = chip.dataset.categoryId;
            currentPage = 1;
            searchJobs(false);
          });
        });
      }
    } catch (err) {
      console.error("Categories fetch threw an error:", err);
    }
  }

  // ---------------- Work-type facet counts ----------------

  function buildFacetParams() {
    const params = new URLSearchParams();

    const keyword = document.getElementById("keyword-input").value.trim();
    if (keyword) params.set("keyword", keyword);

    const location = document.getElementById("location-input").value.trim();
    if (location) params.set("location", location);

    const employmentType = document.getElementById("filter-employment-type").value;
    if (employmentType) params.set("employmentType", employmentType);

    const experienceLevel = document.getElementById("filter-experience-level").value;
    if (experienceLevel) params.set("experienceLevel", experienceLevel);

    const minSalary = document.getElementById("filter-min-salary").value;
    if (minSalary) params.set("minSalary", minSalary);

    const maxSalary = document.getElementById("filter-max-salary").value;
    if (maxSalary) params.set("maxSalary", maxSalary);

    const jobCategoryId = document.getElementById("filter-category").value;
    if (jobCategoryId) params.set("jobCategoryId", jobCategoryId);

    const postedWithinDays = document.getElementById("filter-posted-within").value;
    if (postedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(postedWithinDays));
      params.set("postedAfter", cutoff.toISOString());
    }

    return params;
  }

  async function loadFacetCounts() {
    try {
      const params = buildFacetParams();
      const response = await fetch(`${API_ROUTES.getJobSearchFacets}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        document.getElementById("count-remote").textContent = `(${result.data.remote})`;
        document.getElementById("count-onsite").textContent = `(${result.data.onsite})`;
        document.getElementById("count-hybrid").textContent = `(${result.data.hybrid})`;
      }
    } catch (err) {
      console.error("Facet counts fetch threw an error:", err);
    }
  }

  // ---------------- Mode tabs (All Jobs / Recommended) ----------------

  function switchMode(newMode) {
    mode = newMode;
    currentPage = 1;

    document.querySelectorAll(".js-mode-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === mode));

    const isRecommended = mode === "recommended";

    document.getElementById("search-card").hidden = isRecommended;
    document.getElementById("work-tabs").hidden = isRecommended;
    document.getElementById("filters-sidebar").hidden = isRecommended;
    document.getElementById("js-layout").classList.toggle("js-layout--single", isRecommended);

    document.getElementById("page-title").textContent = isRecommended ? "Recommended for you" : "Find your next opportunity";
    document.getElementById("page-subtitle").textContent = isRecommended
      ? "Jobs picked based on your skills and activity."
      : "Search thousands of jobs and connect with top companies.";

    document.getElementById("recommend-banner").hidden = true;

    if (isRecommended) {
      loadRecommended(false);
    } else {
      searchJobs(false);
    }
  }

  document.querySelectorAll(".js-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  });

  // ---------------- Popular search chips ----------------

  document.querySelectorAll(".js-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (mode !== "all") switchMode("all");
      document.getElementById("keyword-input").value = chip.dataset.keyword;
      currentPage = 1;
      searchJobs(false);
    });
  });

  // ---------------- Work type tabs ----------------

  document.querySelectorAll(".js-work-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".js-work-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentWorkType = tab.dataset.worktype;
      currentPage = 1;
      searchJobs(false);
    });
  });

  // ---------------- Search / filters triggers ----------------

  document.getElementById("search-btn").addEventListener("click", () => { currentPage = 1; searchJobs(false); });
  document.getElementById("keyword-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { currentPage = 1; searchJobs(false); } });
  document.getElementById("location-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { currentPage = 1; searchJobs(false); } });
  document.getElementById("sort-select").addEventListener("change", () => { currentPage = 1; if (mode === "all") searchJobs(false); });
  document.getElementById("apply-filters-btn").addEventListener("click", () => { currentPage = 1; searchJobs(false); });

  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("filter-employment-type").value = "";
    document.getElementById("filter-experience-level").value = "";
    document.getElementById("filter-min-salary").value = "";
    document.getElementById("filter-max-salary").value = "";
    document.getElementById("filter-category").value = "";
    document.getElementById("filter-posted-within").value = "";
    document.getElementById("keyword-input").value = "";
    document.getElementById("location-input").value = "";
    currentWorkType = "";
    document.querySelectorAll(".js-work-tab").forEach((t) => t.classList.remove("is-active"));
    document.querySelector('.js-work-tab[data-worktype=""]').classList.add("is-active");
    currentPage = 1;
    searchJobs(false);
  });

  document.getElementById("load-more-btn").addEventListener("click", () => {
    currentPage += 1;
    if (mode === "recommended") {
      loadRecommended(true);
    } else {
      searchJobs(true);
    }
  });

  // ---------------- Search (All Jobs mode) ----------------

  function buildParams(page) {
    const params = new URLSearchParams({
      pageNumber: page,
      pageSize,
      usePaging: "true",
      sortBy: document.getElementById("sort-select").value,
    });

    const keyword = document.getElementById("keyword-input").value.trim();
    if (keyword) params.set("keyword", keyword);

    const location = document.getElementById("location-input").value.trim();
    if (location) params.set("location", location);

    if (currentWorkType) params.set("workPlaceType", currentWorkType);

    const employmentType = document.getElementById("filter-employment-type").value;
    if (employmentType) params.set("employmentType", employmentType);

    const experienceLevel = document.getElementById("filter-experience-level").value;
    if (experienceLevel) params.set("experienceLevel", experienceLevel);

    const minSalary = document.getElementById("filter-min-salary").value;
    if (minSalary) params.set("minSalary", minSalary);

    const maxSalary = document.getElementById("filter-max-salary").value;
    if (maxSalary) params.set("maxSalary", maxSalary);

    const jobCategoryId = document.getElementById("filter-category").value;
    if (jobCategoryId) params.set("jobCategoryId", jobCategoryId);

    const postedWithinDays = document.getElementById("filter-posted-within").value;
    if (postedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(postedWithinDays));
      params.set("postedAfter", cutoff.toISOString());
    }

    return params;
  }

  async function searchJobs(append) {
    const loadingEl = document.getElementById("jobs-loading");
    const emptyEl = document.getElementById("jobs-empty");
    const listEl = document.getElementById("job-list");
    const loadMoreBtn = document.getElementById("load-more-btn");

    if (!append) {
      loadingEl.hidden = false;
      emptyEl.hidden = true;
      listEl.hidden = true;
      listEl.innerHTML = "";
      loadedCount = 0;
    }
    loadMoreBtn.hidden = true;

    const params = buildParams(currentPage);

    try {
      const response = await fetch(`${API_ROUTES.searchJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      loadingEl.hidden = true;

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load jobs.");
        return;
      }

      const items = result.data.items || [];
      totalCount = result.data.totalCount;
      loadedCount += items.length;

      document.getElementById("results-count").textContent = `${totalCount} job${totalCount === 1 ? "" : "s"} found`;

      if (!append && items.length === 0) {
        emptyEl.hidden = false;
      } else {
        listEl.hidden = false;
        renderJobs(items, append);
      }

      loadMoreBtn.hidden = loadedCount >= totalCount;

      if (!append) {
        loadFacetCounts();
      }

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Job search threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  // ---------------- Recommended mode ----------------

  async function loadRecommended(append) {
    const loadingEl = document.getElementById("jobs-loading");
    const emptyEl = document.getElementById("jobs-empty");
    const listEl = document.getElementById("job-list");
    const loadMoreBtn = document.getElementById("load-more-btn");

    if (!append) {
      loadingEl.hidden = false;
      emptyEl.hidden = true;
      listEl.hidden = true;
      listEl.innerHTML = "";
      loadedCount = 0;
    }
    loadMoreBtn.hidden = true;

    const params = new URLSearchParams({ professionalProfileId, pageNumber: currentPage, pageSize, usePaging: "true" });

    try {
      const response = await fetch(`${API_ROUTES.getRecommendedJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      loadingEl.hidden = true;

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load recommendations.");
        return;
      }

      const items = result.data.items || [];
      totalCount = result.data.totalCount;
      loadedCount += items.length;

      document.getElementById("results-count").textContent = `${totalCount} job${totalCount === 1 ? "" : "s"} found`;

      if (!append) {
        const banner = document.getElementById("recommend-banner");
        const isPersonalized = items.length > 0 && items[0].isPersonalized;
        banner.hidden = false;
        banner.classList.toggle("is-fallback", !isPersonalized);
        banner.innerHTML = isPersonalized
          ? `<i class="ti ti-sparkles" aria-hidden="true"></i> Based on the skills on your profile`
          : `<i class="ti ti-info-circle" aria-hidden="true"></i> Add skills to your profile to get personalized recommendations — showing newest jobs for now`;
      }

      if (!append && items.length === 0) {
        emptyEl.hidden = false;
      } else {
        listEl.hidden = false;
        renderJobs(items, append);
      }

      loadMoreBtn.hidden = loadedCount >= totalCount;

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Recommended jobs fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  // ---------------- Render (shared by both modes) ----------------

  function renderJobs(items, append) {
    const listEl = document.getElementById("job-list");
    const html = items.map((job) => {
      const salary = formatSalary(job.minSalary, job.maxSalary, job.currency);
      const isSaved = savedJobIds.has(job.id);

      return `
        <div class="js-job-card" data-job-id="${job.id}">
          <div class="js-job-card__logo">
            ${job.companyLogoUrl ? `<img src="${escapeHtml(job.companyLogoUrl)}" alt="" />` : `<i class="ti ti-building" aria-hidden="true"></i>`}
          </div>
          <div class="js-job-card__body">
            <p class="js-job-card__title">${escapeHtml(job.title)}</p>
            <p class="js-job-card__company">${escapeHtml(job.companyName)}</p>
            <div class="js-job-card__meta">
              <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(job.location)}</span>
              <span><i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${job.workPlaceType}</span>
              <span>${timeAgo(job.dateCreated)}</span>
            </div>
            <div class="js-job-card__tags">
              ${salary ? `<span class="js-tag">${escapeHtml(salary)}</span>` : ""}
              <span class="js-tag">${employmentLabel(job.employmentType)}</span>
              <span class="js-tag">${experienceLabel(job.experienceLevel)}</span>
            </div>
          </div>
          <div class="js-job-card__side">
            <button type="button" class="js-save-btn ${isSaved ? "is-saved" : ""}" data-job-id="${job.id}" title="${isSaved ? "Unsave" : "Save"}">
              <i class="ti ${isSaved ? "ti-bookmark-filled" : "ti-bookmark"}" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `;
    }).join("");

    if (append) {
      listEl.insertAdjacentHTML("beforeend", html);
    } else {
      listEl.innerHTML = html;
    }

    listEl.querySelectorAll(".js-job-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".js-save-btn")) return;
        // Traffic-source tagging: "All Jobs" tab is a literal keyword/filter
        // search, "Recommended" tab is an algorithmic pick — neither Direct
        // nor Network fits the latter cleanly, so it's tagged "other".
        const ref = mode === "recommended" ? "other" : "search";
        window.location.href = `job-details.html?id=${card.dataset.jobId}&ref=${ref}`;
      });
    });

    listEl.querySelectorAll(".js-save-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSaveJob(btn.dataset.jobId, btn);
      });
    });
  }

  async function toggleSaveJob(jobId, btn) {
    const isSaved = savedJobIds.has(jobId);
    btn.disabled = true;

    try {
      const endpoint = isSaved ? API_ROUTES.unsaveJob : API_ROUTES.saveJob;
      const body = isSaved
        ? { jobId, professionalProfileId }
        : { jobId, professionalProfileId, createdBy: userId || "unknown" };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't update saved jobs.");
      }

      if (isSaved) {
        savedJobIds.delete(jobId);
        btn.classList.remove("is-saved");
        btn.querySelector("i").className = "ti ti-bookmark";
        btn.title = "Save";
      } else {
        savedJobIds.add(jobId);
        btn.classList.add("is-saved");
        btn.querySelector("i").className = "ti ti-bookmark-filled";
        btn.title = "Unsave";
      }

    } catch (err) {
      console.error("Save/unsave failed:", err);
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------- Init ----------------

  const urlParams = new URLSearchParams(window.location.search);
  const urlCategoryId = urlParams.get("categoryId");
  const urlKeyword = urlParams.get("keyword");
  const urlTab = urlParams.get("tab");

  await loadSavedJobIds();
  await loadCategories();

  if (urlCategoryId) {
    document.getElementById("filter-category").value = urlCategoryId;
  }
  if (urlKeyword) {
    document.getElementById("keyword-input").value = urlKeyword;
  }

  if (urlTab === "recommended") {
    switchMode("recommended");
  } else {
    searchJobs(false);
  }
});