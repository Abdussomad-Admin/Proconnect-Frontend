// Unified app shell — replaces companyLayout.js + sidebar.js.
// One nav renderer, one topbar renderer, role picks the data.
//
// Nav model: array of "sections". Each section is either:
//   { label: "Main", items: [...] }                 → plain header + flat links (recruiter style)
//   { items: [...] }                                → no header, just links (professional style)
// Each item is either:
//   { page, href, icon, label, badgeKey? }           → plain link
//   { group, icon, label, children: [{page,href,label}] } → collapsible sub-nav (professional style)

const NAV_CONFIG = {
  recruiter: [
    {
      label: "Main",
      items: [
        { page: "dashboard", href: "recruiter-dashboard.html", icon: "ti-home", label: "Home" },
        { page: "network", href: "network-overview.html", icon: "ti-users", label: "My Network", badgeKey: "network" },
        { page: "candidates", href: "candidates.html", icon: "ti-users", label: "Candidates" },
        { page: "jobs", href: "jobs.html", icon: "ti-briefcase", label: "Jobs" },
        { page: "applications", href: "applications.html", icon: "ti-file-text", label: "Applications", badgeKey: "applications" },
        { page: "messages", href: "messages.html", icon: "ti-message-circle", label: "Messages", badgeKey: "messages" },
      ],
    },
    {
      label: "Hiring",
      items: [
        { page: "talent-search", href: "talent-search.html", icon: "ti-search", label: "Talent Search" },
        { page: "saved-candidates", href: "saved-candidates.html", icon: "ti-bookmark", label: "Saved Candidates" },
        { page: "interviews", href: "interviews.html", icon: "ti-calendar-event", label: "Interviews" },
      ],
    },
    {
      label: "Company",
      items: [
        { page: "company-profile", href: "company-profile.html", icon: "ti-building", label: "Company Profile" },
        { page: "team-recruiters", href: "team-recruiters.html", icon: "ti-users-group", label: "Team / Recruiters" },
        { page: "company-management", href: "company-management.html", icon: "ti-building-skyscraper", label: "Company Management" },
      ],
    },
    {
      label: "Events",
      items: [
        { page: "create-event", href: "create-event.html", icon: "ti-calendar-plus", label: "Create Event" },
        { page: "managed-events", href: "managed-events.html", icon: "ti-calendar-event", label: "Managed Events" },
      ],
    },
    {
      label: "Insights",
      items: [
        { page: "recruiter-analytics-dashboard", href: "recruiter-analytics-dashboard.html", icon: "ti-chart-bar", label: "Analytics" },
      ],
    },
  ],

  professional: [
    {
      items: [
        { page: "dashboard", href: "feed.html", icon: "ti-home", label: "Home" },
        { page: "network", href: "network-overview.html", icon: "ti-users", label: "My Network", badgeKey: "network" },
        {
          group: "jobs", icon: "ti-briefcase", label: "Jobs",
          children: [
            { page: "job-search", href: "job-search.html", label: "All Jobs" },
            { page: "job-recommended", href: "job-search.html?tab=recommended", label: "Recommended" },
            { page: "saved-jobs", href: "saved-jobs.html", label: "Saved Jobs" },
            { page: "job-categories", href: "job-categories.html", label: "Job Categories" },
          ],
        },
        { page: "messages", href: "messages.html", icon: "ti-message-2", label: "Messages", badgeKey: "messages" },
        { page: "my-applications", href: "my-applications.html", icon: "ti-file-text", label: "Applications" },
        { page: "saved-jobs", href: "saved-jobs.html", icon: "ti-bookmark", label: "Saved" },
        {
          group: "profile", icon: "ti-user", label: "Profile",
          children: [
            { page: "profile-overview", href: "profile-overview.html", label: "Overview" },
            { page: "profile-edit", href: "edit-professional-profile.html", label: "Edit Profile" },
            { page: "profile-resume", href: "resume.html", label: "Resume" },
            { page: "profile-portfolio", href: "portfolio.html", label: "Portfolio" },
            { page: "profile-availability", href: "availability.html", label: "Availability" },
          ],
        },
        { page: "analytics-dashboard", href: "analytics-dashboard.html", icon: "ti-chart-bar", label: "Analytics" },
        { page: "notification", href: "notifications.html", icon: "ti-bell", label: "Notifications", badgeKey: "notifications" },
        {
          group: "events", icon: "ti-calendar", label: "Events",
          children: [
            { page: "events-discover", href: "events-discover.html", label: "Discover" },
            { page: "my-events", href: "my-events.html", label: "My Events" },
          ],
        },
      ],
    },
  ],
};

