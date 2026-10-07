document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  let currentPage = 1;
  const pageSize = 20;
  let currentStatusParam = "";
  let currentTypeFilter = "all";
  let lastPageData = null;

  // Independent of whatever page/filter is currently displayed — these
  // back the "All (n)" / "Unread (n)" tab labels and the sidebar's
  // All/Unread rows, so switching tabs never overwrites the other tab's
  // total with the currently-filtered count.
  let totalAllCount = 0;
  let totalUnreadCount = 0;

  // Client-side grouping of NotificationType values into the sidebar's
  // filter categories. Kept here rather than as a backend enum change —
  // if a new NotificationType is added later, add its mapping below or
  // it falls into "other" by default.
  const TYPE_CATEGORY = {
    ConnectionRequest: "connections",
    ConnectionAccepted: "connections",
    Follow: "connections",
    Message: "messages",
    JobApplication: "jobs",
    JobStatusUpdate: "jobs",
    RecruiterStatusUpdate: "company",
    CompanyJoinRequest: "company",
    CompanyVerified: "company",
    Comment: "other",
    Like: "other",
    Share: "other",
    Mention: "other",
    ProfileView: "other",
    System: "other",
  };

  const TYPE_ICON = {
    ConnectionRequest: "ti-user-plus",
    ConnectionAccepted: "ti-user-check",
    Follow: "ti-user-plus",
    Message: "ti-message-2",
    JobApplication: "ti-briefcase",
    JobStatusUpdate: "ti-briefcase",
    RecruiterStatusUpdate: "ti-building",
    CompanyJoinRequest: "ti-building",
    CompanyVerified: "ti-rosette-discount-check",
    Comment: "ti-message-circle",
    Like: "ti-thumb-up",
    Share: "ti-share",
    Mention: "ti-at",
    ProfileView: "ti-eye",
    System: "ti-info-circle",
  };

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (rendering into a #toast-stack div) has been removed. Its default
  // type ("info") already matched the global default.

  function timeAgo(dateString) {
    const then = new Date(dateString).getTime();
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function dayLabel(dateString) {
    const d = new Date(dateString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  async function apiGet(url) {
    const response = await fetch(url, { method: "GET", headers: authHeaders });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "login.html?reason=session-expired";
      throw new Error("Session expired");
    }
    if (!response.ok || result.status === false) throw new Error(result.message || "Something went wrong");
    return result.data;
  }

  async function apiPost(url) {
    const response = await fetch(url, { method: "POST", headers: authHeaders });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) throw new Error(result.message || "Something went wrong");
    return result;
  }

  // ---------------- Tab / sidebar totals ----------------
  // Fetched independently of the currently-displayed page so switching
  // between All/Unread (or a category filter) never clobbers the other
  // tab's count with whatever's on screen right now.

  async function refreshTabTotals() {
    try {
      const [allPage, unreadCount] = await Promise.all([
        apiGet(`${API_ROUTES.getNotifications}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(API_ROUTES.getUnreadNotificationCount),
      ]);

      totalAllCount = allPage?.totalCount || 0;
      totalUnreadCount = unreadCount || 0;

      document.getElementById("tab-count-all").textContent = totalAllCount;
      document.getElementById("tab-count-unread").textContent = totalUnreadCount;
      document.getElementById("filter-count-all").textContent = totalAllCount;
      document.getElementById("filter-count-unread").textContent = totalUnreadCount;
    } catch {
      // Non-critical — tabs just keep showing their last known counts.
    }
  }

  // ---------------- Load ----------------

  async function loadNotifications() {
    document.getElementById("loading").hidden = false;
    document.getElementById("empty").hidden = true;
    document.getElementById("notification-groups").innerHTML = "";
    document.getElementById("pagination").hidden = true;

    try {
      const params = new URLSearchParams({
        pageNumber: currentPage,
        pageSize,
        usePaging: "true",
      });
      if (currentStatusParam) params.set("status", currentStatusParam);

      const page = await apiGet(`${API_ROUTES.getNotifications}?${params.toString()}`);
      lastPageData = page;

      document.getElementById("loading").hidden = true;

      const items = page?.items || [];

      if (items.length === 0) {
        document.getElementById("empty").hidden = false;
        return;
      }

      renderList(items);
      renderPagination(page);
      updateCategoryCountsFromPage(items);
    } catch (err) {
      document.getElementById("loading").hidden = true;
      showAlert(err.message);
    }
  }

  function filteredItems(items) {
    if (currentTypeFilter === "all" || currentTypeFilter === "unread") return items;
    return items.filter((n) => (TYPE_CATEGORY[n.type] || "other") === currentTypeFilter);
  }

  function renderList(items) {
    const visible = filteredItems(items);
    const container = document.getElementById("notification-groups");

    if (visible.length === 0) {
      document.getElementById("empty").hidden = false;
      container.innerHTML = "";
      return;
    }

    document.getElementById("empty").hidden = true;

    const groups = new Map();
    visible.forEach((n) => {
      const label = dayLabel(n.dateCreated);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(n);
    });

    let html = "";
    groups.forEach((groupItems, label) => {
      html += `<p class="nf-day-label">${escapeHtml(label)}</p>`;
      html += `<div class="nf-list">${groupItems.map(renderRow).join("")}</div>`;
    });

    container.innerHTML = html;
    wireRows();
  }

  function renderRow(n) {
    const icon = TYPE_ICON[n.type] || "ti-bell";
    const isUnread = n.status === "Unread";

    let actionsHtml = "";

    if (n.type === "ConnectionRequest" && n.sourceEntityId) {
      actionsHtml = `
        <button type="button" class="btn-primary btn-compact" data-action="accept-connection" data-connection-id="${n.sourceEntityId}">Accept</button>
        <button type="button" class="btn-outline btn-compact" data-action="reject-connection" data-connection-id="${n.sourceEntityId}">Ignore</button>
      `;
    } else if (n.actionUrl) {
      actionsHtml = `<a href="${escapeHtml(n.actionUrl)}" class="btn-outline btn-compact">View</a>`;
    }

    return `
      <div class="nf-row${isUnread ? " is-unread" : ""}" data-notification-id="${n.id}" data-action-url="${escapeHtml(n.actionUrl || "")}">
        <span class="nf-row__dot"></span>
        <span class="nf-row__icon">
          ${n.actorAvatarUrl ? `<img src="${escapeHtml(n.actorAvatarUrl)}" alt="" />` : `<i class="ti ${icon}" aria-hidden="true"></i>`}
        </span>
        <div class="nf-row__body">
          <p class="nf-row__title">${escapeHtml(n.title)}</p>
          <p class="nf-row__message">${escapeHtml(n.message)}</p>
          <p class="nf-row__time">${timeAgo(n.dateCreated)}</p>
        </div>
        <div class="nf-row__actions">${actionsHtml}</div>
        <button type="button" class="nf-row__more" data-action="mark-read" title="Mark as read"><i class="ti ti-check" aria-hidden="true"></i></button>
      </div>
    `;
  }

  function wireRows() {
    document.querySelectorAll(".nf-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return; // buttons handle their own click
        const url = row.dataset.actionUrl;
        markAsRead(row.dataset.notificationId, false);
        if (url) window.location.href = url;
      });
    });

    document.querySelectorAll('[data-action="mark-read"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".nf-row");
        markAsRead(row.dataset.notificationId, true);
      });
    });

    document.querySelectorAll('[data-action="accept-connection"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await apiPost(`${API_ROUTES.acceptConnectionRequest}?connectionId=${btn.dataset.connectionId}`);
          showToast("Connection accepted", "success");
          markAsRead(btn.closest(".nf-row").dataset.notificationId, true);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });

    document.querySelectorAll('[data-action="reject-connection"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await apiPost(`${API_ROUTES.rejectConnectionRequest}?connectionId=${btn.dataset.connectionId}`);
          showToast("Request ignored", "info");
          markAsRead(btn.closest(".nf-row").dataset.notificationId, true);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    });
  }

  async function markAsRead(notificationId, refetch) {
    const row = document.querySelector(`.nf-row[data-notification-id="${notificationId}"]`);
    const wasUnread = row && row.classList.contains("is-unread");
    if (row) row.classList.remove("is-unread");

    try {
      await apiPost(`${API_ROUTES.markNotificationRead}?notificationId=${notificationId}`);

      if (wasUnread) {
        totalUnreadCount = Math.max(0, totalUnreadCount - 1);
        document.getElementById("tab-count-unread").textContent = totalUnreadCount;
        document.getElementById("filter-count-unread").textContent = totalUnreadCount;
      }

      refreshUnreadBadge();
      if (refetch) loadNotifications();
    } catch {
      // Non-critical — row already looks read locally.
    }
  }

  document.getElementById("btn-mark-all-read").addEventListener("click", async () => {
    try {
      await apiPost(API_ROUTES.markAllNotificationsRead);
      showToast("All notifications marked as read", "success");
      totalUnreadCount = 0;
      document.getElementById("tab-count-unread").textContent = 0;
      document.getElementById("filter-count-unread").textContent = 0;
      refreshUnreadBadge();
      loadNotifications();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  async function refreshUnreadBadge() {
    try {
      const count = await apiGet(API_ROUTES.getUnreadNotificationCount);
      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ notifications: count });
      }
    } catch {
      // Non-critical
    }
  }

  // ---------------- Tabs (All / Unread) ----------------

  document.querySelectorAll(".ma-status-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ma-status-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentStatusParam = tab.dataset.status;
      currentTypeFilter = tab.dataset.status === "Unread" ? "unread" : "all";
      syncFilterSidebarActive(currentTypeFilter);
      currentPage = 1;
      loadNotifications();
    });
  });

  // ---------------- Sidebar filters ----------------

  document.querySelectorAll(".nf-filter-row").forEach((row) => {
    row.addEventListener("click", () => {
      const filter = row.dataset.filter;
      currentTypeFilter = filter;
      currentStatusParam = filter === "unread" ? "Unread" : "";
      syncFilterSidebarActive(filter);

      document.querySelectorAll(".ma-status-tab").forEach((t) => {
        t.classList.toggle("is-active", t.dataset.status === currentStatusParam);
      });

      currentPage = 1;
      loadNotifications();
    });
  });

  function syncFilterSidebarActive(filter) {
    document.querySelectorAll(".nf-filter-row").forEach((r) => {
      r.classList.toggle("is-active", r.dataset.filter === filter);
    });
  }

  // Category (Connections/Messages/Jobs/Company/Other) counts are an
  // approximation scoped to the current page only — the backend has no
  // per-category count endpoint, so these reflect what's currently loaded,
  // not a global total across every page of results. "All" and "Unread"
  // counts (above) are the only ones guaranteed accurate, since those come
  // from dedicated endpoints.
  function updateCategoryCountsFromPage(items) {
    const counts = { connections: 0, messages: 0, jobs: 0, company: 0, other: 0 };

    items.forEach((n) => {
      const cat = TYPE_CATEGORY[n.type] || "other";
      counts[cat] = (counts[cat] || 0) + 1;
    });

    Object.entries(counts).forEach(([key, value]) => {
      const el = document.getElementById(`filter-count-${key}`);
      if (el) el.textContent = value;
    });
  }

  // ---------------- Pagination ----------------

  function renderPagination(page) {
    const totalPages = Math.max(1, Math.ceil(page.totalCount / page.pageSize));
    const pagination = document.getElementById("pagination");

    if (totalPages <= 1) {
      pagination.hidden = true;
      return;
    }

    pagination.hidden = false;
    document.getElementById("page-info").textContent = `Page ${page.pageNumber} of ${totalPages}`;
    document.getElementById("page-prev").disabled = page.pageNumber <= 1;
    document.getElementById("page-next").disabled = page.pageNumber >= totalPages;
  }

  document.getElementById("page-prev").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      loadNotifications();
    }
  });

  document.getElementById("page-next").addEventListener("click", () => {
    currentPage += 1;
    loadNotifications();
  });

  // ---------------- Init ----------------

  await refreshTabTotals();
  await loadNotifications();
  refreshUnreadBadge();
});