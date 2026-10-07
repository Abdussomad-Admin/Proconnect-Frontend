document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const alertBox = document.getElementById("form-alert");
  const managementContent = document.getElementById("management-content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  let currentStatusFilter = "";
  let currentPage = 1;
  const pageSize = 10;
  let lastOverview = null;

  // ---------------- Helpers ----------------

  function showAlert(message, isSuccess = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("is-success", isSuccess);
    alertBox.hidden = false;
  }

  function hideAlert() {
    alertBox.hidden = true;
    alertBox.textContent = "";
    alertBox.classList.remove("is-success");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function initials(name) {
    return (name || "?").charAt(0).toUpperCase();
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
    return { ok: response.ok && result.status, result };
  }

  // ---------------- Tabs ----------------

  function activateTab(tabKey) {
    document.querySelectorAll(".management-tab").forEach((t) =>
      t.classList.toggle("is-active", t.dataset.tab === tabKey)
    );
    document.querySelectorAll(".tab-panel").forEach((p) =>
      p.classList.toggle("is-active", p.dataset.tabPanel === tabKey)
    );

    if (tabKey === "team" && !document.getElementById("team-table-body").dataset.loaded) {
      loadTeam();
    }

    if (tabKey === "departments" && !departmentsLoaded) {
      loadDepartments();
    }
  }

  document.querySelectorAll(".management-tab").forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
  });

  document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.gotoTab));
  });

  // ---------------- Overview: stat cards ----------------

  function renderStatCards(overview) {
    const cards = [
      { icon: "ti-users", color: "purple", value: overview.teamMemberCount, label: "Team Members" },
      { icon: "ti-briefcase", color: "green", value: overview.openPositionCount, label: "Open Positions" },
      { icon: "ti-user-check", color: "blue", value: overview.activeCandidateCount, label: "Active Candidates" },
      {
        icon: "ti-shield-check",
        color: "orange",
        value: overview.isVerified ? "Verified" : "Unverified",
        label: "Verification Status",
      },
    ];

    const iconBg = {
      purple: "var(--pc-purple-light)",
      green: "var(--pc-success-bg)",
      blue: "#E5EEFF",
      orange: "#FDEFE0",
    };
    const iconColor = {
      purple: "var(--pc-purple)",
      green: "var(--pc-success)",
      blue: "#2563EB",
      orange: "#D97706",
    };

    document.getElementById("mgmt-stat-cards").innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <span class="stat-card__icon" style="background:${iconBg[c.color]};color:${iconColor[c.color]};">
            <i class="ti ${c.icon}" aria-hidden="true"></i>
          </span>
          <div>
            <div class="stat-card__value">${c.value}</div>
            <div class="stat-card__label">${c.label}</div>
          </div>
        </div>`
      )
      .join("");
  }

  // ---------------- Overview: company info ----------------

  function renderCompanyInfo(overview) {
    document.getElementById("company-info-block").innerHTML = `
      <div class="company-info-block__logo">
        ${
          overview.logoUrl
            ? `<img src="${overview.logoUrl}" alt="${escapeHtml(overview.name)} logo" />`
            : escapeHtml(initials(overview.name))
        }
      </div>
      <div>
        <div class="company-info-block__name">
          ${escapeHtml(overview.name)}
          ${overview.isVerified ? '<i class="ti ti-rosette-discount-check verified-icon" aria-hidden="true"></i>' : ""}
        </div>
        <div class="company-info-block__meta">${overview.teamMemberCount} team members · ${overview.openPositionCount} open positions</div>
      </div>
    `;
  }

  // ---------------- Overview: team preview ----------------

  function renderTeamPreview(members) {
    const preview = members.slice(0, 5);
    const container = document.getElementById("team-preview-table");

    if (!preview.length) {
      container.innerHTML = `<p class="empty-hint">No team members yet.</p>`;
      return;
    }

    container.innerHTML = preview
      .map(
        (m) => `
        <div class="team-preview-row">
          <span class="team-preview-row__avatar">
            ${
              m.profilePictureUrl
                ? `<img src="${m.profilePictureUrl}" alt="${escapeHtml(m.fullName)}" />`
                : escapeHtml(initials(m.fullName))
            }
          </span>
          <div class="team-preview-row__info">
            <div class="team-preview-row__name">${escapeHtml(m.fullName)}</div>
            <div class="team-preview-row__email">${escapeHtml(m.email)}</div>
          </div>
          <span class="role-badge">${m.isCompanyAdmin ? "Admin" : "Recruiter"}</span>
        </div>`
      )
      .join("");
  }

  // ---------------- Team & Recruiters tab ----------------

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      currentStatusFilter = pill.dataset.status;
      currentPage = 1;
      loadTeam();
    });
  });

  function statusPillHtml(status) {
    const map = {
      Active: ["status-pill--active", "Active"],
      Pending: ["status-pill--pending", "Pending"],
      Suspended: ["status-pill--suspended", "Suspended"],
    };
    const [cls, label] = map[status] || ["status-pill--active", status];
    return `<span class="status-pill ${cls}">${label}</span>`;
  }

  function rowActionsHtml(member) {
    if (member.status === "Pending") {
      return `
        <div class="row-actions">
          <button type="button" class="row-action-btn row-action-btn--approve" data-approve="${member.id}" aria-label="Approve" title="Approve">
            <i class="ti ti-check" aria-hidden="true"></i>
          </button>
          <button type="button" class="row-action-btn row-action-btn--reject" data-reject="${member.id}" aria-label="Reject" title="Reject">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>`;
    }

    return `
      <div class="row-actions">
        <button type="button" class="row-action-btn row-action-btn--remove" data-remove="${member.id}" aria-label="Remove" title="Remove">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  function renderTeamTable(members) {
    const tbody = document.getElementById("team-table-body");
    const emptyHint = document.getElementById("team-empty-hint");

    if (!members.length) {
      tbody.innerHTML = "";
      emptyHint.hidden = false;
      return;
    }

    emptyHint.hidden = true;

    tbody.innerHTML = members
      .map(
        (m) => `
        <tr>
          <td>
            <div class="member-cell">
              <span class="member-cell__avatar">
                ${
                  m.profilePictureUrl
                    ? `<img src="${m.profilePictureUrl}" alt="${escapeHtml(m.fullName)}" />`
                    : escapeHtml(initials(m.fullName))
                }
              </span>
              <div>
                <div class="member-cell__name">${escapeHtml(m.fullName)}</div>
                <div class="member-cell__email">${escapeHtml(m.email)}</div>
              </div>
            </div>
          </td>
          <td><span class="role-badge">${m.isCompanyAdmin ? "Admin" : "Recruiter"}</span></td>
          <td>${escapeHtml(m.department || "—")}</td>
          <td>${statusPillHtml(m.status)}</td>
          <td>${new Date(m.dateCreated).toLocaleDateString()}</td>
          <td>${rowActionsHtml(m)}</td>
        </tr>`
      )
      .join("");

    wireRowActions();
  }

  function renderPagination(totalCount) {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const container = document.getElementById("team-pagination");

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let buttons = "";
    for (let i = 1; i <= totalPages; i++) {
      buttons += `<button type="button" class="${i === currentPage ? "is-active" : ""}" data-page="${i}">${i}</button>`;
    }
    container.innerHTML = buttons;

    container.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentPage = Number(btn.dataset.page);
        loadTeam();
      });
    });
  }

  async function loadTeam() {
    const tbody = document.getElementById("team-table-body");
    tbody.dataset.loaded = "true";

    const query = new URLSearchParams({
      pageNumber: currentPage,
      pageSize,
      usePaging: "true",
    });
    if (currentStatusFilter) query.set("status", currentStatusFilter);

    const { ok, result } = await apiFetch(`${API_ROUTES.companyTeam}?${query.toString()}`);

    if (!ok) {
      showAlert(result.message || "Couldn't load the team list.");
      return;
    }

    renderTeamTable(result.data.items || []);
    renderPagination(result.data.totalCount || 0);
  }

  function wireRowActions() {
    document.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", () => handleApprove(btn.dataset.approve, true));
    });
    document.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", () => confirmAction(
        "Reject Request",
        "This recruiter's request to join will be rejected.",
        () => handleApprove(btn.dataset.reject, false)
      ));
    });
    document.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => confirmAction(
        "Remove Recruiter",
        "This person will lose access to your company on ProConnect.",
        () => handleRemove(btn.dataset.remove)
      ));
    });
  }

  async function handleApprove(recruiterProfileId, approve) {
    hideAlert();

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
    refreshOverview();
  }

  async function handleRemove(recruiterProfileId) {
    hideAlert();

    const { ok, result } = await apiFetch(`${API_ROUTES.removeRecruiter}/${recruiterProfileId}`, {
      method: "DELETE",
    });

    if (!ok) {
      showAlert(result.message || "Couldn't remove this recruiter.");
      return;
    }

    showAlert(result.message || "Recruiter removed.", true);
    loadTeam();
    refreshOverview();
  }

  // ---------------- Confirm modal ----------------

  const confirmOverlay = document.getElementById("confirm-modal-overlay");
  const confirmTitle = document.getElementById("confirm-modal-title");
  const confirmText = document.getElementById("confirm-modal-text");
  let confirmCallback = null;

  function confirmAction(title, text, onConfirm) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmCallback = onConfirm;
    confirmOverlay.hidden = false;
  }

  document.getElementById("confirm-modal-cancel").addEventListener("click", () => {
    confirmOverlay.hidden = true;
    confirmCallback = null;
  });

  document.getElementById("confirm-modal-submit").addEventListener("click", () => {
    confirmOverlay.hidden = true;
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  // ---------------- Invite Recruiter modal ----------------

  const inviteOverlay = document.getElementById("invite-modal-overlay");
  const inviteEmailInput = document.getElementById("invite-email");
  const inviteSubmitBtn = document.getElementById("invite-modal-submit");
  const inviteCodeResult = document.getElementById("invite-code-result");
  const inviteCodeDisplay = document.getElementById("invite-code-display");

  function openInviteModal() {
    inviteEmailInput.value = "";
    document.querySelector('[data-error-for="invite-email"]').textContent = "";
    inviteCodeResult.hidden = true;
    inviteOverlay.hidden = false;
  }

  function closeInviteModal() {
    inviteOverlay.hidden = true;
  }

  document.getElementById("invite-recruiter-btn").addEventListener("click", openInviteModal);
  document.getElementById("qa-invite-recruiter").addEventListener("click", openInviteModal);
  document.getElementById("invite-modal-cancel").addEventListener("click", closeInviteModal);
  document.getElementById("invite-modal-close").addEventListener("click", closeInviteModal);

  inviteSubmitBtn.addEventListener("click", async () => {
    const email = inviteEmailInput.value.trim();
    const errorEl = document.querySelector('[data-error-for="invite-email"]');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = "Enter a valid email address.";
      return;
    }
    errorEl.textContent = "";

    inviteSubmitBtn.disabled = true;
    inviteSubmitBtn.innerHTML = `<span class="spinner"></span><span>Sending...</span>`;

    const { ok, result } = await apiFetch(API_ROUTES.inviteRecruiter, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterEmail: email }),
    });

    inviteSubmitBtn.disabled = false;
    inviteSubmitBtn.innerHTML = `<span class="btn-label">Send Invitation</span>`;

    if (!ok) {
      errorEl.textContent = result.message || "Couldn't send the invitation.";
      return;
    }

    inviteCodeDisplay.textContent = result.data;
    inviteCodeResult.hidden = false;
  });

  inviteCodeDisplay.addEventListener("click", () => {
    navigator.clipboard.writeText(inviteCodeDisplay.textContent.trim()).catch(() => {});
  });

  // ---------------- Load ----------------

  async function refreshOverview() {
    const { ok, result } = await apiFetch(API_ROUTES.companyManagementOverview);
    if (!ok) return { overview: null, message: result.message };
    lastOverview = result.data;
    renderStatCards(result.data);
    renderCompanyInfo(result.data);
    return { overview: result.data, message: null };
  }

  (async function init() {
    // Check membership status first — a Pending recruiter shouldn't see
    // company internals until an admin approves them.
    const { ok: profileOk, result: profileResult } = await apiFetch(API_ROUTES.recruiterProfile);

    if (!profileOk) {
      loadingState.hidden = true;
      showAlert(profileResult.message || "Couldn't load your recruiter profile.");
      return;
    }

    if (profileResult.data.status === "Pending") {
      loadingState.hidden = true;
      document.getElementById("pending-approval-banner").hidden = false;
      document.getElementById("invite-recruiter-btn").hidden = true;
      return;
    }

    if (profileResult.data.status === "Suspended") {
      loadingState.hidden = true;
      showAlert("Your access to this company has been suspended. Contact your company admin for help.");
      return;
    }

    const { overview, message } = await refreshOverview();

    if (!overview) {
      loadingState.hidden = true;
      showAlert(message || "You're not yet linked to a company. Create or join a company to manage it here.");
      return;
    }

    const teamResponse = await apiFetch(
      `${API_ROUTES.companyTeam}?pageNumber=1&pageSize=5&usePaging=true`
    );
    if (teamResponse.ok) {
      renderTeamPreview(teamResponse.result.data.items || []);
    }

    loadingState.hidden = true;
    managementContent.hidden = false;
  })();

  // ---------------- Departments tab ----------------

  let departmentsLoaded = false;
  let editingDepartmentId = null;

  async function loadDepartments() {
    departmentsLoaded = true;

    const { ok, result } = await apiFetch(API_ROUTES.getDepartments);

    if (!ok) {
      showAlert(result.message || "Couldn't load departments.");
      return;
    }

    renderDepartmentsList(result.data || []);
  }

  function renderDepartmentsList(departments) {
    const list = document.getElementById("departments-list");
    const emptyHint = document.getElementById("departments-empty-hint");

    if (!departments.length) {
      list.innerHTML = "";
      emptyHint.hidden = false;
      return;
    }

    emptyHint.hidden = true;

    list.innerHTML = departments
      .map(
        (d) => `
        <div class="department-row" data-department-id="${d.id}">
          <span class="department-row__icon"><i class="ti ti-sitemap" aria-hidden="true"></i></span>
          <div class="department-row__body">
            <div class="department-row__name">${escapeHtml(d.name)}</div>
            <div class="department-row__meta">${d.memberCount} member${d.memberCount === 1 ? "" : "s"}${d.description ? " · " + escapeHtml(d.description) : ""}</div>
          </div>
          <div class="department-row__actions">
            <button type="button" class="row-action-btn" data-edit-department="${d.id}" data-name="${escapeHtml(d.name)}" data-description="${escapeHtml(d.description || "")}" aria-label="Edit" title="Edit">
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
            <button type="button" class="row-action-btn row-action-btn--remove" data-delete-department="${d.id}" data-name="${escapeHtml(d.name)}" aria-label="Delete" title="Delete">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
        </div>`
      )
      .join("");

    wireDepartmentRowActions();
  }

  function wireDepartmentRowActions() {
    document.querySelectorAll("[data-edit-department]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openDepartmentModal({
          id: btn.dataset.editDepartment,
          name: btn.dataset.name,
          description: btn.dataset.description,
        });
      });
    });

    document.querySelectorAll("[data-delete-department]").forEach((btn) => {
      btn.addEventListener("click", () => {
        confirmAction(
          "Delete Department",
          `"${btn.dataset.name}" will be removed. Team members currently assigned to it will keep their department label until reassigned.`,
          () => handleDeleteDepartment(btn.dataset.deleteDepartment)
        );
      });
    });
  }

  async function handleDeleteDepartment(departmentId) {
    hideAlert();

    const { ok, result } = await apiFetch(`${API_ROUTES.deleteDepartment}/${departmentId}`, {
      method: "DELETE",
    });

    if (!ok) {
      showAlert(result.message || "Couldn't delete this department.");
      return;
    }

    showAlert(result.message || "Department deleted.", true);
    loadDepartments();
  }

  // ---------------- Department modal ----------------

  const departmentOverlay = document.getElementById("department-modal-overlay");
  const departmentModalTitle = document.getElementById("department-modal-title");
  const departmentNameInput = document.getElementById("department-name");
  const departmentDescriptionInput = document.getElementById("department-description");
  const departmentSubmitBtn = document.getElementById("department-modal-submit");

  function openDepartmentModal(existing = null) {
    editingDepartmentId = existing ? existing.id : null;
    departmentModalTitle.textContent = existing ? "Edit Department" : "New Department";
    departmentNameInput.value = existing ? existing.name : "";
    departmentDescriptionInput.value = existing ? existing.description : "";
    document.querySelector('[data-error-for="department-name"]').textContent = "";
    departmentOverlay.hidden = false;
  }

  function closeDepartmentModal() {
    departmentOverlay.hidden = true;
    editingDepartmentId = null;
  }

  document.getElementById("new-department-btn").addEventListener("click", () => openDepartmentModal());
  document.getElementById("department-modal-cancel").addEventListener("click", closeDepartmentModal);
  document.getElementById("department-modal-close").addEventListener("click", closeDepartmentModal);

  departmentSubmitBtn.addEventListener("click", async () => {
    const name = departmentNameInput.value.trim();
    const errorEl = document.querySelector('[data-error-for="department-name"]');

    if (!name) {
      errorEl.textContent = "Department name is required.";
      return;
    }
    errorEl.textContent = "";

    const payload = {
      name,
      description: departmentDescriptionInput.value.trim() || null,
    };

    departmentSubmitBtn.disabled = true;
    departmentSubmitBtn.innerHTML = `<span class="spinner"></span><span>Saving...</span>`;

    const isEdit = Boolean(editingDepartmentId);
    const url = isEdit ? `${API_ROUTES.updateDepartment}/${editingDepartmentId}` : API_ROUTES.createDepartment;

    const { ok, result } = await apiFetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    departmentSubmitBtn.disabled = false;
    departmentSubmitBtn.innerHTML = `<span class="btn-label">Save Department</span>`;

    if (!ok) {
      errorEl.textContent = result.message || "Couldn't save this department.";
      return;
    }

    closeDepartmentModal();
    showAlert(result.message || "Saved.", true);
    loadDepartments();
  });
});