// Icon-row shortcuts in the topbar itself: Home / Network / Jobs /
// Messages / Notifications, role-aware. renderTopbarNavIcons() below
// creates the #topbar-nav-icons mount itself if a page's markup doesn't
// already have one, so this renders on every page without needing each
// page's HTML edited by hand.
const TOPBAR_NAV_ICON_ITEMS = {
  professional: [
    { page: "dashboard", href: "feed.html", icon: "ti-home", label: "Home" },
    { page: "network", href: "network-overview.html", icon: "ti-users", label: "My Network", badgeKey: "network" },
    { page: "job-search", href: "job-search.html", icon: "ti-briefcase", label: "Jobs" },
    { page: "messages", href: "messages.html", icon: "ti-message-2", label: "Messages", badgeKey: "messages" },
    { page: "notifications", href: "notifications.html", icon: "ti-bell", label: "Notifications", badgeKey: "notifications" },
  ],
  recruiter: [
    { page: "dashboard", href: "recruiter-dashboard.html", icon: "ti-home", label: "Home" },
    { page: "network", href: "network-overview.html", icon: "ti-users", label: "My Network", badgeKey: "network" },
    { page: "jobs", href: "jobs.html", icon: "ti-briefcase", label: "Jobs" },
    { page: "messages", href: "messages.html", icon: "ti-message-2", label: "Messages", badgeKey: "messages" },
    { page: "notifications", href: "notifications.html", icon: "ti-bell", label: "Notifications", badgeKey: "notifications" },
  ],
};

const SIDEBAR_COLLAPSE_STORAGE_KEY = "pc_sidebar_collapsed";

function currentActivePage() {
  return document.body.dataset.page || "";
}

function currentRole() {
  const raw = (localStorage.getItem("pc_role") || "professional").toLowerCase();
  return raw === "recruiter" || raw === "company" ? "recruiter" : "professional";
}

function profileHref(role) {
  return role === "recruiter" ? "recruiter-profile.html" : "profile-overview.html";
}

function isSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true";
}

function applySidebarCollapsedState(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const toggleBtn = document.getElementById("sidebar-collapse-toggle");
  if (toggleBtn) {
    const icon = toggleBtn.querySelector("i");
    icon.className = collapsed ? "ti ti-chevrons-right" : "ti ti-chevrons-left";
    toggleBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  }
}

function badgeSpan(key) {
  return `<span class="sidebar-link__badge" data-badge-key="${key}" hidden></span>`;
}

function renderNavItem(item, activePage) {
  if (item.children) {
    const isGroupActive = item.children.some((c) => c.page === activePage);
    const childrenHtml = item.children
      .map((c) => `
        <a href="${c.href}" class="sidebar-sublink${c.page === activePage ? " is-active" : ""}">
          ${c.label}
        </a>`)
      .join("");

    return `
      <div class="sidebar-group${isGroupActive ? " is-open" : ""}">
        <span class="sidebar-link sidebar-link--group${isGroupActive ? " is-active" : ""}" title="${item.label}">
          <i class="ti ${item.icon}" aria-hidden="true"></i> <span class="sidebar-link__text">${item.label}</span>
          <i class="ti ti-chevron-down sidebar-group__chevron" aria-hidden="true"></i>
        </span>
        <div class="sidebar-subnav">${childrenHtml}</div>
      </div>`;
  }

  return `
    <a href="${item.href}" class="sidebar-link${item.page === activePage ? " is-active" : ""}" title="${item.label}">
      <i class="ti ${item.icon}" aria-hidden="true"></i> <span class="sidebar-link__text">${item.label}</span>
      ${item.badgeKey ? badgeSpan(item.badgeKey) : ""}
    </a>`;
}

