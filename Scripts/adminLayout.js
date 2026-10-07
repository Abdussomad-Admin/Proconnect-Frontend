// ProConnect Admin — layout only. No API calls, no endpoints.
//
// Usage: on each admin page put your content inside <main id="admin-content">
// and set <body data-page="admin-users"> (the key of the sidebar link that
// should be highlighted). This script builds the sidebar and topbar around it.

(function () {
  // One canonical admin navigation. `page` must match <body data-page="...">.
  var NAV = [
    { items: [
      { page: "admin-dashboard", href: "admin-dashboard.html", icon: "ti-layout-dashboard", label: "Dashboard" },
    ] },
    { label: "People", items: [
      { page: "admin-users", href: "admin-users.html", icon: "ti-users", label: "Users" },
      { page: "admin-professionals", href: "admin-professionals.html", icon: "ti-id-badge-2", label: "Professionals" },
      { page: "admin-recruiters", href: "admin-recruiters.html", icon: "ti-user-search", label: "Recruiters" },
      { page: "admin-companies", href: "admin-companies.html", icon: "ti-building", label: "Companies" },
    ] },
    { label: "Content", items: [
      { page: "admin-posts", href: "admin-posts.html", icon: "ti-article", label: "Posts / Content" },
      { page: "admin-jobs", href: "admin-jobs.html", icon: "ti-briefcase", label: "Jobs" },
      { page: "admin-events", href: "admin-events.html", icon: "ti-calendar-event", label: "Events" },
      { page: "admin-reports", href: "admin-reports.html", icon: "ti-shield-check", label: "Reports / Moderation", badgeKey: "reports" },
    ] },
    { label: "System", items: [
      { page: "admin-activity-logs", href: "admin-activity-logs.html", icon: "ti-history", label: "Activity Logs" },
      { page: "admin-analytics", href: "admin-analytics.html", icon: "ti-chart-bar", label: "Analytics" },
    ] },
  ];

  // Topbar icon buttons. Badges stay hidden until AdminLayout.setBadges() is called.
  var TOPBAR_ICONS = [
    { key: "notifications", icon: "ti-bell", label: "Notifications", href: "notifications.html" },
    { key: "messages", icon: "ti-mail", label: "Messages", href: "messages.html" },
  ];

  var COLLAPSE_KEY = "pc_admin_sidebar_collapsed";
  var LOGIN_PAGE = "login.html";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function store(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function logout() {
    ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username", "pc_avatar_url"].forEach(function (k) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    window.location.href = LOGIN_PAGE;
  }

  // Browser-side check only. The backend must enforce admin access itself.
  function guard() {
    if (!store("pc_token") || store("pc_role").toLowerCase() !== "admin") {
      window.location.href = LOGIN_PAGE;
      return false;
    }
    return true;
  }

  function navHtml(active) {
    return NAV.map(function (section) {
      var links = section.items.map(function (i) {
        return '<a href="' + i.href + '" class="ad-link' + (i.page === active ? " is-active" : "") + '" title="' + esc(i.label) + '">' +
          '<i class="ti ' + i.icon + '" aria-hidden="true"></i><span class="ad-link__text">' + esc(i.label) + "</span>" +
          (i.badgeKey ? '<span class="ad-link__badge" data-badge="' + i.badgeKey + '" hidden></span>' : "") +
          "</a>";
      }).join("");
      return '<div class="ad-nav__section">' +
        (section.label ? '<div class="ad-nav__label">' + esc(section.label) + "</div>" : "") + links + "</div>";
    }).join("");
  }

  // Page header (back link, icon, title, subtitle) is rendered from
  // <body data-title data-subtitle data-icon data-back-href data-back-label>.
  // A page can add header buttons by putting <div id="admin-page-actions">
  // anywhere inside #admin-content; it is moved into the header.
  function headerHtml(d) {
    if (!d.title) return "";
    return (d.backHref
        ? '<a class="ad-back" href="' + esc(d.backHref) + '"><i class="ti ti-arrow-left" aria-hidden="true"></i> ' + esc(d.backLabel || "Back") + "</a>"
        : "") +
      '<div class="ad-page-header">' +
        (d.icon ? '<span class="ad-page-header__icon"><i class="ti ' + esc(d.icon) + '" aria-hidden="true"></i></span>' : "") +
        "<div><h1>" + esc(d.title) + "</h1>" + (d.subtitle ? "<p>" + esc(d.subtitle) + "</p>" : "") + "</div>" +
        '<div class="ad-page-header__actions" id="ad-header-actions"></div>' +
      "</div>";
  }

  function build() {
    var content = document.getElementById("admin-content");
    if (!content) return;

    var active = document.body.dataset.page || "";
    var name = store("pc_username") || "Admin";
    var avatar = store("pc_avatar_url");
    var avatarHtml = avatar
      ? '<img class="ad-avatar" src="' + esc(avatar) + '" alt="" />'
      : '<span class="ad-avatar">' + esc(name.charAt(0).toUpperCase()) + "</span>";

    var icons = TOPBAR_ICONS.map(function (t) {
      return '<a class="ad-icon-btn" href="' + t.href + '" title="' + t.label + '" aria-label="' + t.label + '">' +
        '<i class="ti ' + t.icon + '" aria-hidden="true"></i>' +
        '<span class="ad-icon-btn__badge" data-badge="' + t.key + '" hidden></span></a>';
    }).join("");

    var shell = document.createElement("div");
    shell.className = "ad-shell";
    shell.innerHTML =
      '<aside class="ad-sidebar" id="ad-sidebar">' +
        '<a class="ad-brand" href="admin-dashboard.html"><span class="ad-brand__mark"><i class="ti ti-affiliate" aria-hidden="true"></i></span><span class="ad-brand__name">ProConnect</span></a>' +
        '<nav class="ad-nav" aria-label="Admin">' + navHtml(active) + "</nav>" +
        '<div class="ad-sidebar__footer">' +
          '<div class="ad-panel-card"><span class="ad-brand__mark"><i class="ti ti-shield-lock" aria-hidden="true"></i></span>' +
          '<span class="ad-panel-card__text">ProConnect<small>Admin Panel</small></span></div>' +
          '<button type="button" class="ad-collapse" id="ad-collapse" title="Collapse sidebar"><i class="ti ti-chevrons-left" aria-hidden="true"></i><span class="ad-collapse__text">Collapse</span></button>' +
          '<div class="ad-copy">© ' + new Date().getFullYear() + " ProConnect. All rights reserved.</div>" +
        "</div>" +
      "</aside>" +
      '<div class="ad-overlay" id="ad-overlay"></div>' +
      '<div class="ad-main">' +
        '<header class="ad-topbar">' +
          '<button type="button" class="ad-icon-btn" id="ad-menu-btn" aria-label="Toggle menu"><i class="ti ti-menu-2" aria-hidden="true"></i></button>' +
          '<label class="ad-search"><i class="ti ti-search" aria-hidden="true"></i>' +
            '<input type="search" id="ad-search" placeholder="Search users, jobs, companies, or anything..." />' +
            '<span class="ad-kbd">⌘ K</span></label>' +
          '<div class="ad-topbar__right">' + icons +
            '<div class="ad-user-wrap">' +
              '<button type="button" class="ad-user" id="ad-user-btn" aria-haspopup="true">' + avatarHtml +
                '<span class="ad-user__text"><span class="ad-user__name">' + esc(name) + '</span><span class="ad-user__role">Platform Administrator</span></span>' +
                '<i class="ti ti-chevron-down" aria-hidden="true"></i></button>' +
              '<div class="ad-menu" id="ad-user-menu" hidden>' +
                '<a href="admin-settings.html"><i class="ti ti-settings" aria-hidden="true"></i> Settings</a>' +
                '<button type="button" class="is-danger" id="ad-logout"><i class="ti ti-logout" aria-hidden="true"></i> Log out</button>' +
              "</div>" +
            "</div>" +
          "</div>" +
        "</header>" +
        '<div class="ad-content" id="ad-content-slot"></div>' +
      "</div>";

    document.body.prepend(shell);
    var slot = document.getElementById("ad-content-slot");
    slot.innerHTML = headerHtml(document.body.dataset);
    slot.appendChild(content);

    var actions = content.querySelector("#admin-page-actions");
    var actionsSlot = document.getElementById("ad-header-actions");
    if (actions && actionsSlot) actionsSlot.appendChild(actions);

    wire();
  }

  function setCollapsed(on) {
    document.body.classList.toggle("ad-collapsed", on);
    var btn = document.getElementById("ad-collapse");
    if (btn) {
      btn.querySelector("i").className = "ti " + (on ? "ti-chevrons-right" : "ti-chevrons-left");
      btn.title = on ? "Expand sidebar" : "Collapse sidebar";
    }
  }

  function wire() {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true");

    document.getElementById("ad-collapse").addEventListener("click", function () {
      var on = !document.body.classList.contains("ad-collapsed");
      localStorage.setItem(COLLAPSE_KEY, String(on));
      setCollapsed(on);
    });

    // Hamburger: drawer on mobile, collapse toggle on desktop.
    document.getElementById("ad-menu-btn").addEventListener("click", function () {
      if (window.matchMedia("(max-width: 960px)").matches) {
        document.body.classList.toggle("ad-drawer-open");
      } else {
        document.getElementById("ad-collapse").click();
      }
    });
    document.getElementById("ad-overlay").addEventListener("click", function () {
      document.body.classList.remove("ad-drawer-open");
    });

    var menu = document.getElementById("ad-user-menu");
    document.getElementById("ad-user-btn").addEventListener("click", function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", function () { menu.hidden = true; });
    document.getElementById("ad-logout").addEventListener("click", logout);

    // ⌘K / Ctrl+K focuses the search box.
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("ad-search").focus();
      }
    });
  }

  // Later, once endpoints are confirmed: AdminLayout.setBadges({ reports: 48, notifications: 12 })
  function setBadges(counts) {
    Object.keys(counts).forEach(function (key) {
      document.querySelectorAll('[data-badge="' + key + '"]').forEach(function (el) {
        el.textContent = counts[key];
        el.hidden = !counts[key];
      });
    });
  }

  window.AdminLayout = { setBadges: setBadges, logout: logout };

  document.addEventListener("DOMContentLoaded", function () {
    if (guard()) build();
  });
})();