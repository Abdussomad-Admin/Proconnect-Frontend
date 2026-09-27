document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonAuthHeaders = { ...authHeaders, "Content-Type": "application/json" };

  const PAGE_SIZE = 10;
  let currentFilter = "All";
  let currentMaxResults = PAGE_SIZE;
  let allLoadedSuggestions = [];

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
      const [connectionsPage, pendingPage, followersPage] = await Promise.all([
        apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=1&usePaging=true`),
      ]);

      setTabBadge("tab-badge-pending", pendingPage?.totalCount ?? 0);
      setTabBadge("tab-badge-connections", connectionsPage?.totalCount ?? 0);
      setTabBadge("tab-badge-followers", followersPage?.totalCount ?? 0);

      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ connections: pendingPage?.totalCount ?? 0 });
      }
    } catch {
      // Badge counts are a nice-to-have on this page — fail silently.
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

  // ---------------- Suggestions ----------------

  async function loadSuggestions() {
    const grid = document.getElementById("suggestions-grid");
    const emptyNote = document.getElementById("suggestions-empty");
    const loadMoreBtn = document.getElementById("btn-load-more");

    try {
      const suggestions = await apiGet(
        `${API_ROUTES.getConnectionSuggestions}?filter=${currentFilter}&maxResults=${currentMaxResults}`
      );

      allLoadedSuggestions = suggestions || [];

      applySearchAndRender();

      // The backend returns a flat top-N list (no true cursor pagination),
      // so "Load more" just re-requests with a higher maxResults. If we got
      // back fewer than we asked for, there's nothing further to load.
      loadMoreBtn.hidden = allLoadedSuggestions.length < currentMaxResults;
    } catch (err) {
      grid.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function applySearchAndRender() {
    const grid = document.getElementById("suggestions-grid");
    const emptyNote = document.getElementById("suggestions-empty");
    const query = document.getElementById("suggestions-filter-input").value.trim().toLowerCase();

    const filtered = query
      ? allLoadedSuggestions.filter((p) =>
          `${p.firstName} ${p.lastName} ${p.headline || ""} ${p.companyName || ""}`.toLowerCase().includes(query)
        )
      : allLoadedSuggestions;

    if (filtered.length === 0) {
      grid.innerHTML = "";
      emptyNote.hidden = false;
      return;
    }

    emptyNote.hidden = true;
    grid.innerHTML = filtered.map(renderSuggestionCard).join("");
    wireCardActions(grid);
  }

  function renderSuggestionCard(person) {
    const sub = person.headline || person.companyName || "";
    const location = person.location || "";

    const tags = [];
    if (person.isSameCompany) tags.push("Same company");
    if (person.isSameIndustry) tags.push("Same industry");
    if (person.isAlumni) tags.push("Alumni");

    return `
      <div class="network-card" data-user-id="${person.userId}">
        <div class="network-card__top">
          ${avatarHtml(person.profilePictureUrl, person.firstName, person.lastName)}
          <div class="network-row__body">
            <p class="network-card__name">${escapeHtml(person.firstName)} ${escapeHtml(person.lastName)}</p>
            ${sub ? `<p class="network-card__meta">${escapeHtml(sub)}</p>` : ""}
            ${location ? `<p class="network-card__sub">${escapeHtml(location)}</p>` : ""}
            ${person.mutualConnectionsCount > 0 ? `<p class="network-card__sub">${person.mutualConnectionsCount} mutual connection${person.mutualConnectionsCount === 1 ? "" : "s"}</p>` : ""}
            ${tags.length ? `<div class="network-card__match-tags">${tags.map((t) => `<span class="network-card__match-tag">${t}</span>`).join("")}</div>` : ""}
          </div>
        </div>
        <div class="network-card__actions">
          <button type="button" class="btn-primary-sm" data-action="connect">
            <i class="ti ti-user-plus" aria-hidden="true"></i> Connect
          </button>
          <button type="button" class="btn-outline-sm" disabled title="Messaging is coming soon">
            <i class="ti ti-message-circle" aria-hidden="true"></i> Message
          </button>
        </div>
      </div>`;
  }

  function wireCardActions(container) {
    container.querySelectorAll('[data-action="connect"]').forEach((btn) => {
      btn.addEventListener("click", () => handleConnect(btn));
    });
  }

  async function handleConnect(btn) {
    const card = btn.closest(".network-card");
    const userId = card.dataset.userId;

    btn.disabled = true;
    btn.innerHTML = "Sending...";

    try {
      const result = await apiPost(`${API_ROUTES.sendConnectionRequest}?receiverId=${userId}`);
      showToast(result.message || "Invitation sent", "success");
      btn.innerHTML = '<i class="ti ti-clock" aria-hidden="true"></i> Pending';
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-user-plus" aria-hidden="true"></i> Connect';
    }
  }

  // ---------------- Filter chips ----------------

  document.querySelectorAll(".network-filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.classList.contains("is-active")) return;

      document.querySelectorAll(".network-filter-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");

      currentFilter = chip.dataset.filter;
      currentMaxResults = PAGE_SIZE;

      document.getElementById("suggestions-grid").innerHTML = '<p class="app-loading-inline">Loading suggestions...</p>';
      loadSuggestions();
    });
  });

  // ---------------- Search (client-side, over currently loaded results) ----------------

  document.getElementById("suggestions-filter-input").addEventListener("input", applySearchAndRender);

  // ---------------- Load more ----------------

  document.getElementById("btn-load-more").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";

    currentMaxResults += PAGE_SIZE;

    loadSuggestions().finally(() => {
      btn.disabled = false;
      btn.textContent = "Load more";
    });
  });

  // ---------------- Init ----------------

  loadTabBadges();
  loadSuggestions();
});