// Shared real-time badge bootstrap — notifications AND messages.
//
// IMPORTANT: include this script tag on EVERY authenticated page (not just
// notifications.html / messages.html), right after config.js, sidebar.js,
// and the SignalR CDN script. Badges only update on pages that actually
// run this file — if a page doesn't include it, its topbar badges will
// stay blank until the person happens to visit a page that does set them
// (e.g. messages.html, which also sets its own badge after loading the
// conversation list — that's unaffected by this file and will simply
// overwrite whatever this script set, with the same number).
//
// Responsibilities:
//   1. On load, fetch the current unread NOTIFICATION count via REST and
//      push it into the shared badge system.
//   2. On load, fetch the current unread MESSAGE count (summed across
//      conversations) and push that too — the same calculation
//      messages.js already does, just available everywhere, not only on
//      the Messages page itself.
//   3. Connect to NotificationHub and keep both badges + a toast in sync
//      as new notifications arrive in real time, without needing to be
//      on the Messages page to find out a new message came in (every new
//      message already creates a Type="Message" notification server-side,
//      so this hooks into that rather than opening a second connection to
//      ChatHub just for a badge count).
(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  if (!token) return; // sidebar.js / page guard already handles redirecting to login

  const authHeaders = { Authorization: `Bearer ${token}` };
  const HUB_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");
  let connection = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function showNotificationToast(payload) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return; // page doesn't have a toast mount point — badge updates still happen

    const toast = document.createElement("div");
    toast.className = "toast toast--info toast--notification";
    toast.style.cursor = payload.actionUrl ? "pointer" : "default";
    toast.innerHTML = `
      <i class="ti ti-bell" aria-hidden="true"></i>
      <span><strong>${escapeHtml(payload.title)}</strong><br/>${escapeHtml(payload.message)}</span>
    `;

    if (payload.actionUrl) {
      toast.addEventListener("click", () => {
        window.location.href = payload.actionUrl;
      });
    }

    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  async function fetchUnreadNotificationCount() {
    try {
      const response = await fetch(API_ROUTES.getUnreadNotificationCount, { headers: authHeaders });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.status !== false && window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ notifications: result.data || 0 });
      }
    } catch {
      // Non-critical — badge just stays at its last known value.
    }
  }

  // Same total-unread calculation messages.js does on the Messages page
  // itself (sum of each conversation's unreadCount) — duplicated here so
  // every other page can show an accurate badge too, not just the one
  // page that happens to load the full conversation list already.
  async function fetchUnreadMessageCount() {
    try {
      const response = await fetch(
        `${API_ROUTES.getMyConversations}?pageNumber=1&pageSize=200&usePaging=true`,
        { headers: authHeaders }
      );
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.status !== false && window.ProConnectShell) {
        const items = result.data?.items || [];
        const totalUnread = items.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        window.ProConnectShell.setBadgeCounts({ messages: totalUnread });
      }
    } catch {
      // Non-critical — badge just stays at its last known value.
    }
  }

  async function initNotificationsHub() {
    if (typeof signalR === "undefined") return; // SignalR script not loaded on this page

    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_BASE_URL}/notificationHub?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveNotification", (payload) => {
      showNotificationToast(payload);

      // A new message notification means the Messages badge is now stale
      // too — refresh it rather than waiting for the person to visit
      // messages.html themselves.
      if (payload.type === "Message") {
        fetchUnreadMessageCount();
      }
    });

    connection.on("UpdateUnreadCount", (count) => {
      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ notifications: count });
      }
    });

    try {
      await connection.start();
    } catch (err) {
      console.error("Notification hub connection failed:", err);
      // Real-time badge/toast updates won't fire, but the REST-based
      // counts fetched above still work — not a hard failure.
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    fetchUnreadNotificationCount();
    fetchUnreadMessageCount();
    initNotificationsHub();
  });
})();