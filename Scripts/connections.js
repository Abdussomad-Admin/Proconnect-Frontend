document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonAuthHeaders = { ...authHeaders, "Content-Type": "application/json" };

  const PAGE_SIZE = 10;
  let currentPageSize = PAGE_SIZE;
  let allLoadedConnections = [];

  // ---------------- Helpers ----------------
  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (rendering into a #toast-stack div) has been removed.

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function initials(firstName, lastName) {
    const a = (firstName || "").charAt(0);
    const b = (lastName || "").charAt(0);
    return (a + b).toUpperCase() || "?";
  }

  function avatarHtml(profilePictureUrl, firstName, lastName) {
    if (profilePictureUrl) {
      return `<img class="network-row__avatar" src="${escapeHtml(profilePictureUrl)}" alt="" />`;
    }
    return `<span class="network-row__avatar">${initials(firstName, lastName)}</span>`;
  }

  async function apiGet(url) {
    const response = await fetch(url, { method: "GET", headers: authHeaders });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new Error(result.message || "Something went wrong. Please try again.");
    }
    return result.data;
  }

  async function apiPost(url) {
    const response = await fetch(url, { method: "POST", headers: jsonAuthHeaders });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new Error(result.message || "Something went wrong. Please try again.");
    }
    return result;
  }

  // ---------------- Tab badges ----------------

  async function loadTabBadges() {
    try {
      const [pendingPage, followersPage] = await Promise.all([
        apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=1&usePaging=true`),
      ]);

      setTabBadge("tab-badge-pending", pendingPage?.totalCount ?? 0);
      setTabBadge("tab-badge-followers", followersPage?.totalCount ?? 0);

      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ connections: pendingPage?.totalCount ?? 0 });
      }
    } catch {
      // Badge counts are a nice-to-have here — fail silently.
    }
  }

  function setTabBadge(id, count) {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // ---------------- Connections list ----------------

  async function loadConnections() {
    const list = document.getElementById("connections-list");
    const emptyNote = document.getElementById("connections-empty");
    const loadMoreBtn = document.getElementById("btn-load-more");

    try {
      const page = await apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=${currentPageSize}&usePaging=true`);
      allLoadedConnections = page?.items || [];

      document.getElementById("connections-count").textContent = page?.totalCount ?? allLoadedConnections.length;

      applySearchAndRender();

      loadMoreBtn.hidden = allLoadedConnections.length >= (page?.totalCount ?? 0);

      if (allLoadedConnections.length === 0) {
        emptyNote.hidden = false;
      }
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function applySearchAndRender() {
    const list = document.getElementById("connections-list");
    const emptyNote = document.getElementById("connections-empty");
    const query = document.getElementById("connections-filter-input").value.trim().toLowerCase();

    const filtered = query
      ? allLoadedConnections.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(query))
      : allLoadedConnections;

    if (allLoadedConnections.length === 0) {
      list.innerHTML = "";
      return;
    }

    if (filtered.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">No connections match your search.</p>';
      emptyNote.hidden = true;
      return;
    }

    emptyNote.hidden = true;
    list.innerHTML = filtered.map(renderConnectionRow).join("");
    wireRowActions(list);
  }

  function renderConnectionRow(connection) {
    return `
      <div class="network-row" data-connection-id="${connection.connectionId}">
        ${avatarHtml(connection.profilePictureUrl, connection.firstName, connection.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(connection.firstName)} ${escapeHtml(connection.lastName)}</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-outline-sm" data-action="message" data-user-id="${connection.userId}">Message</button>
          <div class="connection-menu-wrap">
            <button type="button" class="icon-action-btn" data-action="toggle-menu" title="More">
              <i class="ti ti-dots-vertical" aria-hidden="true"></i>
            </button>
            <div class="connection-menu">
              <button type="button" class="connection-menu__item" data-action="remove">
                <i class="ti ti-user-x" aria-hidden="true"></i> Remove connection
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function wireRowActions(container) {
    container.querySelectorAll('[data-action="toggle-menu"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = btn.nextElementSibling;
        closeAllMenus();
        menu.classList.toggle("is-open");
      });
    });

    container.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.addEventListener("click", () => handleRemoveConnection(btn));
    });

    container.querySelectorAll('[data-action="message"]').forEach((btn) => {
      btn.addEventListener("click", () => handleMessageClick(btn));
    });
  }

  async function handleMessageClick(btn) {
    const userId = btn.dataset.userId;

    btn.disabled = true;
    btn.textContent = "Opening...";

    try {
      const result = await apiPost(`${API_ROUTES.startConversation}?recipientId=${userId}`);
      window.location.href = `messages.html?conversationId=${result.data.id}`;
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Message";
    }
  }

  function closeAllMenus() {
    document.querySelectorAll(".connection-menu.is-open").forEach((m) => m.classList.remove("is-open"));
  }

  document.addEventListener("click", closeAllMenus);

  async function handleRemoveConnection(btn) {
    const row = btn.closest(".network-row");
    const connectionId = row.dataset.connectionId;

    closeAllMenus();
    row.style.opacity = "0.5";
    row.style.pointerEvents = "none";

    try {
      const result = await apiPost(`${API_ROUTES.removeConnection}?connectionId=${connectionId}`);
      showToast(result.message || "Connection removed", "success");
      row.remove();

      allLoadedConnections = allLoadedConnections.filter((c) => c.connectionId !== connectionId);

      const currentCount = document.getElementById("connections-count");
      currentCount.textContent = Math.max(0, Number(currentCount.textContent) - 1);

      if (allLoadedConnections.length === 0) {
        document.getElementById("connections-empty").hidden = false;
      }
    } catch (err) {
      showToast(err.message, "error");
      row.style.opacity = "1";
      row.style.pointerEvents = "auto";
    }
  }

  // ---------------- Search ----------------

  document.getElementById("connections-filter-input").addEventListener("input", applySearchAndRender);

  // ---------------- Load more ----------------

  document.getElementById("btn-load-more").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    currentPageSize += PAGE_SIZE;
    loadConnections().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more";
    });
  });

  // ---------------- Init ----------------

  loadTabBadges();
  loadConnections();
});