function renderSidebar() {
  const root = document.getElementById("sidebar-root");
  if (!root) return; // page didn't include a mount point

  const activePage = currentActivePage();
  const role = currentRole();
  const username = localStorage.getItem("pc_username") || "User";
  const avatarUrl = localStorage.getItem("pc_avatar_url") || "";

  const sections = NAV_CONFIG[role];
  const navHtml = sections
    .map((section) => {
      const itemsHtml = section.items.map((item) => renderNavItem(item, activePage)).join("");
      return section.label
        ? `<div class="sidebar-section">
             <div class="sidebar-group__label">${section.label}</div>
             ${itemsHtml}
           </div>`
        : itemsHtml;
    })
    .join("");

  const collapsed = isSidebarCollapsed();

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="auth-brand__mark"><i class="ti ti-affiliate" aria-hidden="true"></i></span>
        <span class="auth-brand__name">Pro<span class="accent">Connect</span></span>
      </div>

      <nav class="sidebar-nav">${navHtml}</nav>

      <div class="sidebar-bottom">
        <a href="#" class="sidebar-link" title="Settings"><i class="ti ti-settings" aria-hidden="true"></i> <span class="sidebar-link__text">Settings</span></a>
        <a href="#" class="sidebar-link" title="Help & Support"><i class="ti ti-help-circle" aria-hidden="true"></i> <span class="sidebar-link__text">Help &amp; Support</span></a>

        <div class="sidebar-user-wrap">
          <button type="button" class="sidebar-user" id="sidebar-user-toggle">
            ${avatarUrl
              ? `<img id="sidebar-avatar" src="${avatarUrl}" alt="" class="sidebar-user__avatar" />`
              : `<span id="sidebar-avatar" class="sidebar-user__avatar sidebar-user__avatar--fallback">${username.charAt(0).toUpperCase()}</span>`}
            <div class="sidebar-user__info">
              <div class="sidebar-user__name" id="sidebar-user-name">${username}</div>
              <div class="sidebar-user__link">View profile</div>
            </div>
            <i class="ti ti-chevron-up sidebar-user__chevron" aria-hidden="true"></i>
          </button>

          <div class="sidebar-user-dropdown" id="sidebar-user-dropdown">
            <a href="${profileHref(role)}" class="dropdown-menu__item"><i class="ti ti-user" aria-hidden="true"></i> View Profile</a>
            <a href="#" class="dropdown-menu__item"><i class="ti ti-settings" aria-hidden="true"></i> Settings</a>
            <button type="button" class="dropdown-menu__item dropdown-menu__item--danger" id="sidebar-user-logout"><i class="ti ti-logout" aria-hidden="true"></i> Log out</button>
          </div>
        </div>

        <a href="#" class="sidebar-link" id="sidebar-logout" title="Log out"><i class="ti ti-logout" aria-hidden="true"></i> <span class="sidebar-link__text">Log out</span></a>

        <button type="button" class="sidebar-collapse-toggle" id="sidebar-collapse-toggle" title="${collapsed ? "Expand sidebar" : "Collapse sidebar"}">
          <i class="ti ${collapsed ? "ti-chevrons-right" : "ti-chevrons-left"}" aria-hidden="true"></i>
        </button>
      </div>
    </aside>
  `;

  root.querySelectorAll(".sidebar-group").forEach((group) => {
    const header = group.querySelector(".sidebar-link--group");
    header.addEventListener("click", () => group.classList.toggle("is-open"));
  });

  function performLogout() {
    ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username", "pc_avatar_url"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.location.href = "login.html";
  }

  const logoutLink = document.getElementById("sidebar-logout");
  if (logoutLink) {
    logoutLink.addEventListener("click", (e) => {
      e.preventDefault();
      performLogout();
    });
  }

  const sidebarUserToggle = document.getElementById("sidebar-user-toggle");
  const sidebarUserDropdown = document.getElementById("sidebar-user-dropdown");
  if (sidebarUserToggle && sidebarUserDropdown) {
    sidebarUserToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebarUserDropdown.classList.toggle("is-open");
      sidebarUserToggle.classList.toggle("is-open");
    });
    document.addEventListener("click", () => {
      sidebarUserDropdown.classList.remove("is-open");
      sidebarUserToggle.classList.remove("is-open");
    });
  }

  const sidebarUserLogout = document.getElementById("sidebar-user-logout");
  if (sidebarUserLogout) sidebarUserLogout.addEventListener("click", performLogout);

  document.getElementById("sidebar-collapse-toggle").addEventListener("click", () => {
    const nowCollapsed = !isSidebarCollapsed();
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, nowCollapsed ? "true" : "false");
    applySidebarCollapsedState(nowCollapsed);
  });

  applySidebarCollapsedState(collapsed);
}

function renderTopbarNavIcons() {
  let mount = document.getElementById("topbar-nav-icons");

  // Not every page's markup includes this mount point — create it so the
  // icon row renders everywhere without needing each page hand-edited.
  if (!mount) {
    const topbar = document.querySelector(".app-topbar");
    if (!topbar) return;
    mount = document.createElement("div");
    mount.id = "topbar-nav-icons";
    mount.className = "topbar-nav-icons";
    const iconsWrap = topbar.querySelector(".app-topbar__icons");
    if (iconsWrap) {
      topbar.insertBefore(mount, iconsWrap);
    } else {
      topbar.appendChild(mount);
    }
  }

  const activePage = currentActivePage();
  const role = currentRole();
  const items = TOPBAR_NAV_ICON_ITEMS[role];

  mount.innerHTML = items
    .map((item) => `
      <a href="${item.href}" class="topbar-nav-icon${item.page === activePage ? " is-active" : ""}" title="${item.label}">
        <i class="ti ${item.icon}" aria-hidden="true"></i>
        ${item.badgeKey ? `<span class="topbar-nav-icon__badge" data-badge-key="${item.badgeKey}" hidden></span>` : ""}
      </a>`)
    .join("");
}

// "Recruiter" / "Professional" label shown under the name in the topbar
// user card, mirroring the sidebar's own role display.
function roleLabel(role) {
  return role === "recruiter" ? "Recruiter" : "Professional";
}

// Wraps #topbar-name in a .topbar-user__text block and injects a role
// line under it (once per page — idempotent), so every page gets the
// two-line name/role card without needing its markup changed by hand.
function ensureTopbarRoleLine(role) {
  const nameEl = document.getElementById("topbar-name");
  if (!nameEl) return;

  let wrap = nameEl.parentElement;
  if (!wrap.classList.contains("topbar-user__text")) {
    wrap = document.createElement("div");
    wrap.className = "topbar-user__text";
    nameEl.parentElement.insertBefore(wrap, nameEl);
    wrap.appendChild(nameEl);
  }
  nameEl.classList.add("topbar-user__name");

  let roleEl = document.getElementById("topbar-role");
  if (!roleEl) {
    roleEl = document.createElement("span");
    roleEl.id = "topbar-role";
    roleEl.className = "topbar-user__role";
    wrap.appendChild(roleEl);
  }
  roleEl.textContent = roleLabel(role);
}

function renderTopbarUserInfo() {
  const username = localStorage.getItem("pc_username") || "User";
  const avatarUrl = localStorage.getItem("pc_avatar_url") || "";
  const role = currentRole();

  const nameEl = document.getElementById("topbar-name");
  if (nameEl) nameEl.textContent = username;

  ensureTopbarRoleLine(role);

  const avatarImg = document.getElementById("topbar-avatar");
  if (avatarImg) {
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.hidden = false;
      const existingFallback = avatarImg.parentElement.querySelector(".topbar-avatar-fallback");
      if (existingFallback) existingFallback.hidden = true;
    } else {
      avatarImg.hidden = true;
      let fallback = avatarImg.parentElement.querySelector(".topbar-avatar-fallback");
      if (!fallback) {
        fallback = document.createElement("span");
        fallback.className = "topbar-avatar-fallback";
        avatarImg.insertAdjacentElement("afterend", fallback);
      }
      fallback.textContent = username.charAt(0).toUpperCase();
      fallback.hidden = false;
    }
  }

  const toggle = document.getElementById("topbar-user-toggle");
  const dropdown = document.getElementById("topbar-dropdown");
  if (toggle && dropdown && !toggle.dataset.wiredBySidebarJs) {
    toggle.dataset.wiredBySidebarJs = "true";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("is-open");
    });
    document.addEventListener("click", () => dropdown.classList.remove("is-open"));
  }

  const logoutBtn = document.getElementById("topbar-logout");
  if (logoutBtn && !logoutBtn.dataset.wiredBySidebarJs) {
    logoutBtn.dataset.wiredBySidebarJs = "true";
    logoutBtn.addEventListener("click", () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "login.html";
    });
  }
}

// Updates BOTH the sidebar link badge and the topbar icon row badge for a
// given key, whichever mount points exist on the current page.
function setBadgeCounts(counts) {
  Object.entries(counts).forEach(([key, value]) => {
    const sidebarBadge = document.querySelector(`.sidebar-link__badge[data-badge-key="${key}"]`);
    if (sidebarBadge) {
      sidebarBadge.textContent = value;
      sidebarBadge.hidden = !value;
    }

    const topbarBadge = document.querySelector(`#topbar-nav-icons [data-badge-key="${key}"]`);
    if (topbarBadge) {
      topbarBadge.textContent = value;
      topbarBadge.hidden = !value;
    }
  });
}

