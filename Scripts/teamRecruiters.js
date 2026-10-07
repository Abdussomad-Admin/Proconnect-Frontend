document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");
  const PAGE_SIZE = 5;

  let myProfile = null; // { id, companyId, isCompanyAdmin, status, userId }
  let allMembers = [];
  let filteredMembers = [];
  let currentPage = 1;

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showAlert(message, isSuccess = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("form-alert--success", isSuccess);
    alertBox.hidden = false;
    setTimeout(() => { alertBox.hidden = true; }, 4000);
  }

  function initials(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.status !== false, status: response.status, result };
  }

  // ---------------- Init: resolve current recruiter profile ----------------

  async function init() {
    const { ok, status, result } = await apiFetch(API_ROUTES.recruiterProfile);

    if (status === 401) {
      window.location.href = "login.html?reason=session-expired";
      return;
    }

    document.getElementById("page-loading").hidden = true;

    if (!ok || !result.data) {
      showAlert(result.message || "Couldn't load your recruiter profile.");
      return;
    }

    myProfile = result.data;

    if (myProfile.status === "Pending") {
      document.getElementById("pending-banner").hidden = false;
      return;
    }

    if (myProfile.status === "Suspended") {
      showAlert("Your access to this company has been suspended. Contact your company admin for help.");
      return;
    }

    if (!myProfile.companyId) {
      showAlert("You're not yet linked to a company.");
      return;
    }

    document.getElementById("page-content").hidden = false;

    if (!myProfile.isCompanyAdmin) {
      document.getElementById("add-member-btn").hidden = true;
    }

    await Promise.all([loadTeam(), loadCompanyCard()]);
  }

  // ---------------- Load team ----------------

  async function loadTeam() {
    const params = new URLSearchParams({ usePaging: "false" });
    const { ok, result } = await apiFetch(`${API_ROUTES.companyTeam}?${params.toString()}`);

    if (!ok || !result.data) {
      showAlert(result.message || "Couldn't load your team.");
      return;
    }

    allMembers = result.data.items || [];
    renderStats();
    applyFiltersAndRender();
  }

  function renderStats() {
    const total = allMembers.length;
    const admins = allMembers.filter((m) => m.isCompanyAdmin).length;
    const recruiters = total - admins;
    const pending = allMembers.filter((m) => m.status === "Pending").length;

    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-recruiters").textContent = recruiters;
    document.getElementById("stat-admins").textContent = admins;
    document.getElementById("stat-pending").textContent = pending;
  }

  // ---------------- Filters ----------------

  function applyFiltersAndRender() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    const role = document.getElementById("role-filter").value;

    filteredMembers = allMembers.filter((m) => {
      if (keyword && !(m.fullName.toLowerCase().includes(keyword) || m.email.toLowerCase().includes(keyword))) return false;
      if (role === "admin" && !m.isCompanyAdmin) return false;
      if (role === "recruiter" && m.isCompanyAdmin) return false;
      return true;
    });

    currentPage = 1;
    renderPage();
  }

  document.getElementById("search-input").addEventListener("input", debounce(applyFiltersAndRender, 250));
  document.getElementById("role-filter").addEventListener("change", applyFiltersAndRender);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------------- Render table ----------------

  function renderPage() {
    const tableWrap = document.getElementById("table-wrap");
    const emptyEl = document.getElementById("team-empty");
    const paginationRow = document.getElementById("pagination-row");

    if (filteredMembers.length === 0) {
      tableWrap.hidden = true;
      paginationRow.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    tableWrap.hidden = false;

    const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredMembers.slice(start, start + PAGE_SIZE);

    document.getElementById("team-table-body").innerHTML = pageItems.map((m) => {
      const isSelf = myProfile.id === m.id;
      return `
        <tr data-member-id="${m.id}">
          <td>
            <div class="tr-member-cell">
              <span class="tr-member-cell__avatar">
                ${m.profilePictureUrl ? `<img src="${escapeHtml(m.profilePictureUrl)}" alt="" />` : initials(m.fullName)}
              </span>
              <div>
                <div class="tr-member-cell__name">${escapeHtml(m.fullName)} ${isSelf ? `<span class="tr-you-badge">You</span>` : ""}</div>
                <div class="tr-member-cell__sub">${escapeHtml(m.jobTitle || (m.isCompanyAdmin ? "Admin" : "Recruiter"))}</div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(m.email)}</td>
          <td><span class="tr-role-badge">${m.isCompanyAdmin ? "Admin" : "Recruiter"}</span></td>
          <td>${new Date(m.dateCreated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
          <td>${statusPill(m.status)}</td>
          <td>
            ${myProfile.isCompanyAdmin && !isSelf ? `<button type="button" class="tr-more-btn" data-more title="More"><i class="ti ti-dots" aria-hidden="true"></i></button>` : ""}
          </td>
        </tr>
      `;
    }).join("");

    document.getElementById("team-table-body").querySelectorAll("[data-more]").forEach((btn) => {
      const row = btn.closest("[data-member-id]");
      const memberId = row.dataset.memberId;
      const member = pageItems.find((m) => m.id === memberId);
      btn.addEventListener("click", (e) => openRowMenu(e.currentTarget, member));
    });

    renderPagination(totalPages);
  }

  function statusPill(status) {
    const map = {
      Active: ["tr-status-pill--active", "Active"],
      Pending: ["tr-status-pill--pending", "Pending"],
      Suspended: ["tr-status-pill--suspended", "Suspended"],
    };
    const [cls, label] = map[status] || ["tr-status-pill--active", status];
    return `<span class="tr-status-pill ${cls}">${label}</span>`;
  }

  function renderPagination(totalPages) {
    const el = document.getElementById("pagination");
    const row = document.getElementById("pagination-row");

    row.hidden = false;
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, filteredMembers.length);
    document.getElementById("showing-info").textContent = `Showing ${start}-${end} of ${filteredMembers.length} members`;

    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);

    el.innerHTML = `
      <button type="button" class="sj-page-btn" id="pg-prev" ${currentPage === 1 ? "disabled" : ""}><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
      ${pages.map((p) => `<button type="button" class="sj-page-btn ${p === currentPage ? "is-active" : ""}" data-page="${p}">${p}</button>`).join("")}
      <button type="button" class="sj-page-btn" id="pg-next" ${currentPage === totalPages ? "disabled" : ""}><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
    `;

    el.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => { currentPage = Number(btn.dataset.page); renderPage(); });
    });
    const prevBtn = document.getElementById("pg-prev");
    const nextBtn = document.getElementById("pg-next");
    if (prevBtn) prevBtn.addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); renderPage(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { currentPage = Math.min(totalPages, currentPage + 1); renderPage(); });
  }

  // ---------------- Row "more actions" menu ----------------

  const rowMenu = document.getElementById("row-menu");
  let menuTarget = null;

  function openRowMenu(anchorEl, member) {
    menuTarget = member;
    const rect = anchorEl.getBoundingClientRect();
    rowMenu.style.top = `${rect.bottom + 4}px`;
    rowMenu.style.left = `${Math.max(8, rect.right - 190)}px`;

    if (member.status === "Pending") {
      rowMenu.innerHTML = `
        <button type="button" class="ap-row-menu__item" data-action="approve"><i class="ti ti-check" aria-hidden="true"></i> Approve</button>
        <button type="button" class="ap-row-menu__item ap-row-menu__item--danger" data-action="reject"><i class="ti ti-x" aria-hidden="true"></i> Reject</button>
      `;
    } else {
      rowMenu.innerHTML = `
        <button type="button" class="ap-row-menu__item ap-row-menu__item--danger" data-action="remove"><i class="ti ti-trash" aria-hidden="true"></i> Remove from company</button>
      `;
    }

    rowMenu.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        rowMenu.hidden = true;
        handleRowAction(btn.dataset.action, menuTarget);
      });
    });

    rowMenu.hidden = false;
  }

  document.addEventListener("click", (e) => {
    if (!rowMenu.hidden && !rowMenu.contains(e.target) && !e.target.closest("[data-more]")) {
      rowMenu.hidden = true;
    }
  });

  function handleRowAction(action, member) {
    if (action === "approve") {
      confirmAction("Approve request?", `${member.fullName} will gain access to your company.`, () => approveOrReject(member.id, true));
    } else if (action === "reject") {
      confirmAction("Reject request?", `${member.fullName}'s request to join will be rejected.`, () => approveOrReject(member.id, false));
    } else if (action === "remove") {
      confirmAction("Remove from company?", `${member.fullName} will lose access to your company on ProConnect.`, () => removeMember(member.id));
    }
  }

  async function approveOrReject(recruiterProfileId, approve) {
    const { ok, result } = await apiFetch(API_ROUTES.approveRecruiter, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterProfileId, approve }),
    });

    if (!ok) {
      showAlert(result.message || "Couldn't process this request.");
      return;
    }

    showAlert(result.message || "Done.", true);
    loadTeam();
  }

  async function removeMember(recruiterProfileId) {
    const { ok, result } = await apiFetch(`${API_ROUTES.removeRecruiter}/${recruiterProfileId}`, {
      method: "DELETE",
    });

    if (!ok) {
      showAlert(result.message || "Couldn't remove this recruiter.");
      return;
    }

    showAlert(result.message || "Recruiter removed.", true);
    loadTeam();
  }

  // ---------------- Confirm modal ----------------

  const confirmOverlay = document.getElementById("confirm-overlay");
  let confirmCallback = null;

  function confirmAction(title, message, onConfirm) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    confirmCallback = onConfirm;
    confirmOverlay.hidden = false;
  }

  document.getElementById("confirm-cancel").addEventListener("click", () => {
    confirmOverlay.hidden = true;
    confirmCallback = null;
  });

  document.getElementById("confirm-ok").addEventListener("click", () => {
    confirmOverlay.hidden = true;
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  // ---------------- Add Team Member (Invite) modal ----------------

  const inviteOverlay = document.getElementById("invite-overlay");

  document.getElementById("add-member-btn").addEventListener("click", () => {
    document.getElementById("invite-email").value = "";
    document.getElementById("err-invite-email").textContent = "";
    document.getElementById("invite-result").hidden = true;
    inviteOverlay.hidden = false;
  });

  document.getElementById("invite-cancel").addEventListener("click", () => { inviteOverlay.hidden = true; });

  document.getElementById("invite-submit").addEventListener("click", async () => {
    const email = document.getElementById("invite-email").value.trim();
    const errEl = document.getElementById("err-invite-email");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = "Enter a valid email address.";
      return;
    }
    errEl.textContent = "";

    const btn = document.getElementById("invite-submit");
    btn.disabled = true;
    btn.textContent = "Sending...";

    const { ok, result } = await apiFetch(API_ROUTES.inviteRecruiter, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterEmail: email }),
    });

    btn.disabled = false;
    btn.textContent = "Send Invitation";

    if (!ok) {
      errEl.textContent = result.message || "Couldn't send the invitation.";
      return;
    }

    document.getElementById("invite-code").textContent = result.data;
    document.getElementById("invite-result").hidden = false;
  });

  document.getElementById("invite-code").addEventListener("click", (e) => {
    navigator.clipboard.writeText(e.target.textContent.trim()).catch(() => {});
  });

  // ---------------- Company card (sidebar) ----------------

  async function loadCompanyCard() {
    if (!myProfile.companyId) return;

    const { ok, result } = await apiFetch(`${API_ROUTES.getCompanyPublicProfile}/${myProfile.companyId}`);
    if (!ok || !result.data) return;

    const c = result.data;
    const card = document.getElementById("company-card");
    card.hidden = false;

    if (c.logoUrl) {
      document.getElementById("company-logo").innerHTML = `<img src="${escapeHtml(c.logoUrl)}" alt="" />`;
    }
    document.getElementById("company-name").textContent = c.name;
    if (c.isVerified) document.getElementById("company-verified").hidden = false;
    document.getElementById("company-meta").textContent = `${c.industry} · ${c.companySize}`;
    document.getElementById("company-location").textContent = c.headquarters || "—";

    if (c.website) {
      const link = document.getElementById("company-website");
      link.href = c.website;
      link.textContent = c.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }

    document.getElementById("company-founded").textContent = c.foundedYear ? `Founded ${c.foundedYear}` : "—";
    document.getElementById("company-desc").textContent = c.description;
    document.getElementById("view-company-btn").href = `company-public-profile.html?companyId=${myProfile.companyId}`;
  }

  // ---------------- Init ----------------

  await init();
});