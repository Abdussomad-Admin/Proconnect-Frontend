document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  let allApplications = [];
  let currentStatus = "";

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showAlert(message) {
    showToast(message, "error");
  }

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    return `${currency} ${fmt(min || max)}+`;
  }

  const STATUS_BADGE_CLASS = {
    New: "jm-status-badge--new", Screening: "jm-status-badge--screening", Shortlisted: "jm-status-badge--shortlisted",
    Interview: "jm-status-badge--interview", Offered: "jm-status-badge--offered", Hired: "jm-status-badge--hired",
    Rejected: "jm-status-badge--rejected", Withdrawn: "jm-status-badge--withdrawn",
  };
  function statusBadge(status) {
    return `<span class="jm-status-badge ${STATUS_BADGE_CLASS[status] || "jm-status-badge--new"}">${status}</span>`;
  }

  const TERMINAL_STATUSES = ["Hired", "Rejected", "Withdrawn"];

  // ---------------- Load ----------------

  async function loadApplications() {
    try {
      const params = new URLSearchParams({ professionalProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getApplicationsByProfessional}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      document.getElementById("loading").hidden = true;

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load your applications.");
        return;
      }

      allApplications = result.data.items || [];

      if (allApplications.length === 0) {
        document.getElementById("empty").hidden = false;
        return;
      }

      renderOverview();
      applyFiltersAndRender();

    } catch (err) {
      document.getElementById("loading").hidden = true;
      console.error("Applications fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderOverview() {
    document.getElementById("overview-total").textContent = allApplications.length;
    document.getElementById("overview-interviews").textContent =
      allApplications.filter((a) => a.interviewScheduledAt).length;
    document.getElementById("overview-offers").textContent =
      allApplications.filter((a) => a.jobStatus === "Offered" || a.jobStatus === "Hired").length;
  }

  // ---------------- Status tabs ----------------

  document.querySelectorAll(".ma-status-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ma-status-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentStatus = tab.dataset.status;
      applyFiltersAndRender();
    });
  });

  // ---------------- Search / sort ----------------

  document.getElementById("search-input").addEventListener("input", debounce(applyFiltersAndRender, 250));
  document.getElementById("sort-select").addEventListener("change", applyFiltersAndRender);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function applyFiltersAndRender() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    const sort = document.getElementById("sort-select").value;

    let filtered = allApplications.filter((a) => {
      if (currentStatus && a.jobStatus !== currentStatus) return false;
      if (keyword && !(a.jobTitle.toLowerCase().includes(keyword) || a.companyName.toLowerCase().includes(keyword))) return false;
      return true;
    });

    filtered.sort((a, b) => sort === "oldest"
      ? new Date(a.appliedAt) - new Date(b.appliedAt)
      : new Date(b.appliedAt) - new Date(a.appliedAt));

    renderList(filtered);
  }

  function renderList(items) {
    const listEl = document.getElementById("application-list");
    const noMatchEl = document.getElementById("no-match");

    if (items.length === 0) {
      listEl.hidden = true;
      noMatchEl.hidden = false;
      return;
    }

    noMatchEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = items.map((a) => {
      const salary = formatSalary(a.minSalary, a.maxSalary, a.currency);
      return `
        <div class="ma-card" data-application-id="${a.applicationId}">
          <div class="ma-card__logo">
            ${a.companyLogoUrl ? `<img src="${escapeHtml(a.companyLogoUrl)}" alt="" />` : `<i class="ti ti-building" aria-hidden="true"></i>`}
          </div>
          <div class="ma-card__body">
            <p class="ma-card__title">${escapeHtml(a.jobTitle)}</p>
            <p class="ma-card__company">${escapeHtml(a.companyName)}</p>
            <div class="ma-card__meta">
              <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(a.location)}</span>
              <span><i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${a.workPlaceType}</span>
              ${salary ? `<span><i class="ti ti-cash" aria-hidden="true"></i> ${escapeHtml(salary)}</span>` : ""}
            </div>
          </div>
          <div class="ma-card__side">
            <span class="ma-card__applied">Applied ${formatDate(a.appliedAt)}</span>
            ${statusBadge(a.jobStatus)}
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".ma-card").forEach((card) => {
      card.addEventListener("click", () => {
        const app = items.find((a) => a.applicationId === card.dataset.applicationId);
        if (app) openDetailPanel(app);
      });
    });
  }

  // ---------------- Detail panel ----------------

  const detailPanel = document.getElementById("detail-panel");
  let detailTargetApp = null;

  function openDetailPanel(app) {
    detailTargetApp = app;
    const salary = formatSalary(app.minSalary, app.maxSalary, app.currency);
    const canWithdraw = !TERMINAL_STATUSES.includes(app.jobStatus);

    document.getElementById("detail-body").innerHTML = `
      <div class="ma-detail-header">
        <span class="ma-detail-logo">
          ${app.companyLogoUrl ? `<img src="${escapeHtml(app.companyLogoUrl)}" alt="" />` : `<i class="ti ti-building" aria-hidden="true"></i>`}
        </span>
        <div>
          <h3>${escapeHtml(app.jobTitle)}</h3>
          <p>${escapeHtml(app.companyName)}</p>
        </div>
      </div>

      <div class="ma-detail-section">
        <h4>Status</h4>
        <p>${statusBadge(app.jobStatus)}</p>
      </div>

      <div class="ma-detail-section">
        <h4>Job Details</h4>
        <p>${escapeHtml(app.location)} · ${app.workPlaceType} · ${employmentLabel(app.employmentType)}${salary ? ` · ${escapeHtml(salary)}` : ""}</p>
      </div>

      ${app.interviewScheduledAt ? `
      <div class="ma-detail-section">
        <h4>Interview Scheduled</h4>
        <div class="ma-interview-info">
          <div>${formatDateTime(app.interviewScheduledAt)}</div>
          <div>${escapeHtml(app.interviewType || "")}</div>
          <div>${escapeHtml(app.interviewLocationOrLink || "")}</div>
        </div>
      </div>` : ""}

      <div class="ma-detail-section">
        <h4>Cover Letter</h4>
        <p>${escapeHtml(app.coverLetter)}</p>
      </div>

      ${app.resumeUrl ? `
      <div class="ma-detail-section">
        <h4>Resume</h4>
        <p><a href="${escapeHtml(app.resumeUrl)}" target="_blank" rel="noopener">View submitted resume →</a></p>
      </div>` : ""}

      <div class="ma-detail-section">
        <h4>Applied On</h4>
        <p>${formatDateTime(app.appliedAt)}</p>
      </div>

      <div class="ma-detail-actions">
        <a href="job-details.html?id=${app.jobId}" class="btn-outline btn-compact">View job posting</a>
        ${canWithdraw ? `
        <button type="button" class="btn-outline ej-danger-btn btn-compact" id="action-withdraw">
          <i class="ti ti-x" aria-hidden="true"></i> Withdraw Application
        </button>` : ""}
      </div>
    `;

    if (canWithdraw) {
      document.getElementById("action-withdraw").addEventListener("click", () => openWithdrawModal());
    }

    detailPanel.hidden = false;
  }

  document.getElementById("detail-close").addEventListener("click", () => { detailPanel.hidden = true; });

  // ---------------- Withdraw modal ----------------

  const withdrawOverlay = document.getElementById("withdraw-overlay");

  function openWithdrawModal() {
    withdrawOverlay.hidden = false;
  }

  document.getElementById("withdraw-cancel").addEventListener("click", () => { withdrawOverlay.hidden = true; });

  document.getElementById("withdraw-confirm").addEventListener("click", async () => {
    if (!detailTargetApp) return;
    const btn = document.getElementById("withdraw-confirm");
    btn.disabled = true;

    try {
      const response = await fetch(API_ROUTES.withdrawApplication, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          applicationId: detailTargetApp.applicationId,
          professionalProfileId,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't withdraw this application.");
      }

      withdrawOverlay.hidden = true;
      detailPanel.hidden = true;
      showToast("Application withdrawn.", "success");
      await loadApplications();

    } catch (err) {
      console.error("Withdraw application failed:", err);
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Init ----------------

  await loadApplications();
});