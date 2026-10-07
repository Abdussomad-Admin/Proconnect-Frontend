document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");

  let currentStatus = "";
  let currentPage = 1;
  const pageSize = 10;
  let lastLoadedJobs = [];
  let overviewLoaded = false;

  // Tabs that have their own dedicated destination instead of an in-page panel.
  const TAB_REDIRECTS = {
    candidates: "candidates.html",
    interviews: "applications.html?status=Interview",
    offers: "applications.html?status=Offered",
  };

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showAlert(message, isSuccess = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("form-alert--success", isSuccess);
    alertBox.hidden = false;
    setTimeout(() => { alertBox.hidden = true; }, 4000);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function statusBadge(status) {
    const map = {
      Active: { label: "Active", cls: "jm-status-badge--active" },
      Draft: { label: "Draft", cls: "jm-status-badge--draft" },
      Scheduled: { label: "Scheduled", cls: "jm-status-badge--scheduled" },
      Closed: { label: "Closed", cls: "jm-status-badge--closed" },
    };
    const info = map[status] || { label: status, cls: "jm-status-badge--draft" };
    return `<span class="jm-status-badge ${info.cls}">${info.label}</span>`;
  }

  function employmentLabel(type) {
    const map = {
      FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract",
      Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote",
    };
    return map[type] || type;
  }

  function initials(name) {
    const parts = (name || "").trim().split(/\s+/);
    return `${(parts[0] || "").charAt(0)}${(parts[1] || "").charAt(0)}`.toUpperCase() || "?";
  }

  // ---------------- Top-level tab switching ----------------

  function activateTab(tabName) {
    document.querySelectorAll(".jm-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tabName));
    document.querySelectorAll(".jm-panel").forEach((p) => (p.hidden = true));
    const panel = document.getElementById(`panel-${tabName}`);
    if (panel) panel.hidden = false;

    if (tabName === "overview" && !overviewLoaded) loadOverview();
    if (tabName === "my-job-posts" && lastLoadedJobs.length === 0) loadJobs();
  }

  document.querySelectorAll(".jm-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const redirect = TAB_REDIRECTS[tab.dataset.tab];
      if (redirect) {
        window.location.href = redirect;
        return;
      }
      activateTab(tab.dataset.tab);
    });
  });

  // "View all job posts" style links inside the Overview panel
  document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.gotoTab));
  });

  document.getElementById("view-all-interviews-btn").addEventListener("click", () => {
    window.location.href = TAB_REDIRECTS.interviews;
  });

  // ---------------- Overview (real data) ----------------

  async function loadOverview() {
    const loadingEl = document.getElementById("overview-loading");
    const contentEl = document.getElementById("overview-content");

    loadingEl.hidden = false;
    contentEl.hidden = true;

    try {
      const params = new URLSearchParams({ recruiterProfileId });
      const response = await fetch(`${API_ROUTES.getJobManagementOverview}?${params.toString()}`, {
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
        showAlert(result.message || "Couldn't load your overview.");
        return;
      }

      const o = result.data;
      overviewLoaded = true;

      document.getElementById("stat-active-jobs").textContent = o.activeJobPostCount;
      document.getElementById("stat-total-applications").textContent = o.totalApplicationCount;
      document.getElementById("stat-under-review").textContent = o.underReviewCount;
      document.getElementById("stat-interviews").textContent = o.interviewsScheduledCount;
      document.getElementById("stat-offers").textContent = o.offersExtendedCount;

      renderRecentJobs(o.recentJobPosts || []);
      renderUpcomingInterviews(o.upcomingInterviews || []);

      contentEl.hidden = false;

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Overview fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderRecentJobs(jobs) {
    const listEl = document.getElementById("recent-jobs-list");
    const emptyEl = document.getElementById("recent-jobs-empty");

    if (jobs.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = jobs.map((j) => `
      <div class="jm-recent-job-row">
        <span class="jm-recent-job-row__icon"><i class="ti ti-briefcase" aria-hidden="true"></i></span>
        <div>
          <p class="jm-recent-job-row__title">${escapeHtml(j.title)}</p>
          <span class="jm-recent-job-row__meta">${statusBadge(j.status)} · Posted ${formatDate(j.dateCreated)}</span>
        </div>
        <div class="jm-recent-job-row__stats">
          <div><strong>${j.applicationCount}</strong><span>Applicants</span></div>
          <div><strong>${j.underReviewCount}</strong><span>Review</span></div>
          <div><strong>${j.interviewCount}</strong><span>Interviews</span></div>
          <div><strong>${j.offerCount}</strong><span>Offers</span></div>
        </div>
      </div>
    `).join("");
  }

  function renderUpcomingInterviews(interviews) {
    const listEl = document.getElementById("upcoming-interviews-list");
    const emptyEl = document.getElementById("upcoming-interviews-empty");

    if (interviews.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = interviews.map((i) => `
      <div class="jm-interview-row">
        <span class="jm-interview-row__avatar">
          ${i.candidateAvatarUrl ? `<img src="${escapeHtml(i.candidateAvatarUrl)}" alt="" />` : initials(i.candidateName)}
        </span>
        <div>
          <p class="jm-interview-row__name">${escapeHtml(i.candidateName)}</p>
          <span class="jm-interview-row__meta">${escapeHtml(i.jobTitle)}${i.interviewType ? ` · ${escapeHtml(i.interviewType)}` : ""}</span>
        </div>
        <div class="jm-interview-row__when">${formatDateTime(i.interviewScheduledAt)}</div>
      </div>
    `).join("");
  }

  // ---------------- Status sub-tabs ----------------

  document.querySelectorAll(".jm-status-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".jm-status-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentStatus = tab.dataset.status;
      currentPage = 1;
      loadJobs();
    });
  });

  // ---------------- Search (client-side filter on current page) ----------------

  const searchInput = document.getElementById("job-search-input");
  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim().toLowerCase();
    renderRows(lastLoadedJobs.filter((j) => j.title.toLowerCase().includes(term)));
  });

  // ---------------- Load jobs ----------------

  async function loadJobs() {
    const loadingEl = document.getElementById("jobs-loading");
    const emptyEl = document.getElementById("jobs-empty");
    const tableWrap = document.getElementById("jobs-table-wrap");
    const paginationEl = document.getElementById("jobs-pagination");

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    tableWrap.hidden = true;
    paginationEl.hidden = true;

    const params = new URLSearchParams({
      recruiterProfileId,
      pageNumber: currentPage,
      pageSize,
      usePaging: "true",
    });
    if (currentStatus) params.set("status", currentStatus);

    try {
      const response = await fetch(`${API_ROUTES.getJobsByRecruiter}?${params.toString()}`, {
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
        console.error("Couldn't load job posts:", response.status, result);
        showAlert(result.message || "Couldn't load your job posts.");
        return;
      }

      lastLoadedJobs = result.data.items || [];

      if (lastLoadedJobs.length === 0) {
        emptyEl.hidden = false;
        return;
      }

      tableWrap.hidden = false;
      renderRows(lastLoadedJobs);
      renderPagination(result.data);

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Job posts fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderRows(jobs) {
    const body = document.getElementById("jobs-table-body");

    if (jobs.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="jm-empty-row">No jobs match your search.</td></tr>`;
      return;
    }

    body.innerHTML = jobs.map((job) => `
      <tr data-job-id="${job.id}">
        <td>
          <div class="jm-job-cell">
            <span class="jm-job-cell__icon"><i class="ti ti-briefcase" aria-hidden="true"></i></span>
            <div>
              <div class="jm-job-cell__title">${escapeHtml(job.title)}</div>
              <div class="jm-job-cell__sub">${escapeHtml(job.categoryName)}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(job.location)}</td>
        <td>${employmentLabel(job.employmentType)}</td>
        <td>${statusBadge(job.status)}</td>
        <td>${job.applicantCount ?? 0}</td>
        <td>${formatDate(job.dateCreated)}</td>
        <td>
          <div class="jm-actions">
            <a href="edit-job.html?id=${job.id}" class="jm-action-btn" title="Edit"><i class="ti ti-pencil" aria-hidden="true"></i></a>
            <a href="applications.html?jobId=${job.id}" class="jm-action-btn" title="View Applicants"><i class="ti ti-users" aria-hidden="true"></i></a>
            ${job.status === "Active" || job.status === "Scheduled"
              ? `<button type="button" class="jm-action-btn" title="Close job" data-action="close" data-job-id="${job.id}"><i class="ti ti-player-pause" aria-hidden="true"></i></button>`
              : ""}
            <button type="button" class="jm-action-btn jm-action-btn--danger" title="Delete job" data-action="delete" data-job-id="${job.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </td>
      </tr>
    `).join("");

    body.querySelectorAll('[data-action="close"]').forEach((btn) =>
      btn.addEventListener("click", () => confirmAction("close", btn.dataset.jobId))
    );
    body.querySelectorAll('[data-action="delete"]').forEach((btn) =>
      btn.addEventListener("click", () => confirmAction("delete", btn.dataset.jobId))
    );
  }

  function renderPagination(pageResponse) {
    const paginationEl = document.getElementById("jobs-pagination");
    const totalPages = Math.max(1, Math.ceil(pageResponse.totalCount / pageResponse.pageSize));

    if (totalPages <= 1) {
      paginationEl.hidden = true;
      return;
    }

    paginationEl.hidden = false;
    document.getElementById("page-info").textContent = `Page ${pageResponse.pageNumber} of ${totalPages}`;

    const prevBtn = document.getElementById("page-prev");
    const nextBtn = document.getElementById("page-next");
    prevBtn.disabled = pageResponse.pageNumber <= 1;
    nextBtn.disabled = pageResponse.pageNumber >= totalPages;

    prevBtn.onclick = () => { currentPage = Math.max(1, currentPage - 1); loadJobs(); };
    nextBtn.onclick = () => { currentPage = Math.min(totalPages, currentPage + 1); loadJobs(); };
  }

  // ---------------- Close / Delete confirm modal ----------------

  const overlay = document.getElementById("confirm-overlay");
  const confirmTitle = document.getElementById("confirm-title");
  const confirmMessage = document.getElementById("confirm-message");
  const confirmOkBtn = document.getElementById("confirm-ok");
  const confirmCancelBtn = document.getElementById("confirm-cancel");

  let pendingAction = null;
  let pendingJobId = null;

  function confirmAction(action, jobId) {
    pendingAction = action;
    pendingJobId = jobId;

    if (action === "close") {
      confirmTitle.textContent = "Close this job?";
      confirmMessage.textContent = "Candidates will no longer be able to apply. You can't undo this from here.";
    } else {
      confirmTitle.textContent = "Delete this job?";
      confirmMessage.textContent = "This permanently removes the job post along with its applications and saved records. This can't be undone.";
    }

    overlay.hidden = false;
  }

  confirmCancelBtn.addEventListener("click", () => {
    overlay.hidden = true;
    pendingAction = null;
    pendingJobId = null;
  });

  confirmOkBtn.addEventListener("click", async () => {
    if (!pendingAction || !pendingJobId) return;

    confirmOkBtn.disabled = true;

    const endpoint = pendingAction === "close" ? API_ROUTES.closeJob : API_ROUTES.deleteJob;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId: pendingJobId, recruiterProfileId }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || `Couldn't ${pendingAction} the job.`);
      }

      overlay.hidden = true;
      showAlert(pendingAction === "close" ? "Job closed." : "Job deleted.", true);
      loadJobs();
      overviewLoaded = false; // stats changed — refresh next time Overview is opened

    } catch (err) {
      console.error(`${pendingAction} job failed:`, err);
      overlay.hidden = true;
      showAlert(err.message);
    } finally {
      confirmOkBtn.disabled = false;
      pendingAction = null;
      pendingJobId = null;
    }
  });

  // ---------------- Init ----------------

  loadOverview();
});