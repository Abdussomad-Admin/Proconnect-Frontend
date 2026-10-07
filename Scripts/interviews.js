document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const PAGE_SIZE = 8;

  let allInterviews = []; // applications with interviewScheduledAt set
  let filteredInterviews = [];
  let currentPage = 1;
  let dateFrom = null;
  let dateTo = null;
  let selectedIds = new Set();

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Routes to the global toast (Scripts/toast.js); call sites unchanged.
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  function initials(first, last) {
    return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase() || "?";
  }

  function formatDateTime(dateStr) {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Derived status — not a stored field, computed from real data we have:
  // whether the interview date is in the future/past, and whether the
  // candidate was later rejected.
  function deriveStatus(app) {
    if (app.jobStatus === "Rejected") return "rejected";
    return new Date(app.interviewScheduledAt) > new Date() ? "upcoming" : "past";
  }

  function statusPill(status) {
    const map = {
      upcoming: ["iv-status-pill--upcoming", "Upcoming"],
      past: ["iv-status-pill--past", "Past"],
      rejected: ["iv-status-pill--rejected", "Rejected"],
    };
    const [cls, label] = map[status];
    return `<span class="iv-status-pill ${cls}">${label}</span>`;
  }

  // Free-text interviewType -> an icon, purely presentational. Anything
  // containing "video"/"call" gets a video icon, everything else (including
  // unset) gets a generic person icon — matches the mockup's Video Call /
  // In-Person distinction as closely as the real data allows.
  function typeIcon(interviewType) {
    return /video|call/i.test(interviewType || "") ? "ti-video" : "ti-user";
  }

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.status !== false, status: response.status, result };
  }

  // ---------------- Load ----------------

  async function loadData() {
    const params = new URLSearchParams({ recruiterProfileId, usePaging: "false" });

    const [appsRes, jobsRes, statsRes] = await Promise.all([
      apiFetch(`${API_ROUTES.getApplicationsByRecruiter}?${params.toString()}`),
      apiFetch(`${API_ROUTES.getJobsByRecruiter}?${params.toString()}`),
      apiFetch(`${API_BASE_URL}/Recruiter/interviews/stats`),
    ]);

    document.getElementById("page-loading").hidden = true;

    if (appsRes.status === 401) {
      window.location.href = "login.html?reason=session-expired";
      return;
    }

    if (!appsRes.ok || !appsRes.result.data) {
      showAlert(appsRes.result.message || "Couldn't load interviews.");
      return;
    }

    allInterviews = (appsRes.result.data.items || []).filter((a) => a.interviewScheduledAt);

    if (jobsRes.ok && jobsRes.result.data) {
      const select = document.getElementById("job-filter");
      (jobsRes.result.data.items || []).forEach((job) => {
        const opt = document.createElement("option");
        opt.value = job.title;
        opt.textContent = job.title;
        select.appendChild(opt);
      });
    }

    document.getElementById("page-content").hidden = false;

    if (statsRes.ok && statsRes.result.data) {
      renderStats(statsRes.result.data);
    } else {
      // Stats endpoint not reachable (e.g. not deployed yet) — fall back
      // to computing the same counts client-side from the fetched list,
      // just without the real week-over-week trend number.
      renderStatsFromClientData();
    }

    if (allInterviews.length === 0) {
      document.getElementById("table-empty-none").hidden = false;
      return;
    }

    applyFiltersAndRender();
  }

  // Real counts + the one honest trend (interviews scheduled in the last
  // 7 days vs. the 7 days before that), from GET /api/Recruiter/interviews/stats.
  function renderStats(stats) {
    document.getElementById("stat-total").textContent = stats.total;
    document.getElementById("stat-upcoming").textContent = stats.upcoming;
    document.getElementById("stat-past").textContent = stats.past;
    document.getElementById("stat-rejected").textContent = stats.rejectedAfterScheduling;
    document.getElementById("stat-due-soon").textContent =
      stats.dueTodayOrTomorrow > 0 ? `${stats.dueTodayOrTomorrow} today & tomorrow` : "none in the next 2 days";

    const trendEl = document.getElementById("stat-total-trend");
    if (stats.totalTrendPercent === null || stats.totalTrendPercent === undefined) {
      trendEl.hidden = true;
    } else {
      const up = stats.totalTrendPercent >= 0;
      trendEl.hidden = false;
      trendEl.className = `iv-trend ${up ? "iv-trend--up" : "iv-trend--down"}`;
      trendEl.innerHTML = `<i class="ti ${up ? "ti-arrow-up" : "ti-arrow-down"}" aria-hidden="true"></i> ${Math.abs(stats.totalTrendPercent)}%`;
    }
  }

  // Fallback if the stats endpoint isn't available — same counts, computed
  // from the already-fetched application list, no trend (can't compute a
  // week-over-week delta without a dedicated backend query).
  function renderStatsFromClientData() {
    const total = allInterviews.length;
    const upcoming = allInterviews.filter((a) => deriveStatus(a) === "upcoming").length;
    const past = allInterviews.filter((a) => deriveStatus(a) === "past").length;
    const rejected = allInterviews.filter((a) => deriveStatus(a) === "rejected").length;

    const now = Date.now();
    const tomorrowEnd = new Date().setHours(0, 0, 0, 0) + 2 * 24 * 60 * 60 * 1000;
    const dueSoon = allInterviews.filter((a) => {
      const t = new Date(a.interviewScheduledAt).getTime();
      return t > now && t < tomorrowEnd;
    }).length;

    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-upcoming").textContent = upcoming;
    document.getElementById("stat-past").textContent = past;
    document.getElementById("stat-rejected").textContent = rejected;
    document.getElementById("stat-due-soon").textContent = dueSoon > 0 ? `${dueSoon} today & tomorrow` : "none in the next 2 days";
    document.getElementById("stat-total-trend").hidden = true;
  }

  // ---------------- Filters ----------------

  function applyFiltersAndRender() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    const statusFilter = document.getElementById("status-filter").value;
    const jobFilter = document.getElementById("job-filter").value;

    filteredInterviews = allInterviews.filter((a) => {
      if (keyword && !((`${a.firstName} ${a.lastName}`).toLowerCase().includes(keyword) || a.jobTitle.toLowerCase().includes(keyword))) return false;
      if (statusFilter && deriveStatus(a) !== statusFilter) return false;
      if (jobFilter && a.jobTitle !== jobFilter) return false;

      if (dateFrom || dateTo) {
        const t = new Date(a.interviewScheduledAt).getTime();
        if (dateFrom && t < new Date(dateFrom).getTime()) return false;
        if (dateTo && t > new Date(dateTo).setHours(23, 59, 59, 999)) return false;
      }

      return true;
    });

    filteredInterviews.sort((a, b) => new Date(a.interviewScheduledAt) - new Date(b.interviewScheduledAt));

    document.getElementById("results-title").textContent = `Interviews (${filteredInterviews.length})`;

    currentPage = 1;
    renderPage();
  }

  document.getElementById("search-input").addEventListener("input", debounce(applyFiltersAndRender, 250));
  document.getElementById("status-filter").addEventListener("change", applyFiltersAndRender);
  document.getElementById("job-filter").addEventListener("change", applyFiltersAndRender);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------------- Date range popover ----------------

  const daterangeToggle = document.getElementById("daterange-toggle");
  const daterangePopover = document.getElementById("daterange-popover");

  daterangeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    daterangePopover.hidden = !daterangePopover.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!daterangePopover.hidden && !daterangePopover.contains(e.target) && e.target !== daterangeToggle) {
      daterangePopover.hidden = true;
    }
  });

  function updateDaterangeLabel() {
    const label = document.getElementById("daterange-label");
    if (dateFrom && dateTo) {
      label.textContent = `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
      daterangeToggle.classList.add("has-value");
    } else if (dateFrom || dateTo) {
      label.textContent = dateFrom ? `From ${formatDate(dateFrom)}` : `Until ${formatDate(dateTo)}`;
      daterangeToggle.classList.add("has-value");
    } else {
      label.textContent = "Select Date Range";
      daterangeToggle.classList.remove("has-value");
    }
  }

  document.getElementById("daterange-apply").addEventListener("click", () => {
    dateFrom = document.getElementById("date-from").value || null;
    dateTo = document.getElementById("date-to").value || null;
    updateDaterangeLabel();
    daterangePopover.hidden = true;
    applyFiltersAndRender();
  });

  document.getElementById("daterange-clear").addEventListener("click", () => {
    dateFrom = null;
    dateTo = null;
    document.getElementById("date-from").value = "";
    document.getElementById("date-to").value = "";
    updateDaterangeLabel();
    daterangePopover.hidden = true;
    applyFiltersAndRender();
  });

  // ---------------- Render table ----------------

  function renderPage() {
    const tableWrap = document.getElementById("table-wrap");
    const emptyEl = document.getElementById("table-empty");
    const paginationRow = document.getElementById("pagination-row");

    if (filteredInterviews.length === 0) {
      tableWrap.hidden = true;
      paginationRow.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    tableWrap.hidden = false;

    const totalPages = Math.max(1, Math.ceil(filteredInterviews.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredInterviews.slice(start, start + PAGE_SIZE);

    document.getElementById("table-body").innerHTML = pageItems.map((a) => {
      const dt = formatDateTime(a.interviewScheduledAt);
      const isChecked = selectedIds.has(a.applicationId);

      return `
      <tr data-application-id="${a.applicationId}">
        <td class="iv-checkbox-col" data-no-row-click>
          <input type="checkbox" class="iv-row-checkbox" data-id="${a.applicationId}" ${isChecked ? "checked" : ""} />
        </td>
        <td>
          <div class="iv-candidate-cell">
            <span class="iv-candidate-cell__avatar">
              ${a.profilePictureUrl ? `<img src="${escapeHtml(a.profilePictureUrl)}" alt="" />` : initials(a.firstName, a.lastName)}
            </span>
            <div>
              <div class="iv-candidate-cell__name">${escapeHtml(a.firstName)} ${escapeHtml(a.lastName)}</div>
              <div class="iv-candidate-cell__email">${escapeHtml(a.email || "")}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(a.jobTitle)}</td>
        <td>
          <span class="iv-type-cell"><i class="ti ${typeIcon(a.interviewType)}" aria-hidden="true"></i> ${escapeHtml(a.interviewType || "—")}</span>
        </td>
        <td>
          <div class="iv-datetime-cell__date">${dt.date}</div>
          <div class="iv-datetime-cell__time">${dt.time}</div>
        </td>
        <td>${statusPill(deriveStatus(a))}</td>
        <td data-no-row-click>
          <div class="iv-actions-cell">
            <button type="button" class="iv-view-btn" data-view title="View"><i class="ti ti-eye" aria-hidden="true"></i></button>
            <div class="dropdown-wrap">
              <button type="button" class="icon-btn icon-btn--ghost icon-btn--sm iv-more-btn" title="More"><i class="ti ti-dots" aria-hidden="true"></i></button>
              <div class="dropdown-menu">
                <button type="button" class="dropdown-menu__item" data-action="contact"><i class="ti ti-message-circle" aria-hidden="true"></i> Contact Candidate</button>
                <button type="button" class="dropdown-menu__item dropdown-menu__item--danger" data-action="reject"><i class="ti ti-x" aria-hidden="true"></i> Reject</button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
    }).join("");

    document.querySelectorAll("#table-body tr").forEach((row) => {
      const app = pageItems.find((a) => a.applicationId === row.dataset.applicationId);

      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-no-row-click]")) return;
        openDetailPanel(app);
      });

      row.querySelector("[data-view]").addEventListener("click", () => openDetailPanel(app));

      row.querySelector(".iv-row-checkbox").addEventListener("change", (e) => {
        if (e.target.checked) selectedIds.add(app.applicationId);
        else selectedIds.delete(app.applicationId);
        updateSelectAllState();
      });

      row.querySelector(".iv-more-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = e.currentTarget.nextElementSibling;
        document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => { if (m !== menu) m.classList.remove("is-open"); });
        menu.classList.toggle("is-open");
      });

      row.querySelector('[data-action="reject"]').addEventListener("click", () => openRejectModal(app.applicationId));
      row.querySelector('[data-action="contact"]').addEventListener("click", () => contactCandidate(app.professionalProfileId));
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-menu.is-open").forEach((m) => m.classList.remove("is-open"));
    }, { once: true });

    renderPagination(totalPages);
  }

  // ---------------- Bulk select ----------------
  // Tracks selection across pages; no bulk action is wired to it yet since
  // there's no bulk-update endpoint — selection just persists visually for
  // now. Flag if you want a real bulk action behind this.

  const selectAllCheckbox = document.getElementById("select-all-checkbox");

  function updateSelectAllState() {
    const visibleIds = getVisiblePageIds();
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    selectAllCheckbox.checked = allChecked;
  }

  function getVisiblePageIds() {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInterviews.slice(start, start + PAGE_SIZE).map((a) => a.applicationId);
  }

  selectAllCheckbox.addEventListener("change", (e) => {
    const visibleIds = getVisiblePageIds();
    if (e.target.checked) visibleIds.forEach((id) => selectedIds.add(id));
    else visibleIds.forEach((id) => selectedIds.delete(id));
    renderPage();
  });

  function renderPagination(totalPages) {
    const el = document.getElementById("pagination");
    const row = document.getElementById("pagination-row");

    row.hidden = false;
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, filteredInterviews.length);
    document.getElementById("showing-info").textContent = `Showing ${start}-${end} of ${filteredInterviews.length} interviews`;

    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);

    el.innerHTML = `
      <button type="button" class="sj-page-btn" id="pg-prev" ${currentPage === 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
      ${pages.map((p) => `<button type="button" class="sj-page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`).join("")}
      <button type="button" class="sj-page-btn" id="pg-next" ${currentPage === totalPages ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    `;

    el.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => { currentPage = Number(btn.dataset.page); renderPage(); });
    });
    const prevBtn = document.getElementById("pg-prev");
    const nextBtn = document.getElementById("pg-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); renderPage(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { currentPage = Math.min(totalPages, currentPage + 1); renderPage(); });
  }

  // ---------------- Detail panel ----------------

  const detailPanel = document.getElementById("detail-panel");

  function openDetailPanel(app) {
    document.getElementById("detail-body").innerHTML = `
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

      <div class="ap-detail-section">
        <h4>Interview</h4>
        <div class="iv-interview-info">
          <div>${formatDateTime(app.interviewScheduledAt).date} · ${formatDateTime(app.interviewScheduledAt).time}</div>
          <div>${escapeHtml(app.interviewType || "")}</div>
          <div>${escapeHtml(app.interviewLocationOrLink || "")}</div>
        </div>
      </div>

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
          <button type="button" class="btn-outline btn-compact" id="action-contact">
            <i class="ti ti-message-circle" aria-hidden="true"></i> Contact Candidate
          </button>
          <button type="button" class="btn-outline ej-danger-btn btn-compact" id="action-reject">
            <i class="ti ti-x" aria-hidden="true"></i> Reject
          </button>
        </div>
      </div>
    `;

    document.getElementById("stage-select").addEventListener("change", (e) => updateStage(app.applicationId, e.target.value));
    document.getElementById("action-reject").addEventListener("click", () => openRejectModal(app.applicationId));
    document.getElementById("action-contact").addEventListener("click", () => contactCandidate(app.professionalProfileId));

    detailPanel.hidden = false;
  }

  document.getElementById("detail-close").addEventListener("click", () => { detailPanel.hidden = true; });

  // ---------------- Update stage ----------------

  async function updateStage(applicationId, newStatus) {
    const { ok, result } = await apiFetch(API_ROUTES.updateApplicationStatus, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, recruiterProfileId, newStatus }),
    });

    if (!ok) {
      showAlert(result.message || "Couldn't update the candidate's stage.");
      return;
    }

    showAlert("Candidate stage updated.", true);
    detailPanel.hidden = true;
    await loadData();
  }

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

    const { ok, result } = await apiFetch(API_ROUTES.updateApplicationStatus, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: rejectTargetApplicationId, recruiterProfileId, newStatus: "Rejected" }),
    });

    btn.disabled = false;
    rejectOverlay.hidden = true;

    if (!ok) {
      showAlert(result.message || "Couldn't reject this candidate.");
      return;
    }

    showAlert("Candidate rejected.", true);
    detailPanel.hidden = true;
    await loadData();
  });

  // ---------------- Contact candidate ----------------
  // ASSUMPTION: same unverified request shape flagged elsewhere in the
  // app — StartConversationCommand actually takes a recipientId as a QUERY
  // param (a User.Id), not { participantProfileId } in the body. This call
  // is very likely already failing the same way as applications.js's
  // version. Fix is a one-line change once you confirm the real shape and
  // want every occurrence of this pattern fixed at once.

  async function contactCandidate(professionalProfileId) {
    const { ok, result } = await apiFetch(API_ROUTES.startConversation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantProfileId: professionalProfileId }),
    });

    if (!ok) {
      showAlert(result.message || "Couldn't start a conversation.");
      return;
    }

    window.location.href = "messages.html";
  }

  // ---------------- Init ----------------

  await loadData();
});