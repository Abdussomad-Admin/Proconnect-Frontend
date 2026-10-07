document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonAuthHeaders = { ...authHeaders, "Content-Type": "application/json" };

  const PAGE_SIZE = 5;
  let receivedPageSize = PAGE_SIZE;
  let sentPageSize = PAGE_SIZE;

  // ---------------- Helpers ----------------

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

  function timeAgo(dateString) {
    const then = new Date(dateString).getTime();
    if (Number.isNaN(then)) return "";

    const diffMs = Date.now() - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;

    return `${Math.floor(months / 12)}y ago`;
  }

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (rendering into a #toast-stack div) has been removed. Its default
  // type ("info") already matched the global default.

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

  // ---------------- Stat strip + tab badges ----------------

  async function loadStats() {
    try {
      const [receivedPage, sentPage, connectionsPage, followersPage] = await Promise.all([
        apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getSentRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=1&usePaging=true`),
      ]);

      const receivedCount = receivedPage?.totalCount ?? 0;
      const sentCount = sentPage?.totalCount ?? 0;

      document.getElementById("stat-received").textContent = receivedCount;
      document.getElementById("stat-sent").textContent = sentCount;

      setTabBadge("tab-badge-pending", receivedCount);
      setTabBadge("tab-badge-connections", connectionsPage?.totalCount ?? 0);
      setTabBadge("tab-badge-followers", followersPage?.totalCount ?? 0);

      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ connections: receivedCount });
      }
    } catch (err) {
      showToast(err.message, "error");
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

  // ---------------- Received requests ----------------

  async function loadReceivedRequests() {
    const list = document.getElementById("received-requests-list");
    const emptyNote = document.getElementById("received-requests-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-received");

    try {
      const page = await apiGet(
        `${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=${receivedPageSize}&usePaging=true`
      );
      const items = page?.items || [];

      document.getElementById("received-count").textContent = page?.totalCount ?? items.length;

      if (items.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        loadMoreBtn.hidden = true;
        return;
      }

      emptyNote.hidden = true;
      list.innerHTML = items.map(renderReceivedRow).join("");
      wireReceivedActions(list);

      loadMoreBtn.hidden = items.length >= (page?.totalCount ?? 0);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderReceivedRow(request) {
    return `
      <div class="network-row" data-connection-id="${request.connectionId}">
        ${avatarHtml(request.profilePictureUrl, request.firstName, request.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(request.firstName)} ${escapeHtml(request.lastName)}</p>
          <p class="network-row__sub">Sent a connection request · ${timeAgo(request.dateCreated)}</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-outline-sm" data-action="reject">Ignore</button>
          <button type="button" class="btn-primary-sm" data-action="accept">Accept</button>
        </div>
      </div>`;
  }

  function wireReceivedActions(container) {
    container.querySelectorAll('[data-action="accept"]').forEach((btn) => {
      btn.addEventListener("click", () => handleReceivedAction(btn, "accept"));
    });
    container.querySelectorAll('[data-action="reject"]').forEach((btn) => {
      btn.addEventListener("click", () => handleReceivedAction(btn, "reject"));
    });
  }

  async function handleReceivedAction(btn, action) {
    const row = btn.closest(".network-row");
    const connectionId = row.dataset.connectionId;
    const route = action === "accept" ? API_ROUTES.acceptConnectionRequest : API_ROUTES.rejectConnectionRequest;

    row.querySelectorAll("button").forEach((b) => (b.disabled = true));

    try {
      const result = await apiPost(`${route}?connectionId=${connectionId}`);
      showToast(result.message || (action === "accept" ? "Connection accepted" : "Request declined"), "success");
      row.remove();
      loadStats();

      const list = document.getElementById("received-requests-list");
      const currentCount = document.getElementById("received-count");
      currentCount.textContent = Math.max(0, Number(currentCount.textContent) - 1);

      if (!list.children.length) {
        document.getElementById("received-requests-empty").hidden = false;
      }
    } catch (err) {
      showToast(err.message, "error");
      row.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  document.getElementById("btn-load-more-received").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    receivedPageSize += PAGE_SIZE;
    loadReceivedRequests().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more";
    });
  });

  // ---------------- Sent requests ----------------

  async function loadSentRequests() {
    const list = document.getElementById("sent-requests-list");
    const emptyNote = document.getElementById("sent-requests-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-sent");

    try {
      const page = await apiGet(`${API_ROUTES.getSentRequests}?pageNumber=1&pageSize=${sentPageSize}&usePaging=true`);
      const items = page?.items || [];

      document.getElementById("sent-count").textContent = page?.totalCount ?? items.length;

      if (items.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        loadMoreBtn.hidden = true;
        return;
      }

      emptyNote.hidden = true;
      list.innerHTML = items.map(renderSentRow).join("");
      wireSentActions(list);

      loadMoreBtn.hidden = items.length >= (page?.totalCount ?? 0);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderSentRow(request) {
    return `
      <div class="network-row" data-connection-id="${request.connectionId}">
        ${avatarHtml(request.profilePictureUrl, request.firstName, request.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(request.firstName)} ${escapeHtml(request.lastName)}</p>
          <p class="network-row__sub">Request sent · ${timeAgo(request.dateCreated)}</p>
        </div>
        <div class="network-row__actions">
          <span class="pending-status-pill"><i class="ti ti-clock" aria-hidden="true"></i> Pending</span>
          <button type="button" class="btn-outline-sm" data-action="cancel">Withdraw</button>
        </div>
      </div>`;
  }

  function wireSentActions(container) {
    container.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => handleCancelSentRequest(btn));
    });
  }

  async function handleCancelSentRequest(btn) {
    const row = btn.closest(".network-row");
    const connectionId = row.dataset.connectionId;

    row.querySelectorAll("button").forEach((b) => (b.disabled = true));

    try {
      const result = await apiPost(`${API_ROUTES.cancelConnectionRequest}?connectionId=${connectionId}`);
      showToast(result.message || "Connection request cancelled", "success");
      row.remove();
      loadStats();

      const list = document.getElementById("sent-requests-list");
      const currentCount = document.getElementById("sent-count");
      currentCount.textContent = Math.max(0, Number(currentCount.textContent) - 1);

      if (!list.children.length) {
        document.getElementById("sent-requests-empty").hidden = false;
      }
    } catch (err) {
      showToast(err.message, "error");
      row.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  document.getElementById("btn-load-more-sent").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    sentPageSize += PAGE_SIZE;
    loadSentRequests().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more";
    });
  });

  // ---------------- Init ----------------

  loadStats();
  loadReceivedRequests();
  loadSentRequests();
});