// Below this width, force the collapsed (icon-only) rail regardless of
// the user's stored preference — there just isn't room for the full
// sidebar. Above it, the stored preference (toggled via the collapse
// button) applies as normal. The full mobile hide (.sidebar{display:none})
// still kicks in separately at 960px in dashboard.css.
const SIDEBAR_AUTO_COLLAPSE_WIDTH = 1200;

function shouldForceCollapse() {
  return window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_WIDTH;
}

function applyResponsiveSidebarState() {
  applySidebarCollapsedState(shouldForceCollapse() ? true : isSidebarCollapsed());
}

if (shouldForceCollapse() || isSidebarCollapsed()) {
  document.body.classList.add("sidebar-collapsed");
}

async function loadNotificationBadge() {
  if (typeof API_ROUTES === "undefined" || !API_ROUTES.getUnreadNotificationCount) return;

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  if (!token) return;

  try {
    const res = await fetch(API_ROUTES.getUnreadNotificationCount, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return;

    const data = result.data;
    const count =
      typeof data === "number" ? data : data?.count ?? data?.unreadCount ?? 0;

    setBadgeCounts({ notifications: count });
  } catch (err) {
    console.error("Unread notification count fetch threw an error:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderSidebar();
  renderTopbarNavIcons();
  renderTopbarUserInfo();
  applyResponsiveSidebarState();
  loadNotificationBadge();
});

let sidebarResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(sidebarResizeTimer);
  sidebarResizeTimer = setTimeout(applyResponsiveSidebarState, 120);
});

window.ProConnectShell = { setBadgeCounts };