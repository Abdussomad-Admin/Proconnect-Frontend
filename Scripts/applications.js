document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");
  const urlParams = new URLSearchParams(window.location.search);
  const urlJobId = urlParams.get("jobId") || "";
  const urlStatus = urlParams.get("status") || "";

  let currentStatus = urlStatus;
  let currentJobId = urlJobId;
  let currentKeyword = "";
  let currentPage = 1;
  const pageSize = 10;
  let appliedAfter = "";
  let appliedBefore = "";
  let workAuthorization = "";
  let lastLoadedItems = [];
  let searchDebounce = null;

  // Reflect an incoming ?status= filter in the tab strip on first paint.
  if (urlStatus) {
    document.querySelectorAll(".ap-status-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.status === urlStatus);
    });
  }

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

  function formatDateTime(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function initials(first, last) {
    return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase() || "?";
  }

  const STATUS_BADGE_CLASS = {
    New: "jm-status-badge--new", Screening: "jm-status-badge--screening", Shortlisted: "jm-status-badge--shortlisted",
    Interview: "jm-status-badge--interview", Offered: "jm-status-badge--offered", Hired: "jm-status-badge--hired",
    Rejected: "jm-status-badge--rejected",
  };

  function statusBadge(status) {
    return `<span class="jm-status-badge ${STATUS_BADGE_CLASS[status] || "jm-status-badge--new"}">${status}</span>`;
  }

  function buildFilterParams(extra) {
    const params = new URLSearchParams({ recruiterProfileId, ...extra });
    if (currentJobId) params.set("jobId", currentJobId);
    if (currentKeyword) params.set("keyword", currentKeyword);
    if (appliedAfter) params.set("appliedAfter", new Date(appliedAfter).toISOString());
    if (appliedBefore) params.set("appliedBefore", new Date(appliedBefore).toISOString());
    if (workAuthorization) params.set("workAuthorization", workAuthorization);
    return params;
  }

  // ---------------- Load jobs for filter dropdown ----------------

  async function loadJobFilter() {
    try {
      const params = new URLSearchParams({ recruiterProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getJobsByRecruiter}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        const select = document.getElementById("job-filter");
        (result.data.items || []).forEach((job) => {
          const opt = document.createElement("option");
          opt.value = job.id;
          opt.textContent = job.title;
          if (job.id === currentJobId) opt.selected = true;
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Job filter fetch threw an error:", err);
    }
  }

  // ---------------- Status counts ----------------

  async function loadStatusCounts() {
    try {
      const params = buildFilterParams({});
      const response = await fetch(`${API_ROUTES.getApplicationStatusCounts}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        const c = result.data;
        document.getElementById("count-all").textContent = `(${c.all})`;
        document.getElementById("count-new").textContent = `(${c.new})`;
        document.getElementById("count-screening").textContent = `(${c.screening})`;
        document.getElementById("count-shortlisted").textContent = `(${c.shortlisted})`;
        document.getElementById("count-interview").textContent = `(${c.interview})`;
        document.getElementById("count-offered").textContent = `(${c.offered})`;
        document.getElementById("count-hired").textContent = `(${c.hired})`;
        document.getElementById("count-rejected").textContent = `(${c.rejected})`;
      }
    } catch (err) {
      console.error("Status counts fetch threw an error:", err);
    }
  }

  // ---------------- Status tabs ----------------

  document.querySelectorAll(".ap-status-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ap-status-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentStatus = tab.dataset.status;
      currentPage = 1;
      loadApplications();
    });
  });

  // ---------------- Job filter & search ----------------

  document.getElementById("job-filter").addEventListener("change", (e) => {
    currentJobId = e.target.value;
    currentPage = 1;
    loadApplications();
    loadStatusCounts();
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      currentKeyword = e.target.value.trim();
      currentPage = 1;
      loadApplications();
      loadStatusCounts();
    }, 350);
  });

  // ---------------- Filters panel ----------------

  const filtersToggle = document.getElementById("filters-toggle");
  const filtersPanel = document.getElementById("filters-panel");

  filtersToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    filtersPanel.hidden = !filtersPanel.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!filtersPanel.hidden && !filtersPanel.contains(e.target) && e.target !== filtersToggle) {
      filtersPanel.hidden = true;
    }
  });

  function updateFiltersBadge() {
    const activeCount = [appliedAfter, appliedBefore, workAuthorization].filter(Boolean).length;
    const badge = document.getElementById("filters-badge");
    badge.textContent = activeCount;
    badge.hidden = activeCount === 0;
  }

  document.getElementById("filters-apply").addEventListener("click", () => {
    appliedAfter = document.getElementById("filter-applied-after").value;
    appliedBefore = document.getElementById("filter-applied-before").value;
    workAuthorization = document.getElementById("filter-work-auth").value;
    currentPage = 1;
    updateFiltersBadge();
    filtersPanel.hidden = true;
    loadApplications();
    loadStatusCounts();
  });

  document.getElementById("filters-clear").addEventListener("click", () => {
    document.getElementById("filter-applied-after").value = "";
    document.getElementById("filter-applied-before").value = "";
    document.getElementById("filter-work-auth").value = "";
    appliedAfter = "";
    appliedBefore = "";
    workAuthorization = "";
    currentPage = 1;
    updateFiltersBadge();
    filtersPanel.hidden = true;
    loadApplications();
    loadStatusCounts();
  });

  // ---------------- Load applications ----------------

  async function loadApplications() {
    const loadingEl = document.getElementById("applications-loading");
    const emptyEl = document.getElementById("applications-empty");
    const tableWrap = document.getElementById("applications-table-wrap");
    const paginationRow = document.getElementById("pagination-row");

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    tableWrap.hidden = true;
    paginationRow.hidden = true;

    const extra = { pageNumber: currentPage, pageSize, usePaging: "true" };
    if (currentStatus) extra.status = currentStatus;
    const params = buildFilterParams(extra);

    try {
      const response = await fetch(`${API_ROUTES.getApplicationsByRecruiter}?${params.toString()}`, {
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
        showAlert(result.message || "Couldn't load applications.");
        return;
      }

      const items = result.data.items || [];
      lastLoadedItems = items;

      if (items.length === 0) {
        emptyEl.hidden = false;
        return;
      }

      tableWrap.hidden = false;
      renderRows(items);
      renderPagination(result.data);

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Applications fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderRows(items) {
    const body = document.getElementById("applications-table-body");

    body.innerHTML = items.map((app) => `
      <tr data-application-id="${app.applicationId}">
        <td>
          <div class="ap-candidate-cell">
            <span class="ap-candidate-cell__avatar">
              ${app.profilePictureUrl ? `<img src="${escapeHtml(app.profilePictureUrl)}" alt="" />` : initials(app.firstName, app.lastName)}
            </span>
            <div>
              <div class="ap-candidate-cell__name">${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</div>
              <div class="ap-candidate-cell__email">${escapeHtml(app.email || "")}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="ap-job-cell__title">${escapeHtml(app.jobTitle)}</div>
          <div class="ap-job-cell__company">${escapeHtml(app.companyName)}</div>
        </td>
        <td>${statusBadge(app.jobStatus)}</td>
        <td>${formatDateTime(app.appliedAt)}</td>
        <td>
          <div class="ap-row-actions">
            <button type="button" class="jm-action-btn" title="View" data-row-action="view"><i class="ti ti-eye" aria-hidden="true"></i></button>
            <button type="button" class="jm-action-btn" title="Schedule Interview" data-row-action="schedule"><i class="ti ti-calendar-event" aria-hidden="true"></i></button>
            <button type="button" class="jm-action-btn" title="More actions" data-row-action="more"><i class="ti ti-dots" aria-hidden="true"></i></button>
          </div>
        </td>
      </tr>
    `).join("");

    body.querySelectorAll("tr").forEach((row) => {
      const app = items.find((a) => a.applicationId === row.dataset.applicationId);
      if (!app) return;

      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-row-action]")) return;
        openDetailPanel(app);
      });

      row.querySelector('[data-row-action="view"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openDetailPanel(app);
      });

      row.querySelector('[data-row-action="schedule"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openInterviewModal(app.applicationId);
      });

      row.querySelector('[data-row-action="more"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openRowMenu(e.currentTarget, app);
      });
    });
  }

  function renderPagination(pageResponse) {
    const paginationRow = document.getElementById("pagination-row");
    const totalPages = Math.max(1, Math.ceil(pageResponse.totalCount / pageResponse.pageSize));

    paginationRow.hidden = false;

    const start = pageResponse.totalCount === 0 ? 0 : (pageResponse.pageNumber - 1) * pageResponse.pageSize + 1;
    const end = Math.min(pageResponse.pageNumber * pageResponse.pageSize, pageResponse.totalCount);
    document.getElementById("showing-info").textContent =
      `Showing ${start} to ${end} of ${pageResponse.totalCount} applications`;

    document.getElementById("page-info").textContent = `Page ${pageResponse.pageNumber} of ${totalPages}`;

    const prevBtn = document.getElementById("page-prev");
    const nextBtn = document.getElementById("page-next");
    prevBtn.disabled = pageResponse.pageNumber <= 1;
    nextBtn.disabled = pageResponse.pageNumber >= totalPages;

    prevBtn.onclick = () => { currentPage = Math.max(1, currentPage - 1); loadApplications(); };
    nextBtn.onclick = () => { currentPage = Math.min(totalPages, currentPage + 1); loadApplications(); };
  }

  // ---------------- Row "more actions" menu ----------------

  const rowMenu = document.getElementById("row-menu");
  let rowMenuTargetApp = null;

  function openRowMenu(anchorEl, app) {
    rowMenuTargetApp = app;
    const rect = anchorEl.getBoundingClientRect();
    rowMenu.style.top = `${rect.bottom + 4}px`;
    rowMenu.style.left = `${Math.max(8, rect.right - 210)}px`;
    rowMenu.hidden = false;

    const resumeLink = document.getElementById("row-menu-resume");
    if (app.resumeUrl) {
      resumeLink.href = app.resumeUrl;
      resumeLink.style.opacity = "1";
      resumeLink.style.pointerEvents = "auto";
    } else {
      resumeLink.href = "#";
      resumeLink.style.opacity = "0.5";
      resumeLink.style.pointerEvents = "none";
    }
  }

  document.addEventListener("click", (e) => {
    if (!rowMenu.hidden && !rowMenu.contains(e.target) && !e.target.closest('[data-row-action="more"]')) {
      rowMenu.hidden = true;
    }
  });

  rowMenu.querySelectorAll("[data-menu-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      rowMenu.hidden = true;
      if (!rowMenuTargetApp) return;

      if (btn.dataset.menuAction === "move-stage") {
        openStageModal(rowMenuTargetApp.applicationId, rowMenuTargetApp.jobStatus);
      } else if (btn.dataset.menuAction === "contact") {
        contactCandidate(rowMenuTargetApp.professionalProfileId);
      } else if (btn.dataset.menuAction === "reject") {
        openRejectModal(rowMenuTargetApp.applicationId);
      }
    });
  });

  // ---------------- Detail panel ----------------

  const detailPanel = document.getElementById("detail-panel");
  const detailBody = document.getElementById("detail-body");

  function openDetailPanel(app) {
    detailBody.innerHTML = `
      <div class="ap-detail-name">
        <span class="ap-detail-avatar">
          ${app.profilePictureUrl ? `<img src="${escapeHtml(app.profilePictureUrl)}" alt="" />` : initials(app.firstName, app.lastName)}
        </span>
        <div>
          <h3>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</h3>
          <p>${escapeHtml(app.email || "")}</p>
        </div>
      </div>

      <div class="ap-detail-meta">
        ${app.location ? `<span><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(app.location)}</span>` : ""}
        <span><i class="ti ti-calendar" aria-hidden="true"></i> Applied ${formatDate(app.appliedAt)}</span>
      </div>

      <div class="ap-detail-section">
        <h4>Applied For</h4>
        <p><strong>${escapeHtml(app.jobTitle)}</strong><br />${escapeHtml(app.companyName)}</p>
      </div>

      ${app.summary ? `<div class="ap-detail-section"><h4>Overview</h4><p>${escapeHtml(app.summary)}</p></div>` : ""}

      ${app.coverLetter ? `<div class="ap-detail-section"><h4>Cover Letter</h4><p>${escapeHtml(app.coverLetter)}</p></div>` : ""}

      <div class="ap-detail-section">
        <h4>Resume</h4>
        ${app.resumeUrl
          ? `<div class="ap-resume-row">
               <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
               <span class="ap-resume-row__name">Resume.pdf</span>
               <a href="${escapeHtml(app.resumeUrl)}" target="_blank" rel="noopener"><i class="ti ti-download" aria-hidden="true"></i></a>
             </div>`
          : `<p class="jm-placeholder__sub">No resume attached.</p>`}
      </div>

      ${app.interviewScheduledAt ? `
      <div class="ap-detail-section">
        <h4>Interview Scheduled</h4>
        <div class="ap-interview-info">
          <div>${formatDateTime(app.interviewScheduledAt)}</div>
          <div>${escapeHtml(app.interviewType || "")}</div>
          <div>${escapeHtml(app.interviewLocationOrLink || "")}</div>
        </div>
      </div>` : ""}

      <div class="ap-detail-section">
        <h4>Current Stage</h4>
        <select class="ap-stage-select" id="stage-select">
          ${["New", "Screening", "Shortlisted", "Interview", "Offered", "Hired", "Rejected"]
            .map((s) => `<option value="${s}" ${s === app.jobStatus ? "selected" : ""}>${s}</option>`)
            .join("")}
        </select>
      </div>

      <div class="ap-detail-section">
        <h4>Actions</h4>
        <div class="ap-detail-actions">
          <button type="button" class="btn-primary btn-compact" id="action-schedule-interview">
            <i class="ti ti-calendar-event" aria-hidden="true"></i> Schedule Interview
          </button>
          <button type="button" class="btn-outline btn-compact" id="action-contact">
            <i class="ti ti-message-circle" aria-hidden="true"></i> Contact Candidate
          </button>
          <button type="button" class="btn-outline ej-danger-btn btn-compact" id="action-reject">
            <i class="ti ti-x" aria-hidden="true"></i> Reject
          </button>
        </div>
      </div>
    `;

    document.getElementById("stage-select").addEventListener("change", (e) => {
      updateStage(app.applicationId, e.target.value);
    });
    document.getElementById("action-schedule-interview").addEventListener("click", () => openInterviewModal(app.applicationId));
    document.getElementById("action-reject").addEventListener("click", () => openRejectModal(app.applicationId));
    document.getElementById("action-contact").addEventListener("click", () => contactCandidate(app.professionalProfileId));

    detailPanel.hidden = false;
  }

  document.getElementById("detail-close").addEventListener("click", () => { detailPanel.hidden = true; });

  // ---------------- Update stage ----------------

  async function updateStage(applicationId, newStatus) {
    try {
      const response = await fetch(API_ROUTES.updateApplicationStatus, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId, recruiterProfileId, newStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't update the candidate's stage.");
      }
      showAlert("Candidate stage updated.", true);
      loadApplications();
      loadStatusCounts();
    } catch (err) {
      console.error("Update stage failed:", err);
      showAlert(err.message);
    }
  }

  // ---------------- Move stage modal (row-level) ----------------

  const stageOverlay = document.getElementById("stage-overlay");
  let stageTargetApplicationId = null;

  function openStageModal(applicationId, currentStatusValue) {
    stageTargetApplicationId = applicationId;
    document.getElementById("stage-modal-select").value = currentStatusValue;
    stageOverlay.hidden = false;
  }

  document.getElementById("stage-modal-cancel").addEventListener("click", () => { stageOverlay.hidden = true; });

  document.getElementById("stage-modal-confirm").addEventListener("click", async () => {
    const newStatus = document.getElementById("stage-modal-select").value;
    stageOverlay.hidden = true;
    await updateStage(stageTargetApplicationId, newStatus);
  });

  // ---------------- Schedule interview modal ----------------

  const interviewOverlay = document.getElementById("interview-overlay");
  let interviewTargetApplicationId = null;

  function openInterviewModal(applicationId) {
    interviewTargetApplicationId = applicationId;
    document.getElementById("interview-datetime").value = "";
    document.getElementById("interview-location").value = "";
    document.getElementById("err-interview-datetime").textContent = "";
    document.getElementById("err-interview-location").textContent = "";
    interviewOverlay.hidden = false;
  }

  document.getElementById("interview-cancel").addEventListener("click", () => { interviewOverlay.hidden = true; });

  document.getElementById("interview-confirm").addEventListener("click", async () => {
    const datetime = document.getElementById("interview-datetime").value;
    const type = document.getElementById("interview-type").value;
    const location = document.getElementById("interview-location").value.trim();

    let valid = true;
    if (!datetime) {
      document.getElementById("err-interview-datetime").textContent = "Pick a date and time.";
      valid = false;
    } else if (new Date(datetime) <= new Date()) {
      document.getElementById("err-interview-datetime").textContent = "Must be in the future.";
      valid = false;
    } else {
      document.getElementById("err-interview-datetime").textContent = "";
    }
    if (!location) {
      document.getElementById("err-interview-location").textContent = "Required.";
      valid = false;
    } else {
      document.getElementById("err-interview-location").textContent = "";
    }
    if (!valid) return;

    const btn = document.getElementById("interview-confirm");
    btn.disabled = true;

    try {
      const response = await fetch(API_ROUTES.scheduleInterview, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          applicationId: interviewTargetApplicationId,
          recruiterProfileId,
          interviewScheduledAt: new Date(datetime).toISOString(),
          interviewType: type,
          interviewLocationOrLink: location,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't schedule the interview.");
      }

      interviewOverlay.hidden = true;
      detailPanel.hidden = true;
      showAlert("Interview scheduled and candidate notified by email.", true);
      loadApplications();
      loadStatusCounts();

    } catch (err) {
      console.error("Schedule interview failed:", err);
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Reject modal ----------------

  const rejectOverlay = document.getElementById("reject-overlay");
  let rejectTargetApplicationId = null;

  function openRejectModal(applicationId) {
    rejectTargetApplicationId = applicationId;
    rejectOverlay.hidden = false;
  }

  document.getElementById("reject-cancel").addEventListener("click", () => { rejectOverlay.hidden = true; });

  document.getElementById("reject-confirm").addEventListener("click", async () => {
    const btn = document.getElementById("reject-confirm");
    btn.disabled = true;
    try {
      const response = await fetch(API_ROUTES.updateApplicationStatus, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId: rejectTargetApplicationId, recruiterProfileId, newStatus: "Rejected" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't reject this candidate.");
      }
      rejectOverlay.hidden = true;
      detailPanel.hidden = true;
      showAlert("Candidate rejected.", true);
      loadApplications();
      loadStatusCounts();
    } catch (err) {
      console.error("Reject failed:", err);
      rejectOverlay.hidden = true;
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Contact candidate ----------------
  // NOTE: same unverified assumption as before about startConversation's
  // request shape — see prior message.

  async function contactCandidate(professionalProfileId) {
    try {
      const response = await fetch(API_ROUTES.startConversation, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ participantProfileId: professionalProfileId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't start a conversation.");
      }

      window.location.href = "messages.html";
    } catch (err) {
      console.error("Start conversation failed:", err);
      showAlert(err.message);
    }
  }

  // ---------------- Init ----------------

  await loadJobFilter();
  loadApplications();
  loadStatusCounts();
});