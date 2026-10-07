document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  const PAGE_SIZE = 5;

  let allSavedJobs = [];
  let applicationStatusByJobId = new Map();
  let filteredJobs = [];
  let currentPage = 1;

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Routes to the global toast (Scripts/toast.js); call sites unchanged.
  // Auto-dismisses on its own, so the old setTimeout hide is gone too.
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    return `${currency} ${fmt(min || max)}+`;
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

  function savedTimeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Saved today";
    if (days === 1) return "Saved 1 day ago";
    if (days < 7) return `Saved ${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `Saved ${weeks} week${weeks > 1 ? "s" : ""} ago`;
    return `Saved ${Math.floor(days / 30)} month(s) ago`;
  }

  const STATUS_BADGE_CLASS = {
    New: "jm-status-badge--new", Screening: "jm-status-badge--screening", Shortlisted: "jm-status-badge--shortlisted",
    Interview: "jm-status-badge--interview", Offered: "jm-status-badge--offered", Hired: "jm-status-badge--hired",
    Rejected: "jm-status-badge--rejected",
  };
  const IN_PROGRESS_STATUSES = new Set(["Screening", "Shortlisted", "Interview", "Offered"]);

  function statusBadge(jobId) {
    const status = applicationStatusByJobId.get(jobId);
    if (!status) {
      return `<span class="jm-status-badge jm-status-badge--notapplied">Not Applied</span>`;
    }
    return `<span class="jm-status-badge ${STATUS_BADGE_CLASS[status] || "jm-status-badge--new"}">${status}</span>`;
  }

  // ---------------- Load data ----------------

  async function loadData() {
    const loadingEl = document.getElementById("jobs-loading");
    loadingEl.hidden = false;

    try {
      const [savedResponse, applicationsResponse] = await Promise.all([
        fetch(`${API_ROUTES.getSavedJobs}?${new URLSearchParams({ professionalProfileId, usePaging: "false" })}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_ROUTES.getApplicationsByProfessional}?${new URLSearchParams({ professionalProfileId, usePaging: "false" })}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (savedResponse.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      const savedResult = await savedResponse.json().catch(() => ({}));
      const applicationsResult = await applicationsResponse.json().catch(() => ({}));

      loadingEl.hidden = true;

      if (!savedResponse.ok || !savedResult.data) {
        showAlert(savedResult.message || "Couldn't load your saved jobs.");
        return;
      }

      allSavedJobs = savedResult.data.items || [];

      if (applicationsResponse.ok && applicationsResult.data) {
        (applicationsResult.data.items || []).forEach((a) => {
          applicationStatusByJobId.set(a.jobId, a.jobStatus);
        });
      }

      document.getElementById("tab-count").textContent = allSavedJobs.length;

      if (allSavedJobs.length === 0) {
        document.getElementById("jobs-empty").hidden = false;
        renderOverview();
        return;
      }

      populateLocationFilter();
      renderOverview();
      applyFiltersAndRender();

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Saved jobs load threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function populateLocationFilter() {
    const locations = [...new Set(allSavedJobs.map((j) => j.location).filter(Boolean))].sort();
    const select = document.getElementById("filter-location");
    locations.forEach((loc) => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = loc;
      select.appendChild(opt);
    });
  }

  function renderOverview() {
    const total = allSavedJobs.length;
    let applied = 0;
    let inProgress = 0;

    allSavedJobs.forEach((j) => {
      const status = applicationStatusByJobId.get(j.jobId);
      if (status) applied += 1;
      if (IN_PROGRESS_STATUSES.has(status)) inProgress += 1;
    });

    document.getElementById("overview-total").textContent = total;
    document.getElementById("overview-applied").textContent = applied;
    document.getElementById("overview-progress").textContent = inProgress;
  }

  // ---------------- Filters / search / sort ----------------

  function applyFiltersAndRender() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    const location = document.getElementById("filter-location").value;
    const type = document.getElementById("filter-type").value;
    const timeDays = document.getElementById("filter-time").value;
    const sort = document.getElementById("sort-select").value;

    filteredJobs = allSavedJobs.filter((j) => {
      if (keyword && !(j.jobTitle.toLowerCase().includes(keyword) || j.companyName.toLowerCase().includes(keyword))) return false;
      if (location && j.location !== location) return false;
      if (type && j.employmentType !== type) return false;
      if (timeDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Number(timeDays));
        if (new Date(j.savedAt) < cutoff) return false;
      }
      return true;
    });

    if (sort === "recent") {
      filteredJobs.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } else if (sort === "oldest") {
      filteredJobs.sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
    } else if (sort === "title") {
      filteredJobs.sort((a, b) => a.jobTitle.localeCompare(b.jobTitle));
    }

    currentPage = 1;
    renderPage();
  }

  document.getElementById("search-input").addEventListener("input", debounce(applyFiltersAndRender, 300));
  ["filter-location", "filter-type", "filter-time", "sort-select"].forEach((id) =>
    document.getElementById(id).addEventListener("change", applyFiltersAndRender)
  );

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------------- Render page ----------------

  function renderPage() {
    const listEl = document.getElementById("job-list");
    const noMatchEl = document.getElementById("jobs-no-match");
    const paginationEl = document.getElementById("pagination");

    if (filteredJobs.length === 0) {
      listEl.hidden = true;
      paginationEl.hidden = true;
      noMatchEl.hidden = false;
      return;
    }

    noMatchEl.hidden = true;
    listEl.hidden = false;

    const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredJobs.slice(start, start + PAGE_SIZE);

    listEl.innerHTML = pageItems.map((j) => {
      const salary = formatSalary(j.minSalary, j.maxSalary, j.currency);
      return `
        <div class="sj-job-card" data-job-id="${j.jobId}" data-saved-id="${j.savedJobId}">
          <div class="sj-job-card__logo">
            ${j.companyLogoUrl ? `<img src="${escapeHtml(j.companyLogoUrl)}" alt="" />` : `<i class="ti ti-building" aria-hidden="true"></i>`}
          </div>
          <div class="sj-job-card__body" data-open-job>
            <p class="sj-job-card__title">${escapeHtml(j.jobTitle)}</p>
            <p class="sj-job-card__company">${escapeHtml(j.companyName)}</p>
            <div class="sj-job-card__meta">
              <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(j.location)}</span>
              <span><i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${j.workPlaceType}</span>
              ${salary ? `<span><i class="ti ti-cash" aria-hidden="true"></i> ${escapeHtml(salary)}</span>` : ""}
              <span>${employmentLabel(j.employmentType)}</span>
            </div>
          </div>
          <div class="sj-job-card__side">
            <div class="sj-job-card__top">
              <span class="sj-job-card__saved">${savedTimeAgo(j.savedAt)}</span>
              <button type="button" class="sj-bookmark-btn" title="Unsave" data-remove><i class="ti ti-bookmark-filled" aria-hidden="true"></i></button>
              <button type="button" class="sj-more-btn" title="More" data-more><i class="ti ti-dots" aria-hidden="true"></i></button>
            </div>
            ${statusBadge(j.jobId)}
          </div>
        </div>
      `;
    }).join("");

    wireCardEvents();
    renderPagination(totalPages);
  }

  function wireCardEvents() {
    document.querySelectorAll(".sj-job-card").forEach((card) => {
      const jobId = card.dataset.jobId;
      const savedId = card.dataset.savedId;

      card.querySelector("[data-open-job]").addEventListener("click", () => {
        window.location.href = `job-details.html?id=${jobId}`;
      });

      card.querySelector("[data-remove]").addEventListener("click", (e) => {
        e.stopPropagation();
        removeSavedJob(jobId, savedId);
      });

      card.querySelector("[data-more]").addEventListener("click", (e) => {
        e.stopPropagation();
        openRowMenu(e.currentTarget, jobId, savedId);
      });
    });
  }

  // ---------------- Row menu ---------------

  const rowMenu = document.getElementById("row-menu");
  let menuTarget = null;

  function openRowMenu(anchorEl, jobId, savedId) {
    menuTarget = { jobId, savedId };
    const rect = anchorEl.getBoundingClientRect();
    rowMenu.style.top = `${rect.bottom + 4}px`;
    rowMenu.style.left = `${Math.max(8, rect.right - 190)}px`;
    rowMenu.hidden = false;
    document.getElementById("row-menu-view").href = `job-details.html?id=${jobId}`;
  }

  document.addEventListener("click", (e) => {
    if (!rowMenu.hidden && !rowMenu.contains(e.target) && !e.target.closest("[data-more]")) {
      rowMenu.hidden = true;
    }
  });

  document.getElementById("row-menu-remove").addEventListener("click", () => {
    rowMenu.hidden = true;
    if (menuTarget) removeSavedJob(menuTarget.jobId, menuTarget.savedId);
  });

  // ---------------- Remove / unsave ----------------

  async function removeSavedJob(jobId) {
    try {
      const response = await fetch(API_ROUTES.unsaveJob, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, professionalProfileId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't remove this saved job.");
      }
      allSavedJobs = allSavedJobs.filter((j) => j.jobId !== jobId);
      document.getElementById("tab-count").textContent = allSavedJobs.length;
      renderOverview();
      applyFiltersAndRender();
      if (allSavedJobs.length === 0) {
        document.getElementById("jobs-empty").hidden = false;
      }
      showAlert("Removed from saved jobs.", true);
    } catch (err) {
      console.error("Remove saved job failed:", err);
      showAlert(err.message);
    }
  }

  // ---------------- Clear all ----------------

  const clearOverlay = document.getElementById("clear-overlay");
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    if (allSavedJobs.length === 0) return;
    clearOverlay.hidden = false;
  });
  document.getElementById("clear-cancel").addEventListener("click", () => { clearOverlay.hidden = true; });

  document.getElementById("clear-confirm").addEventListener("click", async () => {
    const btn = document.getElementById("clear-confirm");
    btn.disabled = true;
    try {
      await Promise.all(allSavedJobs.map((j) =>
        fetch(API_ROUTES.unsaveJob, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobId: j.jobId, professionalProfileId }),
        })
      ));
      allSavedJobs = [];
      document.getElementById("tab-count").textContent = 0;
      renderOverview();
      clearOverlay.hidden = true;
      document.getElementById("job-list").hidden = true;
      document.getElementById("pagination").hidden = true;
      document.getElementById("jobs-no-match").hidden = true;
      document.getElementById("jobs-empty").hidden = false;
      showAlert("All saved jobs cleared.", true);
    } catch (err) {
      console.error("Clear all failed:", err);
      clearOverlay.hidden = true;
      showAlert("Couldn't clear all saved jobs. Please try again.");
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Pagination ----------------

  function renderPagination(totalPages) {
    const el = document.getElementById("pagination");

    if (totalPages <= 1) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, 2, 3, "...", totalPages);
    }

    el.innerHTML = `
      <button type="button" class="sj-page-btn" id="pg-prev" ${currentPage === 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
      ${pages.map((p) => p === "..."
        ? `<span class="sj-page-ellipsis">...</span>`
        : `<button type="button" class="sj-page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`
      ).join("")}
      <button type="button" class="sj-page-btn" id="pg-next" ${currentPage === totalPages ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    `;

    el.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => { currentPage = Number(btn.dataset.page); renderPage(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    });
    const prevBtn = document.getElementById("pg-prev");
    const nextBtn = document.getElementById("pg-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); renderPage(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { currentPage = Math.min(totalPages, currentPage + 1); renderPage(); });
  }

  // ---------------- Recent activity (real, via AuditLog) ----------------

  const ACTIVITY_ICONS = {
    "Job Application Submitted": "ti-send",
    "Application Status Changed": "ti-refresh",
    "Interview Scheduled": "ti-calendar-event",
  };

  async function loadRecentActivity() {
    if (!userId) {
      document.getElementById("activity-loading").hidden = true;
      document.getElementById("activity-empty").hidden = false;
      return;
    }

    try {
      const params = new URLSearchParams({ userId, take: 5 });
      const response = await fetch(`${API_ROUTES.getRecentActivity}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      document.getElementById("activity-loading").hidden = true;

      if (!response.ok || !result.data || result.data.length === 0) {
        document.getElementById("activity-empty").hidden = false;
        return;
      }

      const listEl = document.getElementById("activity-list");
      listEl.hidden = false;
      listEl.innerHTML = result.data.map((a) => `
        <div class="sj-activity-item">
          <span class="sj-activity-item__icon"><i class="ti ${ACTIVITY_ICONS[a.action] || "ti-bell"}" aria-hidden="true"></i></span>
          <div>
            <p class="sj-activity-item__action">${escapeHtml(a.action)}</p>
            <p class="sj-activity-item__desc">${escapeHtml(a.description)}</p>
            <span class="sj-activity-item__time">${timeAgo(a.timestamp)}</span>
          </div>
        </div>
      `).join("");

    } catch (err) {
      document.getElementById("activity-loading").hidden = true;
      document.getElementById("activity-empty").hidden = false;
      console.error("Recent activity fetch threw an error:", err);
    }
  }

  // ---------------- Manage Alerts modal ----------------

  const alertsOverlay = document.getElementById("alerts-overlay");
  const listView = document.getElementById("alerts-list-view");
  const formView = document.getElementById("alert-form-view");
  let alertCategoriesLoaded = false;

  document.getElementById("manage-alerts-btn").addEventListener("click", () => {
    alertsOverlay.hidden = false;
    listView.hidden = false;
    formView.hidden = true;
    loadAlerts();
  });

  document.getElementById("alerts-close").addEventListener("click", () => { alertsOverlay.hidden = true; });

  async function loadAlerts() {
    const loadingEl = document.getElementById("alerts-loading");
    const emptyEl = document.getElementById("alerts-empty");
    const listEl = document.getElementById("alerts-list");

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    listEl.innerHTML = "";

    try {
      const params = new URLSearchParams({ professionalProfileId });
      const response = await fetch(`${API_ROUTES.getJobAlerts}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      loadingEl.hidden = true;

      if (!response.ok || !result.data || result.data.length === 0) {
        emptyEl.hidden = false;
        return;
      }

      listEl.innerHTML = result.data.map((a) => {
        const criteria = [a.keyword, a.location, a.categoryName, employmentLabelSafe(a.employmentType), a.workPlaceType, a.experienceLevel]
          .filter(Boolean).join(" · ") || "Any job";
        return `
          <div class="sj-alert-card" data-alert-id="${a.id}">
            <p class="sj-alert-card__criteria">${escapeHtml(criteria)}</p>
            <p class="sj-alert-card__meta">Created ${new Date(a.dateCreated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            <div class="sj-alert-card__actions">
              <label class="sj-toggle">
                <input type="checkbox" data-toggle ${a.emailNotificationsEnabled ? "checked" : ""} />
                <span class="sj-toggle__slider"></span>
              </label>
              <button type="button" class="sj-alert-delete-btn" data-delete><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>
            </div>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll("[data-toggle]").forEach((toggle) => {
        toggle.addEventListener("change", async (e) => {
          const alertId = e.target.closest("[data-alert-id]").dataset.alertId;
          try {
            await fetch(API_ROUTES.toggleJobAlert, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ alertId, professionalProfileId, enabled: e.target.checked }),
            });
          } catch (err) {
            console.error("Toggle alert failed:", err);
          }
        });
      });

      listEl.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const alertId = e.target.closest("[data-alert-id]").dataset.alertId;
          try {
            const res = await fetch(API_ROUTES.deleteJobAlert, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ alertId, professionalProfileId }),
            });
            if (res.ok) loadAlerts();
          } catch (err) {
            console.error("Delete alert failed:", err);
          }
        });
      });

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Job alerts fetch threw an error:", err);
    }
  }

  function employmentLabelSafe(type) {
    if (!type) return null;
    return employmentLabel(type);
  }

  document.getElementById("new-alert-btn").addEventListener("click", async () => {
    listView.hidden = true;
    formView.hidden = false;

    if (!alertCategoriesLoaded) {
      try {
        const response = await fetch(API_ROUTES.getJobCategories, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.data) {
          const select = document.getElementById("alert-category");
          result.data.forEach((cat) => {
            const opt = document.createElement("option");
            opt.value = cat.id;
            opt.textContent = cat.name;
            select.appendChild(opt);
          });
          alertCategoriesLoaded = true;
        }
      } catch (err) {
        console.error("Categories fetch threw an error:", err);
      }
    }
  });

  document.getElementById("alert-form-cancel").addEventListener("click", () => {
    formView.hidden = true;
    listView.hidden = false;
  });

  document.getElementById("alert-form-save").addEventListener("click", async () => {
    const btn = document.getElementById("alert-form-save");
    btn.disabled = true;

    const payload = {
      professionalProfileId,
      keyword: document.getElementById("alert-keyword").value.trim() || null,
      location: document.getElementById("alert-location").value.trim() || null,
      jobCategoryId: document.getElementById("alert-category").value || null,
      employmentType: document.getElementById("alert-employment-type").value || null,
      workPlaceType: document.getElementById("alert-workplace-type").value || null,
      experienceLevel: document.getElementById("alert-experience-level").value || null,
      minSalary: document.getElementById("alert-min-salary").value ? Number(document.getElementById("alert-min-salary").value) : null,
      createdBy: userId || "unknown",
    };

    try {
      const response = await fetch(API_ROUTES.createJobAlert, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't create the alert.");
      }

      ["alert-keyword", "alert-location", "alert-category", "alert-employment-type", "alert-workplace-type", "alert-experience-level", "alert-min-salary"]
        .forEach((id) => { document.getElementById(id).value = ""; });

      formView.hidden = true;
      listView.hidden = false;
      loadAlerts();

    } catch (err) {
      console.error("Create alert failed:", err);
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Init ----------------

  await loadData();
  loadRecentActivity();
});