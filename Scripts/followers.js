document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonAuthHeaders = { ...authHeaders, "Content-Type": "application/json" };

  const PAGE_SIZE = 10;
  let followersPageSize = PAGE_SIZE;
  let followingPageSize = PAGE_SIZE;
  let allLoadedFollowers = [];
  let allLoadedFollowing = [];

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

  function formatDate(dateString) {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (rendering into a #toast-stack div) has been removed. Its default
  // type ("info") already matched the global default, so no call sites
  // needed changing.

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
      const [followersPage, followingPage, pendingPage, connectionsPage] = await Promise.all([
        apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyFollowing}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getReceivedRequests}?pageNumber=1&pageSize=1&usePaging=true`),
        apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=1&usePaging=true`),
      ]);

      const followersCount = followersPage?.totalCount ?? 0;
      const followingCount = followingPage?.totalCount ?? 0;
      const pendingCount = pendingPage?.totalCount ?? 0;

      document.getElementById("stat-followers").textContent = followersCount;
      document.getElementById("stat-following").textContent = followingCount;

      setTabBadge("tab-badge-pending", pendingCount);
      setTabBadge("tab-badge-connections", connectionsPage?.totalCount ?? 0);
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

  // ---------------- Followers (view-only) ----------------

  async function loadFollowers() {
    const list = document.getElementById("followers-list");
    const emptyNote = document.getElementById("followers-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-followers");

    try {
      const page = await apiGet(`${API_ROUTES.getMyFollowers}?pageNumber=1&pageSize=${followersPageSize}&usePaging=true`);
      allLoadedFollowers = page?.items || [];

      applyFollowersSearch();

      loadMoreBtn.hidden = allLoadedFollowers.length >= (page?.totalCount ?? 0);

      if (allLoadedFollowers.length === 0) {
        emptyNote.hidden = false;
      }
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function applyFollowersSearch() {
    const list = document.getElementById("followers-list");
    const emptyNote = document.getElementById("followers-empty");
    const query = document.getElementById("followers-filter-input").value.trim().toLowerCase();

    if (allLoadedFollowers.length === 0) {
      list.innerHTML = "";
      return;
    }

    const filtered = query
      ? allLoadedFollowers.filter((f) => `${f.firstName} ${f.lastName}`.toLowerCase().includes(query))
      : allLoadedFollowers;

    if (filtered.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">No followers match your search.</p>';
      emptyNote.hidden = true;
      return;
    }

    emptyNote.hidden = true;
    list.innerHTML = filtered
      .map(
        (f) => `
      <div class="network-row">
        ${avatarHtml(f.profilePictureUrl, f.firstName, f.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(f.firstName)} ${escapeHtml(f.lastName)}</p>
          <p class="network-row__sub">Following you since ${formatDate(f.dateCreated)}</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-outline-sm" disabled title="Messaging is coming soon">Message</button>
        </div>
      </div>`
      )
      .join("");
  }

  document.getElementById("followers-filter-input").addEventListener("input", applyFollowersSearch);

  document.getElementById("btn-load-more-followers").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    followersPageSize += PAGE_SIZE;
    loadFollowers().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more";
    });
  });

  // ---------------- Following (with Unfollow) ----------------

  async function loadFollowing() {
    const list = document.getElementById("following-list");
    const emptyNote = document.getElementById("following-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-following");

    try {
      const page = await apiGet(`${API_ROUTES.getMyFollowing}?pageNumber=1&pageSize=${followingPageSize}&usePaging=true`);
      allLoadedFollowing = page?.items || [];

      applyFollowingSearch();

      loadMoreBtn.hidden = allLoadedFollowing.length >= (page?.totalCount ?? 0);

      if (allLoadedFollowing.length === 0) {
        emptyNote.hidden = false;
      }
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function applyFollowingSearch() {
    const list = document.getElementById("following-list");
    const emptyNote = document.getElementById("following-empty");
    const query = document.getElementById("following-filter-input").value.trim().toLowerCase();

    if (allLoadedFollowing.length === 0) {
      list.innerHTML = "";
      return;
    }

    const filtered = query
      ? allLoadedFollowing.filter((f) => `${f.firstName} ${f.lastName}`.toLowerCase().includes(query))
      : allLoadedFollowing;

    if (filtered.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">No matches found.</p>';
      emptyNote.hidden = true;
      return;
    }

    emptyNote.hidden = true;
    list.innerHTML = filtered
      .map(
        (f) => `
      <div class="network-row" data-user-id="${f.userId}">
        ${avatarHtml(f.profilePictureUrl, f.firstName, f.lastName)}
        <div class="network-row__body">
          <p class="network-row__name">${escapeHtml(f.firstName)} ${escapeHtml(f.lastName)}</p>
          <p class="network-row__sub">Following since ${formatDate(f.dateCreated)}</p>
        </div>
        <div class="network-row__actions">
          <button type="button" class="btn-outline-sm" data-action="unfollow">Unfollow</button>
        </div>
      </div>`
      )
      .join("");

    wireFollowingActions(list);
  }

  function wireFollowingActions(container) {
    container.querySelectorAll('[data-action="unfollow"]').forEach((btn) => {
      btn.addEventListener("click", () => handleUnfollow(btn));
    });
  }

  async function handleUnfollow(btn) {
    const row = btn.closest(".network-row");
    const userId = row.dataset.userId;

    btn.disabled = true;
    btn.textContent = "Removing...";

    try {
      const result = await apiPost(`${API_ROUTES.unfollowUser}?userId=${userId}`);
      showToast(result.message || "Unfollowed successfully", "success");
      row.remove();

      allLoadedFollowing = allLoadedFollowing.filter((f) => f.userId !== userId);

      const currentCount = document.getElementById("stat-following");
      currentCount.textContent = Math.max(0, Number(currentCount.textContent) - 1);

      if (allLoadedFollowing.length === 0) {
        document.getElementById("following-empty").hidden = false;
      }
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Unfollow";
    }
  }

  document.getElementById("following-filter-input").addEventListener("input", applyFollowingSearch);

  document.getElementById("btn-load-more-following").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    followingPageSize += PAGE_SIZE;
    loadFollowing().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more";
    });
  });

  // ---------------- Sub-tab switching ----------------

  document.querySelectorAll(".follow-subtab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.classList.contains("is-active")) return;

      document.querySelectorAll(".follow-subtab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      const target = tab.dataset.subtab;
      document.getElementById("panel-followers").hidden = target !== "followers";
      document.getElementById("panel-following").hidden = target !== "following";
    });
  });

  // ---------------- Init ----------------

  loadStats();
  loadFollowers();
  loadFollowing();
});