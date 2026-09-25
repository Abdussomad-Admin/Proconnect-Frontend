document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");
  let networkChart = null;
  let followerChart = null;

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatDelta(percent) {
    const arrow = percent >= 0 ? "↑" : "↓";
    const cls = percent >= 0 ? "an-kpi-card__delta--up" : "an-kpi-card__delta--down";
    return { text: `${arrow} ${Math.abs(percent)}% vs previous period`, cls };
  }

  function renderKpi(valueId, deltaId, value, deltaPercent) {
    document.getElementById(valueId).textContent = value.toLocaleString();
    const delta = formatDelta(deltaPercent);
    const deltaEl = document.getElementById(deltaId);
    deltaEl.textContent = delta.text;
    deltaEl.className = `an-kpi-card__delta ${delta.cls}`;
  }

  function renderTrendChart(canvasId, existingChart, trend, label, color) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    if (existingChart) existingChart.destroy();

    return new Chart(ctx, {
      type: "line",
      data: {
        labels: trend.map((t) => formatDate(t.date)),
        datasets: [{
          label,
          data: trend.map((t) => t.count),
          borderColor: color,
          backgroundColor: `${color}22`,
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

  function renderTopPosts(posts) {
    const container = document.getElementById("top-posts-list");

    if (posts.length === 0) {
      container.innerHTML = `<p class="jm-placeholder__sub">No posts in this date range.</p>`;
      return;
    }

    container.innerHTML = posts.map((p) => `
      <div class="an-top-post-row">
        <div class="an-top-post-row__content">${escapeHtml(p.contentExcerpt)}</div>
        <div class="an-top-post-row__stats">
          <span><i class="ti ti-heart" aria-hidden="true"></i> ${p.reactionCount}</span>
          <span><i class="ti ti-message-circle" aria-hidden="true"></i> ${p.commentCount}</span>
          <span><i class="ti ti-share" aria-hidden="true"></i> ${p.shareCount}</span>
        </div>
      </div>
    `).join("");
  }

  async function loadDashboard() {
    const preset = document.getElementById("date-range-select").value;

    try {
      const params = new URLSearchParams({ preset });

      const [dashboardRes, viewsRes] = await Promise.all([
        fetch(`${API_ROUTES.getProfessionalAnalyticsDashboard}?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_ROUTES.getProfessionalViewsAnalytics}?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const result = await dashboardRes.json().catch(() => ({}));
      const viewsResult = await viewsRes.json().catch(() => ({}));

      if (dashboardRes.status === 401 || viewsRes.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!dashboardRes.ok || !result.data) {
        showAlert(result.message || "Couldn't load your analytics.");
        return;
      }

      const d = result.data;

      if (viewsRes.ok && viewsResult.data) {
        renderKpi("kpi-views", "kpi-views-delta", viewsResult.data.totalViews, viewsResult.data.viewsGrowthPercent);
      }

      renderKpi("kpi-connections", "kpi-connections-delta", d.newConnectionsInRange, d.connectionsGrowthPercent);
      renderKpi("kpi-applications", "kpi-applications-delta", d.applicationsInRange, d.applicationsGrowthPercent);
      renderKpi("kpi-engagements", "kpi-engagements-delta", d.postEngagementsInRange, d.postEngagementsGrowthPercent);

      networkChart = renderTrendChart("network-growth-chart", networkChart, d.connectionGrowthTrend, "New Connections", "#7C5CFC");
      followerChart = renderTrendChart("follower-growth-chart", followerChart, d.followerGrowthTrend, "New Followers", "#22C3A6");

      document.getElementById("top-posts-loading")?.remove();
      renderTopPosts(d.topPosts);

    } catch (err) {
      console.error("Analytics dashboard fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  document.getElementById("date-range-select").addEventListener("change", loadDashboard);

  await loadDashboard();
});