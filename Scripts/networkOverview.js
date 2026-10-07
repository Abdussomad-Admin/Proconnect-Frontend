document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonAuthHeaders = { ...authHeaders, "Content-Type": "application/json" };

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
      const [connectionsPage, pendingPage, followersPage] = await Promise.all([
        apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=1&usePaging=true`),
      ]);

      const connectionsCount = connectionsPage?.totalCount ?? 0;
      const pendingCount = pendingPage?.totalCount ?? 0;
      const followersCount = followersPage?.totalCount ?? 0;

      document.getElementById("stat-connections").textContent = connectionsCount;
      document.getElementById("stat-pending").textContent = pendingCount;
      document.getElementById("stat-followers").textContent = followersCount;

      setTabBadge("tab-badge-pending", pendingCount);
      setTabBadge("tab-badge-connections", connectionsCount);
      setTabBadge("tab-badge-followers", followersCount);

      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ connections: pendingCount });
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

  // ---------------- Pending requests preview ----------------

  async function loadPendingRequestsPreview() {
    const list = document.getElementById("pending-requests-list");
    const emptyNote = document.getElementById("pending-requests-empty");

    try {
      const page = await apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=3&usePaging=true`);
      const items = page?.items || [];

      if (items.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        return;
      }

      list.innerHTML = items.map(renderPendingRequestRow).join("");
      wirePendingRequestActions(list);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderPendingRequestRow(request) {
    const name = `${escapeHtml(request.firstName)} ${escapeHtml(request.lastName)}`;
    return `
      <div class="network-row" data-connection-id="${request.connectionId}">
        ${avatarHtml(request.profilePictureUrl, request.firstName, request.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${name}</p>
          <p class="network-row__sub">Sent a connection request</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="icon-action-btn icon-action-btn--reject" data-action="reject" title="Ignore">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-action-btn icon-action-btn--accept" data-action="accept" title="Accept">
            <i class="ti ti-check" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
  }

  function wirePendingRequestActions(container) {
    container.querySelectorAll('[data-action="accept"]').forEach((btn) => {
      btn.addEventListener("click", () => handlePendingRequestAction(btn, "accept"));
    });
    container.querySelectorAll('[data-action="reject"]').forEach((btn) => {
      btn.addEventListener("click", () => handlePendingRequestAction(btn, "reject"));
    });
  }

  async function handlePendingRequestAction(btn, action) {
    const row = btn.closest(".network-row");
    const connectionId = row.dataset.connectionId;
    const route = action === "accept" ? API_ROUTES.acceptConnectionRequest : API_ROUTES.rejectConnectionRequest;

    row.querySelectorAll("button").forEach((b) => (b.disabled = true));

    try {
      const result = await apiPost(`${route}?connectionId=${connectionId}`);
      showToast(result.message || (action === "accept" ? "Connection accepted" : "Request declined"), "success");
      row.remove();
      loadStats();
      if (action === "accept") loadConnectionsPreview();

      const list = document.getElementById("pending-requests-list");
      if (!list.children.length) {
        document.getElementById("pending-requests-empty").hidden = false;
      }
    } catch (err) {
      showToast(err.message, "error");
      row.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  // ---------------- Connections preview ----------------

  let allLoadedConnections = [];

  async function loadConnectionsPreview() {
    const list = document.getElementById("connections-preview-list");
    const emptyNote = document.getElementById("connections-preview-empty");

    try {
      const page = await apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=8&usePaging=true`);
      allLoadedConnections = page?.items || [];

      renderConnectionsPreview(allLoadedConnections);

      if (allLoadedConnections.length === 0) {
        emptyNote.hidden = false;
      } else {
        emptyNote.hidden = true;
      }
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderConnectionsPreview(items) {
    const list = document.getElementById("connections-preview-list");

    if (items.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">No connections match your search.</p>';
      return;
    }

    list.innerHTML = items
      .map(
        (c) => `
      <div class="network-row">
        ${avatarHtml(c.profilePictureUrl, c.firstName, c.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-outline-sm" disabled title="Messaging is coming soon">Message</button>
        </div>
      </div>`
      )
      .join("");
  }

  document.getElementById("connections-filter-input").addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const filtered = allLoadedConnections.filter((c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(query)
    );
    renderConnectionsPreview(filtered);
  });

  // ---------------- People You May Know preview ----------------

  async function loadSuggestionsPreview() {
    const list = document.getElementById("suggestions-preview-list");
    const emptyNote = document.getElementById("suggestions-preview-empty");

    try {
      const suggestions = await apiGet(`${API_ROUTES.getConnectionSuggestions}?filter=All&maxResults=3`);

      if (!suggestions || suggestions.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        return;
      }

      list.innerHTML = suggestions.map(renderSuggestionRow).join("");
      wireSuggestionActions(list);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderSuggestionRow(person) {
    const sub = person.headline || person.companyName || "";
    return `
      <div class="network-row" data-user-id="${person.userId}">
        ${avatarHtml(person.profilePictureUrl, person.firstName, person.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</p>
          ${sub ? `<p class="network-row__meta">${escapeHtml(sub)}</p>` : ""}
          ${person.mutualConnectionsCount > 0 ? `<p class="network-row__sub">${person.mutualConnectionsCount} mutual connection${person.mutualConnectionsCount === 1 ? "" : "s"}</p>` : ""}
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-primary-sm" data-action="connect">Connect</button>
        </div>
      </div>`;
  }

  function wireSuggestionActions(container) {
    container.querySelectorAll('[data-action="connect"]').forEach((btn) => {
      btn.addEventListener("click", () => handleConnect(btn));
    });
  }

  async function handleConnect(btn) {
    const row = btn.closest(".network-row");
    const userId = row.dataset.userId;

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const result = await apiPost(`${API_ROUTES.sendConnectionRequest}?receiverId=${userId}`);
      showToast(result.message || "Invitation sent", "success");
      btn.textContent = "Pending";
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  }

  // ---------------- Init ----------------

  loadStats();
  loadPendingRequestsPreview();
  loadConnectionsPreview();
  loadSuggestionsPreview();
});