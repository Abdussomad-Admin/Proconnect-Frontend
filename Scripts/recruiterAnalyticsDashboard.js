document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  let trendChart = null;

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function initials(first, last) {
    return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase() || "?";
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatDelta(percent) {
    const arrow = percent >= 0 ? "↑" : "↓";
    const cls = percent >= 0 ? "an-kpi-card__delta--up" : "an-kpi-card__delta--down";
    return { text: `${arrow} ${Math.abs(percent)}% vs previous period`, cls };
  }

  function renderTrendChart(trend) {
    const ctx = document.getElementById("applications-trend-chart").getContext("2d");
    if (trendChart) trendChart.destroy();

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: trend.map((t) => formatDate(t.date)),
        datasets: [{
          label: "Applications",
          data: trend.map((t) => t.count),
          borderColor: "#7C5CFC",
          backgroundColor: "#7C5CFC22",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  function renderFunnel(funnel) {
    document.getElementById("funnel-loading")?.remove();
    const container = document.getElementById("funnel-container");

    const stages = [
      { label: "Applied", value: funnel.applied },
      { label: "Screening", value: funnel.screening },
      { label: "Shortlisted", value: funnel.shortlisted },
      { label: "Interview", value: funnel.interview },
      { label: "Offered", value: funnel.offered },
      { label: "Hired", value: funnel.hired },
    ];

    const total = funnel.applied || 1;

    container.innerHTML = stages.map((s) => {
      const pct = Math.round((s.value / total) * 100);
      return `
        <div class="an-funnel-row">
          <div class="an-funnel-row__label">
            <span>${s.label}</span>
            <span class="an-funnel-row__count">${s.value.toLocaleString()} (${pct}%)</span>
          </div>
          <div class="an-funnel-row__bar-track">
            <div class="an-funnel-row__bar" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join("") + `
      <div class="an-funnel-footnote">
        ${funnel.rejected.toLocaleString()} rejected · ${funnel.withdrawn.toLocaleString()} withdrawn
      </div>
    `;
  }

  function renderTopRoles(roles) {
    document.getElementById("top-roles-loading")?.remove();
    const container = document.getElementById("top-roles-list");

    if (roles.length === 0) {
      container.innerHTML = `<p class="jm-placeholder__sub">No applications in this date range.</p>`;
      return;
    }

    const max = Math.max(...roles.map((r) => r.applicationCount), 1);

    container.innerHTML = roles.map((r, i) => `
      <div class="an-role-row">
        <div class="an-role-row__rank">${i + 1}</div>
        <div class="an-role-row__body">
          <div class="an-role-row__title">${escapeHtml(r.title)}</div>
          <div class="an-role-row__bar-track">
            <div class="an-role-row__bar" style="width: ${(r.applicationCount / max) * 100}%"></div>
          </div>
        </div>
        <div class="an-role-row__count">${r.applicationCount}</div>
      </div>
    `).join("");
  }

  function renderRecruiterPerformance(recruiters) {
    document.getElementById("recruiter-performance-loading")?.remove();
    const container = document.getElementById("recruiter-performance-list");

    if (recruiters.length === 0) {
      container.innerHTML = `<p class="jm-placeholder__sub">No hires recorded in this date range.</p>`;
      return;
    }

    container.innerHTML = recruiters.map((r) => `
      <div class="an-recruiter-row">
        <span class="an-recruiter-row__avatar">${initials(r.firstName, r.lastName)}</span>
        <div class="an-recruiter-row__body">
          <div class="an-recruiter-row__name">${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}</div>
        </div>
        <div class="an-recruiter-row__stats">
          <div><strong>${r.hiredCount}</strong><span>Hired</span></div>
          <div><strong>${r.avgDaysToHire}d</strong><span>Avg. Time</span></div>
        </div>
      </div>
    `).join("");
  }

  async function loadDashboard() {
    const preset = document.getElementById("date-range-select").value;

    try {
      const params = new URLSearchParams({ recruiterProfileId, preset });
      const response = await fetch(`${API_ROUTES.getRecruiterAnalyticsDashboard}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load recruiter analytics.");
        return;
      }

      const d = result.data;

      document.getElementById("kpi-active-jobs").textContent = d.activeJobs.toLocaleString();
      document.getElementById("kpi-jobs-sub").textContent = `${d.draftJobs} draft · ${d.closedJobs} closed`;
      document.getElementById("kpi-jobs-sub").className = "an-kpi-card__delta an-kpi-card__delta--muted";

      document.getElementById("kpi-applications").textContent = d.totalApplicationsInRange.toLocaleString();
      const appDelta = formatDelta(d.applicationsGrowthPercent);
      const appDeltaEl = document.getElementById("kpi-applications-delta");
      appDeltaEl.textContent = appDelta.text;
      appDeltaEl.className = `an-kpi-card__delta ${appDelta.cls}`;

      document.getElementById("kpi-interviews").textContent = d.interviewsScheduled.toLocaleString();
      document.getElementById("kpi-interviews-sub").textContent =
        `${d.interviewsCompleted} completed · ${d.interviewsUpcoming} upcoming`;

      document.getElementById("kpi-hired").textContent = d.funnel.hired.toLocaleString();
      document.getElementById("kpi-hired-sub").textContent =
        `${d.myJobsHiredCount} from your jobs`;

      renderTrendChart(d.applicationsTrend);
      renderFunnel(d.funnel);
      renderTopRoles(d.topJobRoles);
      renderRecruiterPerformance(d.recruiterPerformance);

    } catch (err) {
      console.error("Recruiter analytics fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  document.getElementById("date-range-select").addEventListener("change", loadDashboard);

  await loadDashboard();
});