document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");
  let dashboardData = null;
  let postAnalyticsData = null;
  let postImpressionsData = null;
  let viewsData = null;
  let demographicsData = null;
  let overviewChart = null;
  let networkChart = null;
  let postTrendChart = null;
  let viewsTrendChart = null;
  let impressionsTrendChart = null;
  let viewerTypeChart = null;
  let industryChart = null;
  let companySizeChart = null;
  const loadedTabs = new Set();

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

  function renderDelta(elId, percent) {
    const el = document.getElementById(elId);
    const delta = formatDelta(percent);
    el.textContent = delta.text;
    el.className = `an-kpi-card__delta ${delta.cls}`;
  }

  function renderTopPosts(containerId, posts) {
    const container = document.getElementById(containerId);

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

  // ---------------- Tab switching ----------------

  document.querySelectorAll(".js-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;

      document.querySelectorAll(".js-mode-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      const tabName = tab.dataset.tab;
      document.querySelectorAll(".pi-tab-panel").forEach((panel) => { panel.hidden = true; });
      document.getElementById(`tab-${tabName}`).hidden = false;

      loadTab(tabName);
    });
  });

  function loadTab(tabName) {
    if (tabName === "overview" && dashboardData) { renderOverviewTab(); return; }
    if (tabName === "network" && dashboardData) { renderNetworkTab(); return; }
    if (tabName === "engagement" && postAnalyticsData && postImpressionsData) { renderEngagementTab(); return; }
    if (tabName === "views" && viewsData) { renderViewsTab(); return; }
    if (tabName === "demographics" && demographicsData) { renderDemographicsTab(); return; }

    if ((tabName === "overview" || tabName === "network") && !loadedTabs.has("dashboard")) {
      loadDashboardData(tabName);
    } else if (tabName === "engagement" && !loadedTabs.has("posts")) {
      loadPostAnalytics();
    } else if (tabName === "views" && !loadedTabs.has("views")) {
      loadViewsAnalytics();
    } else if (tabName === "demographics" && !loadedTabs.has("demographics")) {
      loadDemographics();
    }
  }

  // ---------------- Overview + Network Growth (shared dashboard fetch) ----------------

  async function loadDashboardData(thenRender) {
    const preset = document.getElementById("date-range-select").value;

    try {
      const params = new URLSearchParams({ preset });
      const response = await fetch(`${API_ROUTES.getProfessionalAnalyticsDashboard}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load your analytics.");
        return;
      }

      dashboardData = result.data;
      loadedTabs.add("dashboard");

      if (thenRender === "overview") renderOverviewTab();
      if (thenRender === "network") renderNetworkTab();

    } catch (err) {
      console.error("Profile insights dashboard fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderOverviewTab() {
    const d = dashboardData;

    document.getElementById("ov-connections").textContent = d.newConnectionsInRange.toLocaleString();
    renderDelta("ov-connections-delta", d.connectionsGrowthPercent);

    document.getElementById("ov-followers").textContent = d.newFollowersInRange.toLocaleString();
    renderDelta("ov-followers-delta", d.followersGrowthPercent);

    document.getElementById("ov-engagements").textContent = d.postEngagementsInRange.toLocaleString();
    renderDelta("ov-engagements-delta", d.postEngagementsGrowthPercent);

    document.getElementById("ov-applications").textContent = d.applicationsInRange.toLocaleString();
    renderDelta("ov-applications-delta", d.applicationsGrowthPercent);

    const ctx = document.getElementById("overview-growth-chart").getContext("2d");
    if (overviewChart) overviewChart.destroy();

    const labels = d.connectionGrowthTrend.map((t) => formatDate(t.date));

    overviewChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Connections",
            data: d.connectionGrowthTrend.map((t) => t.count),
            borderColor: "#5B3FE0",
            backgroundColor: "#5B3FE022",
            fill: true,
            tension: 0.35,
          },
          {
            label: "Followers",
            data: d.followerGrowthTrend.map((t) => t.count),
            borderColor: "#1F9254",
            backgroundColor: "#1F925422",
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: { y: { beginAtZero: true } },
      },
    });

    document.getElementById("ov-top-posts-loading")?.remove();
    renderTopPosts("ov-top-posts", d.topPosts);
  }

  function renderNetworkTab() {
    const d = dashboardData;

    document.getElementById("net-total-connections").textContent = d.totalConnections.toLocaleString();
    document.getElementById("net-total-followers").textContent = d.totalFollowers.toLocaleString();

    const ctx = document.getElementById("network-growth-chart").getContext("2d");
    if (networkChart) networkChart.destroy();

    const labels = d.connectionGrowthTrend.map((t) => formatDate(t.date));

    networkChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "New Connections",
            data: d.connectionGrowthTrend.map((t) => t.count),
            backgroundColor: "#5B3FE0",
            borderRadius: 4,
          },
          {
            label: "New Followers",
            data: d.followerGrowthTrend.map((t) => t.count),
            backgroundColor: "#1F9254",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: "bottom" } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  // ---------------- Engagement tab ----------------

  async function loadPostAnalytics() {
    const preset = document.getElementById("date-range-select").value;

    try {
      const params = new URLSearchParams({ preset });

      const [postsRes, impressionsRes] = await Promise.all([
        fetch(`${API_ROUTES.getProfessionalPostAnalytics}?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_ROUTES.getPostImpressionsAnalytics}?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const postsResult = await postsRes.json().catch(() => ({}));
      const impressionsResult = await impressionsRes.json().catch(() => ({}));

      if (postsRes.status === 401 || impressionsRes.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!postsRes.ok || !postsResult.data || !impressionsRes.ok || !impressionsResult.data) {
        showAlert((postsResult.message || impressionsResult.message) || "Couldn't load your post analytics.");
        return;
      }

      postAnalyticsData = postsResult.data;
      postImpressionsData = impressionsResult.data;
      loadedTabs.add("posts");
      renderEngagementTab();

    } catch (err) {
      console.error("Post analytics fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderEngagementTab() {
    const d = postAnalyticsData;

    document.getElementById("eng-posts").textContent = d.totalPosts.toLocaleString();
    document.getElementById("eng-reactions").textContent = d.totalReactions.toLocaleString();
    document.getElementById("eng-comments").textContent = d.totalComments.toLocaleString();
    document.getElementById("eng-shares").textContent = d.totalShares.toLocaleString();

    const ctx = document.getElementById("post-trend-chart").getContext("2d");
    if (postTrendChart) postTrendChart.destroy();

    postTrendChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: d.postCountTrend.map((t) => formatDate(t.date)),
        datasets: [{
          label: "Posts",
          data: d.postCountTrend.map((t) => t.count),
          backgroundColor: "#5B3FE0",
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });

    document.getElementById("reaction-breakdown-loading")?.remove();
    const rb = d.reactionBreakdown;
    const reactions = [
      { label: "Like", value: rb.like, icon: "ti-thumb-up" },
      { label: "Love", value: rb.love, icon: "ti-heart" },
      { label: "Celebrate", value: rb.celebrate, icon: "ti-confetti" },
      { label: "Support", value: rb.support, icon: "ti-hand-love-you" },
      { label: "Insightful", value: rb.insightful, icon: "ti-bulb" },
      { label: "Funny", value: rb.funny, icon: "ti-mood-smile" },
    ].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

    const reactionContainer = document.getElementById("reaction-breakdown");
    if (reactions.length === 0) {
      reactionContainer.innerHTML = `<p class="jm-placeholder__sub">No reactions in this date range.</p>`;
    } else {
      const total = reactions.reduce((sum, r) => sum + r.value, 0);
      reactionContainer.innerHTML = reactions.map((r) => `
        <div class="an-top-post-row">
          <div class="an-top-post-row__stats" style="justify-content: space-between; width: 100%;">
            <span><i class="ti ${r.icon}" aria-hidden="true"></i> ${r.label}</span>
            <span>${r.value} (${Math.round((r.value / total) * 100)}%)</span>
          </div>
        </div>
      `).join("");
    }

    document.getElementById("eng-post-list-loading")?.remove();
    renderTopPosts("eng-post-list", d.topPosts);
  }

  // ---------------- Views & Reach tab ----------------

  async function loadViewsAnalytics() {
    const preset = document.getElementById("date-range-select").value;

    try {
      const params = new URLSearchParams({ preset });
      const response = await fetch(`${API_ROUTES.getProfessionalViewsAnalytics}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load your view analytics.");
        return;
      }

      viewsData = result.data;
      loadedTabs.add("views");
      renderViewsTab();

    } catch (err) {
      console.error("Views analytics fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderViewsTab() {
    const d = viewsData;

    document.getElementById("views-total").textContent = d.totalViews.toLocaleString();
    renderDelta("views-total-delta", d.viewsGrowthPercent);

    const ctx = document.getElementById("views-trend-chart").getContext("2d");
    if (viewsTrendChart) viewsTrendChart.destroy();

    viewsTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: d.viewsTrend.map((t) => formatDate(t.date)),
        datasets: [{
          label: "Profile Views",
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

    const rb = d.referrerBreakdown;
    const sources = [
      { label: "Direct", value: rb.direct },
      { label: "Search", value: rb.search },
      { label: "Network", value: rb.network },
      { label: "External Link", value: rb.externalLink },
      { label: "Other", value: rb.other },
    ];
    const total = sources.reduce((sum, s) => sum + s.value, 0);

    const container = document.getElementById("views-referrer-breakdown");
    if (total === 0) {
      container.innerHTML = `<p class="jm-placeholder__sub">No traffic source data yet for this period.</p>`;
    } else {
      container.innerHTML = sources.filter((s) => s.value > 0).map((s) => `
        <div class="an-top-post-row">
          <div class="an-top-post-row__stats" style="justify-content: space-between; width: 100%;">
            <span>${s.label}</span>
            <span>${s.value} (${Math.round((s.value / total) * 100)}%)</span>
          </div>
        </div>
      `).join("");
    }
  }

  // ---------------- Init ----------------

  document.getElementById("date-range-select").addEventListener("change", () => {
    dashboardData = null;
    postAnalyticsData = null;
    viewsData = null;
    loadedTabs.clear();
    if (overviewChart) overviewChart.destroy();
    if (networkChart) networkChart.destroy();
    if (postTrendChart) postTrendChart.destroy();
    if (viewsTrendChart) viewsTrendChart.destroy();

    const activeTab = document.querySelector(".js-mode-tab.is-active").dataset.tab;
    loadTab(activeTab);
  });

  loadTab("overview");
});