// Shared shell for every authenticated recruiter/company page.
// Lives at Scripts/Layouts/companyLayout.js
// Include this AFTER config.js and BEFORE the page's own script, on any
// page that has <aside id="app-sidebar"></aside> and
// <header id="app-topbar"></header> in its markup.

(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const username = localStorage.getItem("pc_username") || "User";
  const role = localStorage.getItem("pc_role") || "Recruiter";
  const initials = username.charAt(0).toUpperCase();

  const NAV_GROUPS = [
    {
      label: "Main",
      links: [
        { href: "recruiter-dashboard.html", icon: "ti-home", label: "Home" },
        { href: "network-overview.html", icon: "ti-users", label: "My Network", badgeKey: "connections" },
        { href: "candidates.html", icon: "ti-users", label: "Candidates" },
        { href: "jobs.html", icon: "ti-briefcase", label: "Jobs" },
        { href: "applications.html", icon: "ti-file-text", label: "Applications", badgeKey: "applications" },
        { href: "messages.html", icon: "ti-message-circle", label: "Messages", badgeKey: "messages" },
      ],
    },
    {
      label: "Hiring",
      links: [
        { href: "talent-search.html", icon: "ti-search", label: "Talent Search" },
        { href: "saved-candidates.html", icon: "ti-bookmark", label: "Saved Candidates" },
        { href: "interviews.html", icon: "ti-calendar-event", label: "Interviews" },
      ],
    },
    {
      label: "Company",
      links: [
        { href: "company-profile.html", icon: "ti-building", label: "Company Profile" },
        { href: "team-recruiters.html", icon: "ti-users-group", label: "Team / Recruiters" },
        { href: "company-management.html", icon: "ti-building-skyscraper", label: "Company Management" },
      ],
    },
    {
      label: "Insights",
      links: [
        { href: "analytics.html", icon: "ti-chart-bar", label: "Analytics" },
      ],
    },
  ];

  function currentPage() {
    return window.location.pathname.split("/").pop();
  }

  // Sidebar/topbar badge counts (unread applications, messages,
  // notifications, pending connection requests) are real data, not
  // hardcoded — pages can call window.ProConnectShell.setBadgeCounts({...})
  // once they've fetched the relevant counts, or leave them unset to show
  // nothing. The pending-connections count is fetched automatically below
  // so it shows up on every page that includes this shell, not just
  // my-network.html.
  const badgeCounts = {};

  function badgeHtml(key) {
    const count = badgeCounts[key];
    if (!count) return "";
    return `<span class="sidebar-link__badge">${count}</span>`;
  }

  function renderSidebar() {
    const sidebar = document.getElementById("app-sidebar");
    if (!sidebar) return;

    const page = currentPage();

    const groupsHtml = NAV_GROUPS.map(
      (group) => `
      <div class="sidebar-group">
        <div class="sidebar-group__label">${group.label}</div>
        ${group.links
          .map(
            (link) => `
          <a href="${link.href}" class="sidebar-link${link.href === page ? " is-active" : ""}">
            <i class="ti ${link.icon}" aria-hidden="true"></i>
            <span>${link.label}</span>
            ${link.badgeKey ? badgeHtml(link.badgeKey) : ""}
          </a>`
          )
          .join("")}
      </div>`
    ).join("");

    sidebar.innerHTML = `
      <a href="recruiter-dashboard.html" class="sidebar-brand">
        <span class="sidebar-brand__mark"><i class="ti ti-affiliate" aria-hidden="true"></i></span>
        <span class="sidebar-brand__name">Pro<span class="accent">Connect</span></span>
      </a>

      <nav class="sidebar-nav">
        ${groupsHtml}
      </nav>

      <div class="sidebar-footer">
        <a href="settings.html" class="sidebar-link">
          <i class="ti ti-settings" aria-hidden="true"></i>
          <span>Settings</span>
        </a>
        <a href="help-support.html" class="sidebar-link">
          <i class="ti ti-help-circle" aria-hidden="true"></i>
          <span>Help &amp; Support</span>
        </a>
        <a href="profile-overview.html" class="sidebar-user">
          <span class="sidebar-user__avatar">${initials}</span>
          <span>
            <span class="sidebar-user__name">${username}</span><br />
            <span class="sidebar-user__role">${role}</span>
          </span>
        </a>
        <button type="button" class="sidebar-logout" id="sidebar-logout-btn">
          <i class="ti ti-logout" aria-hidden="true"></i>
          <span>Logout</span>
        </button>
      </div>
    `;

    document.getElementById("sidebar-logout-btn").addEventListener("click", () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "login.html";
    });
  }

  function renderTopbar() {
    const topbar = document.getElementById("app-topbar");
    if (!topbar) return;

    topbar.innerHTML = `
      <div class="topbar-search">
        <i class="ti ti-search" aria-hidden="true"></i>
        <input type="text" placeholder="Search candidates, jobs, skills..." />
        <span class="topbar-search__kbd">⌘K</span>
      </div>

      <div class="topbar-actions">
        <a href="notifications.html" class="topbar-icon-btn" aria-label="Notifications" id="topbar-notifications-btn">
          <i class="ti ti-bell" aria-hidden="true"></i>
          <span class="topbar-icon-btn__badge" id="topbar-notifications-badge" hidden></span>
        </a>
        <a href="messages.html" class="topbar-icon-btn" aria-label="Messages" id="topbar-messages-btn">
          <i class="ti ti-message-circle" aria-hidden="true"></i>
          <span class="topbar-icon-btn__badge" id="topbar-messages-badge" hidden></span>
        </a>
        <a href="profile-overview.html" class="topbar-user">
          <span class="topbar-user__avatar">${initials}</span>
          <span>
            <span class="topbar-user__name">${username}</span><br />
            <span class="topbar-user__role">${role}</span>
          </span>
          <i class="ti ti-chevron-down" aria-hidden="true"></i>
        </a>
      </div>
    `;
  }

  function setBadgeCounts(counts) {
    Object.assign(badgeCounts, counts);

    if (counts.applications !== undefined) {
      const link = document.querySelector('.sidebar-link[href="applications.html"] .sidebar-link__badge');
      if (link) link.textContent = counts.applications;
    }

    if (counts.connections !== undefined) {
      const link = document.querySelector('.sidebar-link[href="my-network.html"] .sidebar-link__badge');
      if (link) link.textContent = counts.connections;
    }

    if (counts.messages !== undefined) {
      const link = document.querySelector('.sidebar-link[href="messages.html"] .sidebar-link__badge');
      if (link) link.textContent = counts.messages;

      const topbarBadge = document.getElementById("topbar-messages-badge");
      if (topbarBadge) {
        topbarBadge.textContent = counts.messages;
        topbarBadge.hidden = !counts.messages;
      }
    }

    if (counts.notifications !== undefined) {
      const topbarBadge = document.getElementById("topbar-notifications-badge");
      if (topbarBadge) {
        topbarBadge.textContent = counts.notifications;
        topbarBadge.hidden = !counts.notifications;
      }
    }
  }

  // Fetches how many connection requests are waiting on this user to
  // respond to (ConnectionStatus.Pending, received side only) and reflects
  // it as a badge on the "My Network" sidebar link. Runs once per page
  // load, on every page that includes this shell — not just my-network.html
  // — so the count is always visible, the same way LinkedIn's sidebar works.
  // Silently does nothing on failure so a network hiccup never breaks the
  // rest of the shell.
  async function loadPendingConnectionsBadge() {
    try {
      const response = await fetch(
        `${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) return;

      const totalCount = result?.data?.totalCount;

      if (typeof totalCount === "number") {
        setBadgeCounts({ connections: totalCount });
      }
    } catch {
      // Network/parse failure — leave the badge unset, don't block the shell.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderSidebar();
    renderTopbar();
    loadPendingConnectionsBadge();
  });

  window.ProConnectShell = { setBadgeCounts };
})();