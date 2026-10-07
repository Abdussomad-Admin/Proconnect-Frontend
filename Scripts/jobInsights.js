document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const urlJobId = new URLSearchParams(window.location.search).get("jobId") || "";

  let currentJobId = urlJobId;
  let currentPage = 1;
  const pageSize = 10;
  let singleViewsTrendChart = null;
  let allViewsTrendChart = null;
  let viewsByJobChart = null;

  function showAlert(message) {
    showToast(message, "error");
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const STATUS_BADGE_CLASS = {
    Active: "jm-status-badge--interview",
    Draft: "jm-status-badge--new",
    Scheduled: "jm-status-badge--screening",
    Closed: "jm-status-badge--rejected",
  };

  function statusBadge(status) {
    return `<span class="jm-status-badge ${STATUS_BADGE_CLASS[status] || "jm-status-badge--new"}">${escapeHtml(status)}</span>`;
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatDelta(percent) {
    const arrow = percent >= 0 ? "↑" : "↓";
    const cls = percent >= 0 ? "an-kpi-card__delta--up" : "an-kpi-card__delta--down";
    return { text: `${arrow} ${Math.abs(percent)}% vs previous period`, cls };
  }

  function renderReferrerBreakdown(containerId, rb) {
    const sources = [
      { label: "Direct", value: rb.direct },
      { label: "Search", value: rb.search },
      { label: "Network", value: rb.network },
      { label: "External Link", value: rb.externalLink },
      { label: "Other", value: rb.other },
    ];
    const total = sources.reduce((sum, s) => sum + s.value, 0);
    const container = document.getElementById(containerId);

    if (total === 0) {
      container.innerHTML = `<p class="jm-placeholder__sub">No traffic source data yet for this period.</p>`;
      return;
    }

    container.innerHTML = sources.filter((s) => s.value > 0).map((s) => `
      <div class="an-top-post-row">
        <div class="an-top-post-row__stats" style="justify-content: space-between; width: 100%;">
          <span>${s.label}</span>
          <span>${s.value} (${Math.round((s.value / total) * 100)}%)</span>
        </div>
      </div>
    `).join("");
  }

  async function loadJobDropdown() {
    try {
      const params = new URLSearchParams({ recruiterProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getJobsByRecruiter}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        const select = document.getElementById("job-select");
        (result.data.items || []).forEach((job) => {
          const opt = document.createElement("option");
          opt.value = job.id;
          opt.textContent = job.title;
          if (job.id === currentJobId) opt.selected = true;
          select.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Job dropdown fetch threw an error:", err);
    }
  }

  // ---------------- Single-job view ----------------

  function renderSingleFunnel(funnel) {
    document.getElementById("single-funnel-loading")?.remove();
    const container = document.getElementById("single-funnel");

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
        ${funnel.rejected.toLocaleString()} rejected · ${funnel.withdrawn.toLocaleString()} withdrawn ·
        ${funnel.interviewsScheduled.toLocaleString()} interviews scheduled
        (${funnel.interviewsCompleted} completed, ${funnel.interviewsUpcoming} upcoming)
      </div>
    `;
  }

  async function loadSingleJob() {
    const preset = document.getElementById("date-range-select").value;

    document.getElementById("all-jobs-view").hidden = true;
    document.getElementById("single-job-view").hidden = false;

    try {
      const jobParams = new URLSearchParams({ recruiterProfileId, preset, jobId: currentJobId, usePaging: "false" });
      const funnelParams = new URLSearchParams({ recruiterProfileId, preset, jobId: currentJobId });
      const viewsParams = new URLSearchParams({ recruiterProfileId, preset, jobId: currentJobId });

      const [jobRes, funnelRes, viewsRes] = await Promise.all([
        fetch(`${API_ROUTES.getJobAnalytics}?${jobParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ROUTES.getApplicationFunnelAnalytics}?${funnelParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ROUTES.getJobViewsAnalytics}?${viewsParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const jobResult = await jobRes.json().catch(() => ({}));
      const funnelResult = await funnelRes.json().catch(() => ({}));
      const viewsResult = await viewsRes.json().catch(() => ({}));

      if (jobRes.status === 401 || funnelRes.status === 401 || viewsRes.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!jobRes.ok || !jobResult.data || !funnelRes.ok || !funnelResult.data) {
        showAlert((jobResult.message || funnelResult.message) || "Couldn't load this job's analytics.");
        return;
      }

      const job = (jobResult.data.items || [])[0];

      if (job) {
        document.getElementById("single-total").textContent = job.totalApplications.toLocaleString();
        document.getElementById("single-hired").textContent = job.hiredCount.toLocaleString();
        document.getElementById("single-rejected").textContent = job.rejectedCount.toLocaleString();
        document.getElementById("single-days-open").textContent = job.daysOpen.toLocaleString();
      }

      renderSingleFunnel(funnelResult.data);

      if (viewsRes.ok && viewsResult.data) {
        renderSingleViews(viewsResult.data);
      }

    } catch (err) {
      console.error("Single job analytics fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderSingleViews(d) {
    document.getElementById("single-views-total").textContent = d.totalViews.toLocaleString();
    const delta = formatDelta(d.viewsGrowthPercent);
    const deltaEl = document.getElementById("single-views-delta");
    deltaEl.textContent = delta.text;
    deltaEl.className = `an-kpi-card__delta ${delta.cls}`;

    const ctx = document.getElementById("single-views-trend-chart").getContext("2d");
    if (singleViewsTrendChart) singleViewsTrendChart.destroy();

    singleViewsTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: d.viewsTrend.map((t) => formatDate(t.date)),
        datasets: [{
          label: "Job Views",
          data: d.viewsTrend.map((t) => t.count),
          borderColor: "#5B3FE0",
          backgroundColor: "#5B3FE022",
          fill: true,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });

    renderReferrerBreakdown("single-views-referrer", d.referrerBreakdown);
  }

  // ---------------- All-jobs table view ----------------

  function renderJobsTable(items) {
    const body = document.getElementById("jobs-table-body");

    body.innerHTML = items.map((job) => `
      <tr>
        <td>${escapeHtml(job.title)}</td>
        <td>${statusBadge(job.status)}</td>
        <td>${job.totalApplications}</td>
        <td>${job.hiredCount}</td>
        <td>${job.rejectedCount}</td>
        <td>${job.daysOpen}d</td>
        <td>
          <button type="button" class="btn-outline btn-compact" data-job-id="${job.jobId}" data-job-title="${escapeHtml(job.title)}">
            View funnel
          </button>
        </td>
      </tr>
    `).join("");

    body.querySelectorAll("button[data-job-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const select = document.getElementById("job-select");
        select.value = btn.dataset.jobId;
        currentJobId = btn.dataset.jobId;
        loadSingleJob();
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
      `Showing ${start} to ${end} of ${pageResponse.totalCount} jobs`;

    document.getElementById("page-info").textContent = `Page ${pageResponse.pageNumber} of ${totalPages}`;

    const prevBtn = document.getElementById("page-prev");
    const nextBtn = document.getElementById("page-next");
    prevBtn.disabled = pageResponse.pageNumber <= 1;
    nextBtn.disabled = pageResponse.pageNumber >= totalPages;

    prevBtn.onclick = () => { currentPage = Math.max(1, currentPage - 1); loadAllJobs(); };
    nextBtn.onclick = () => { currentPage = Math.min(totalPages, currentPage + 1); loadAllJobs(); };
  }

  async function loadAllJobs() {
    const preset = document.getElementById("date-range-select").value;

    document.getElementById("single-job-view").hidden = true;
    document.getElementById("all-jobs-view").hidden = false;

    const loadingEl = document.getElementById("jobs-table-loading");
    const emptyEl = document.getElementById("jobs-table-empty");
    const tableWrap = document.getElementById("jobs-table-wrap");
    const paginationRow = document.getElementById("pagination-row");

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    tableWrap.hidden = true;
    paginationRow.hidden = true;

    try {
      const params = new URLSearchParams({
        recruiterProfileId, preset,
        pageNumber: currentPage, pageSize, usePaging: "true",
      });
      const viewsParams = new URLSearchParams({ recruiterProfileId, preset });

      const [response, viewsRes] = await Promise.all([
        fetch(`${API_ROUTES.getJobAnalytics}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ROUTES.getJobViewsAnalytics}?${viewsParams.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const result = await response.json().catch(() => ({}));
      const viewsResult = await viewsRes.json().catch(() => ({}));

      if (response.status === 401 || viewsRes.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      loadingEl.hidden = true;

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load job analytics.");
        return;
      }

      const items = result.data.items || [];

      if (items.length === 0) {
        emptyEl.hidden = false;
      } else {
        tableWrap.hidden = false;
        renderJobsTable(items);
        renderPagination(result.data);
      }

      if (viewsRes.ok && viewsResult.data) {
        renderAllViews(viewsResult.data);
      }

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Job analytics fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderAllViews(d) {
    document.getElementById("all-views-total").textContent = d.totalViews.toLocaleString();
    const delta = formatDelta(d.viewsGrowthPercent);
    const deltaEl = document.getElementById("all-views-delta");
    deltaEl.textContent = delta.text;
    deltaEl.className = `an-kpi-card__delta ${delta.cls}`;

    const trendCtx = document.getElementById("all-views-trend-chart").getContext("2d");
    if (allViewsTrendChart) allViewsTrendChart.destroy();

    allViewsTrendChart = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: d.viewsTrend.map((t) => formatDate(t.date)),
        datasets: [{
          label: "Job Views",
          data: d.viewsTrend.map((t) => t.count),
          borderColor: "#5B3FE0",
          backgroundColor: "#5B3FE022",
          fill: true,
          tension: 0.35,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });

    renderReferrerBreakdown("all-views-referrer", d.referrerBreakdown);

    // Horizontal bars — job titles are variable-length strings that read
    // poorly as vertical-bar labels but work fine as row labels.
    const byJobCtx = document.getElementById("views-by-job-chart").getContext("2d");
    if (viewsByJobChart) viewsByJobChart.destroy();

    const byJob = (d.viewsByJob || []).slice().reverse(); // reverse so highest ends up on top visually

    viewsByJobChart = new Chart(byJobCtx, {
      type: "bar",
      data: {
        labels: byJob.map((j) => j.title.length > 40 ? j.title.slice(0, 40) + "…" : j.title),
        datasets: [{
          label: "Views",
          data: byJob.map((j) => j.viewCount),
          backgroundColor: "#5B3FE0",
          borderRadius: 4,
          barThickness: 18,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  // ---------------- Selector wiring ----------------

  function loadCurrentView() {
    if (currentJobId) {
      loadSingleJob();
    } else {
      currentPage = 1;
      loadAllJobs();
    }
  }

  document.getElementById("job-select").addEventListener("change", (e) => {
    currentJobId = e.target.value;
    loadCurrentView();
  });

  document.getElementById("date-range-select").addEventListener("change", loadCurrentView);

  // ---------------- Init ----------------

  await loadJobDropdown();
  loadCurrentView();
});