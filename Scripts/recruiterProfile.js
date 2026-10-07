document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const profileLayout = document.getElementById("profile-layout");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  // Holds the last-loaded profile so the Edit tab can be populated/reset
  // without refetching, and so Overview can be re-rendered after a save.
  let currentProfile = null;

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function initials(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  // ---------------- Top-level tabs: Overview / Edit Profile ----------------

  const toplevelTabs = document.querySelectorAll(".toplevel-tab");
  const toplevelPanels = document.querySelectorAll(".toplevel-panel");
  const headerEditBtn = document.getElementById("header-edit-profile-btn");

  function switchToplevelTab(tabName) {
    toplevelTabs.forEach((t) => t.classList.toggle("is-active", t.dataset.toplevelTab === tabName));
    toplevelPanels.forEach((p) => {
      const isMatch = p.dataset.toplevelPanel === tabName;
      p.classList.toggle("is-active", isMatch);
      p.hidden = !isMatch;
    });

    headerEditBtn.hidden = tabName === "edit";

    if (tabName === "edit" && currentProfile) {
      populateEditForm(currentProfile);
    }
  }

  toplevelTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchToplevelTab(tab.dataset.toplevelTab));
  });

  headerEditBtn.addEventListener("click", () => switchToplevelTab("edit"));

  // ---------------- Overview sub tabs (About / Experience / Skills / Certifications) ----------------

  document.querySelectorAll(".profile-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".profile-tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelector(`[data-tab-panel="${tab.dataset.tab}"]`).classList.add("is-active");
    });
  });

  // ---------------- Render (Overview) ----------------

  function renderProfile(p) {
    const avatar = document.getElementById("profile-avatar");
    avatar.innerHTML = p.profilePictureUrl
      ? `<img src="${p.profilePictureUrl}" alt="${escapeHtml(p.fullName)}" />`
      : escapeHtml(p.fullName.charAt(0));

    document.getElementById("recruiter-name").textContent = p.fullName;
    document.getElementById("role-badge").textContent = p.isCompanyAdmin ? "Company Admin" : "Recruiter";

    const metaParts = [p.jobTitle, p.department].filter(Boolean);
    document.getElementById("recruiter-meta").textContent = metaParts.join(" · ") || "Recruiter";

    const contactRow = document.getElementById("contact-row");
    const contactItems = [
      { icon: "ti-mail", value: p.email },
      p.tel ? { icon: "ti-phone", value: p.tel } : null,
      p.location ? { icon: "ti-map-pin", value: p.location } : null,
      { icon: "ti-calendar", value: `Joined ${new Date(p.dateCreated).toLocaleDateString()}` },
    ].filter(Boolean);

    contactRow.innerHTML = contactItems
      .map((c) => `<span><i class="ti ${c.icon}" aria-hidden="true"></i> ${escapeHtml(c.value)}</span>`)
      .join("");

    document.getElementById("recruiter-bio").textContent = p.bio || "No summary added yet.";

    // Stats — only real, derivable numbers
    const stats = [
      { icon: "ti-briefcase", value: p.openJobCount, label: "Open Jobs" },
      { icon: "ti-user-check", value: p.totalHireCount, label: "Total Hires" },
    ];

    document.getElementById("stats-grid").innerHTML = stats
      .map(
        (s) => `
        <div class="stat-item">
          <span class="stat-item__icon"><i class="ti ${s.icon}" aria-hidden="true"></i></span>
          <div>
            <div class="stat-item__value">${s.value}</div>
            <div class="stat-item__label">${s.label}</div>
          </div>
        </div>`
      )
      .join("");

    // Connected company
    const connectedCard = document.getElementById("connected-company-card");
    const noCompanyCard = document.getElementById("no-company-card");

    if (p.companyId) {
      connectedCard.hidden = false;
      noCompanyCard.hidden = true;

      document.getElementById("connected-company").innerHTML = `
        <div class="connected-company__logo">
          ${
            p.companyLogoUrl
              ? `<img src="${p.companyLogoUrl}" alt="${escapeHtml(p.companyName)} logo" />`
              : escapeHtml((p.companyName || "?").charAt(0))
          }
        </div>
        <div>
          <div class="connected-company__name">
            ${escapeHtml(p.companyName)}
          </div>
          <div class="connected-company__meta">${escapeHtml(p.companyIndustry || "")}${p.companyCompanySize ? " · " + escapeHtml(p.companyCompanySize) : ""}</div>
        </div>
      `;

      localStorage.setItem("pc_company_id", p.companyId);
    } else {
      connectedCard.hidden = true;
      noCompanyCard.hidden = false;
    }
  }

  // ---------------- Edit Profile tab ----------------

  const editFirstName = document.getElementById("edit-first-name");
  const editLastName = document.getElementById("edit-last-name");
  const editJobTitle = document.getElementById("edit-job-title");
  const editDepartment = document.getElementById("edit-department");
  const editEmail = document.getElementById("edit-email");
  const editTel = document.getElementById("edit-tel");
  const editLocation = document.getElementById("edit-location");
  const editBio = document.getElementById("edit-bio");
  const editBioCount = document.getElementById("edit-bio-count");
  const editAvatarPreview = document.getElementById("edit-avatar-preview");

  const previewAvatar = document.getElementById("preview-avatar");
  const previewName = document.getElementById("preview-name");
  const previewRoleBadge = document.getElementById("preview-role-badge");
  const previewMeta = document.getElementById("preview-meta");
  const previewContact = document.getElementById("preview-contact");
  const previewBio = document.getElementById("preview-bio");

  function splitFullName(fullName) {
    const parts = (fullName || "").trim().split(/\s+/);
    return {
      firstName: parts.shift() || "",
      lastName: parts.join(" "),
    };
  }

  function setAvatarNode(node, url, seedName) {
    node.innerHTML = url
      ? `<img src="${url}" alt="" />`
      : escapeHtml(initials(seedName));
  }

  function populateEditForm(p) {
    const { firstName, lastName } = splitFullName(p.fullName);

    editFirstName.value = firstName;
    editLastName.value = lastName;
    editJobTitle.value = p.jobTitle || "";
    editDepartment.value = p.department || "";
    editEmail.value = p.email || "";
    editTel.value = p.tel || "";
    editLocation.value = p.location || "";
    editBio.value = p.bio || "";
    editBioCount.textContent = editBio.value.length;

    setAvatarNode(editAvatarPreview, p.profilePictureUrl, p.fullName);

    previewRoleBadge.textContent = p.isCompanyAdmin ? "Company Admin" : "Recruiter";
    previewRoleBadge.hidden = false;

    updateLivePreview();
  }

  function updateLivePreview() {
    const fullName = `${editFirstName.value} ${editLastName.value}`.trim() || "—";
    const metaParts = [editJobTitle.value, editDepartment.value].filter(Boolean);

    previewName.textContent = fullName;
    previewMeta.textContent = metaParts.join(" · ") || "Recruiter";

    setAvatarNode(previewAvatar, currentProfile && currentProfile.profilePictureUrl, fullName);

    const contactItems = [
      editEmail.value ? { icon: "ti-mail", value: editEmail.value } : null,
      editTel.value ? { icon: "ti-phone", value: editTel.value } : null,
      editLocation.value ? { icon: "ti-map-pin", value: editLocation.value } : null,
    ].filter(Boolean);

    previewContact.innerHTML = contactItems
      .map((c) => `<span><i class="ti ${c.icon}" aria-hidden="true"></i> ${escapeHtml(c.value)}</span>`)
      .join("");

    previewBio.textContent = editBio.value || "No summary added yet.";
  }

  [editFirstName, editLastName, editJobTitle, editDepartment, editTel, editLocation].forEach((input) => {
    input.addEventListener("input", updateLivePreview);
  });

  editBio.addEventListener("input", () => {
    editBioCount.textContent = editBio.value.length;
    updateLivePreview();
  });

  // ---------------- Edit Profile: photo upload ----------------
  // Reuses the same upload endpoint as the rest of the app (see
  // profileOverview.js) so the photo updates everywhere immediately,
  // rather than waiting for "Save Changes".

  const editPhotoUploadBtn = document.getElementById("edit-photo-upload-btn");
  const editPhotoInput = document.getElementById("edit-photo-input");

  editPhotoUploadBtn.addEventListener("click", () => editPhotoInput.click());

  editPhotoInput.addEventListener("change", async () => {
    const file = editPhotoInput.files[0];
    if (!file) return;

    const userId = localStorage.getItem("pc_user_id");
    if (!userId) {
      showToast("Couldn't find your user ID — try logging in again.", "error");
      return;
    }

    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      showToast("That image is too large. Please choose one under 2MB.", "error");
      editPhotoInput.value = "";
      return;
    }

    editAvatarPreview.classList.add("is-uploading");

    const formData = new FormData();
    formData.append("UserId", userId);
    formData.append("File", file);

    try {
      const response = await fetch(API_ROUTES.uploadProfilePicture, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        console.error("Photo upload failed:", response.status, result);
        showToast(result.message || "Couldn't upload your photo. Please try again.", "error");
        return;
      }

      const newUrl = result.data;
      if (currentProfile) currentProfile.profilePictureUrl = newUrl;

      setAvatarNode(editAvatarPreview, newUrl, `${editFirstName.value} ${editLastName.value}`);
      setAvatarNode(previewAvatar, newUrl, `${editFirstName.value} ${editLastName.value}`);

      const overviewAvatar = document.getElementById("profile-avatar");
      if (overviewAvatar) setAvatarNode(overviewAvatar, newUrl, currentProfile ? currentProfile.fullName : "");

      const sidebarAvatar = document.getElementById("sidebar-avatar");
      const topbarAvatar = document.getElementById("topbar-avatar");
      if (sidebarAvatar) sidebarAvatar.src = newUrl;
      if (topbarAvatar) topbarAvatar.src = newUrl;

      localStorage.setItem("pc_avatar_url", newUrl);
    } catch (err) {
      console.error("Photo upload threw an error:", err);
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      editAvatarPreview.classList.remove("is-uploading");
      editPhotoInput.value = "";
    }
  });

  // ---------------- Edit Profile: cancel / save ----------------

  document.getElementById("edit-cancel-btn").addEventListener("click", () => {
    if (currentProfile) populateEditForm(currentProfile);
    switchToplevelTab("overview");
  });

  const saveBtn = document.getElementById("edit-save-btn");

  saveBtn.addEventListener("click", async () => {
    hideAlert();

    const firstName = editFirstName.value.trim();
    const lastName = editLastName.value.trim();

    if (!firstName || !lastName) {
      showAlert("First and last name are required.");
      return;
    }

    const payload = {
      firstName,
      lastName,
      jobTitle: editJobTitle.value.trim() || null,
      department: editDepartment.value.trim() || null,
      tel: editTel.value.trim() || null,
      location: editLocation.value.trim() || null,
      bio: editBio.value.trim(),
    };

    saveBtn.disabled = true;
    saveBtn.classList.add("is-saving");

    try {
      const response = await fetch(API_ROUTES.updateRecruiterProfile, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        showAlert(result.message || "Couldn't save your changes. Please try again.");
        return;
      }

      currentProfile = {
        ...currentProfile,
        fullName: `${firstName} ${lastName}`.trim(),
        jobTitle: payload.jobTitle,
        department: payload.department,
        tel: payload.tel,
        location: payload.location,
        bio: payload.bio,
      };

      renderProfile(currentProfile);
      switchToplevelTab("overview");
    } catch (err) {
      console.error("Save recruiter profile threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove("is-saving");
    }
  });

  // ---------------- Load ----------------

  try {
    const response = await fetch(API_ROUTES.recruiterProfile, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.status) {
      loadingState.hidden = true;
      showAlert(result.message || "Couldn't load your recruiter profile.");
      return;
    }

    currentProfile = result.data;
    renderProfile(currentProfile);

    loadingState.hidden = true;
    profileLayout.hidden = false;
  } catch (err) {
    loadingState.hidden = true;
    showAlert("Couldn't reach the server. Check your connection and try again.");
  }
});