document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const content = document.getElementById("content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const profileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !profileId) {
    window.location.href = "login.html";
    return;
  }

  // const profilePro = document.getElementById("profile-edit-professional");
  // profilePro.href = `profile.html?${profileId}`;

  let currentProfile = null;
  let allSkills = []; // [{id, name}] — fetched once, filtered client-side

  // ---------------- Load ----------------

  try {
    const [profileResponse, skillsResponse] = await Promise.all([
      fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` },
      }),
      fetch(API_ROUTES.getSkills, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` },
      }),
    ]);

    if (profileResponse.status === 401) {
      clearAuthAndRedirect();
      return;
    }

    const result = await profileResponse.json().catch(() => ({}));

    if (!profileResponse.ok || !result.data) {
      loadingState.innerHTML = `<span>Couldn't load your profile (${profileResponse.status}). Check the console for details.</span>`;
      console.error("Profile fetch failed:", profileResponse.status, result);
      return;
    }

    const skillsResult = await skillsResponse.json().catch(() => ({}));
    if (skillsResponse.ok && skillsResult.status && skillsResult.data) {
      allSkills = skillsResult.data; // [{id, name}]
    } else {
      console.error("Skill list fetch failed:", skillsResponse.status, skillsResult);
      // Not fatal — the Skills tab's search just comes back empty until a
      // page reload succeeds. Profile itself still loads fine.
    }

    currentProfile = result.data;
    populateAllFields(currentProfile);

    loadingState.hidden = true;
    content.hidden = false;

  } catch (err) {
    console.error("Profile fetch threw an error:", err);
    loadingState.innerHTML = `<span>Couldn't reach the server: ${err.message}.</span>`;
    return;
  }

  function clearAuthAndRedirect() {
    ["pc_token", "pc_user_id", "pc_profile_id", "pc_role", "pc_username"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    window.location.href = "login.html?reason=session-expired";
  }

  // ---------------- Tabs ----------------

  document.querySelectorAll(".ep-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ep-tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".ep-panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelector(`.ep-panel[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
    });
  });

  // ---------------- Populate everything on load ----------------

  function populateAllFields(profile) {
    const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Your Profile";
    const avatarSrc = profile.profilePicture || defaultAvatar(profile.firstName);

    document.getElementById("topbar-name").textContent = fullName;
    document.getElementById("topbar-avatar").src = avatarSrc;
    const sidebarAvatar = document.getElementById("sidebar-avatar");
    if (sidebarAvatar) sidebarAvatar.src = avatarSrc;
    const sidebarName = document.getElementById("sidebar-user-name");
    if (sidebarName) sidebarName.textContent = fullName;

    // Basic Information
    document.getElementById("basic-photo").src = avatarSrc;
    document.getElementById("basic-first-name").value = profile.firstName || "";
    document.getElementById("basic-last-name").value = profile.lastName || "";
    document.getElementById("basic-email").value = profile.email || "";
    document.getElementById("basic-phone").value = profile.phone || "";
    document.getElementById("basic-location").value = profile.location || "";

    // Headline & Summary
    document.getElementById("hs-headline").value = profile.headLine || "";
    document.getElementById("hs-summary").value = profile.summary || "";
    document.getElementById("hs-github").value = profile.gitHubUrl || "";
    document.getElementById("hs-linkedin").value = profile.linkedInUrl || "";

    // Availability
    document.getElementById("av-status").value = profile.availabilityStatus || "Available";
    document.getElementById("av-start-date").value = profile.earliestStartDate
      ? profile.earliestStartDate.split("T")[0] : "";
    document.getElementById("av-relocate").checked = !!profile.willingToRelocate;
    document.getElementById("av-work-auth").value = profile.workAuthorization || "AuthorizedNoSponsorship";
    document.getElementById("av-visibility").value = profile.availabilityVisibility || "AllRecruiters";

    // Resume
    renderResumePanel(profile);

    // Lists
    renderExperienceList(profile.experiences || []);
    renderEducationList(profile.educations || []);
    renderSkillsList(profile.skills || []);
    renderCertificateList(profile.certificates || []);
    renderPortfolioList(profile.portfolioLinks || []);

    // Right sidebar
    updatePreview(profile);
    updateStrength(profile);
  }

  function defaultAvatar(seed) {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "U")}&backgroundColor=5B3FE0&textColor=ffffff`;
  }

  function updatePreview(profile) {
    const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Your Profile";
    document.getElementById("preview-photo").src = profile.profilePicture || defaultAvatar(profile.firstName);
    document.getElementById("preview-name").textContent = fullName;
    document.getElementById("preview-headline").textContent = profile.headLine || "No headline added yet";
    const locEl = document.getElementById("preview-location");
    if (profile.location) {
      locEl.textContent = profile.location;
      locEl.hidden = false;
    }

    const viewPublicLink = document.getElementById("view-public-profile-link");
    if (viewPublicLink) viewPublicLink.href = `view-public-profile.html?id=${encodeURIComponent(profile.id)}`;
  }

  function updateStrength(profile) {
    const checks = [
      (profile.experiences || []).length > 0,
      (profile.skills || []).length > 0,
      (profile.educations || []).length > 0,
      (profile.certificates || []).length > 0,
      !!profile.resumeUrl,
    ];
    const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    document.getElementById("ep-strength-pct").textContent = `${pct}%`;
    const circumference = 2 * Math.PI * 52;
    const ring = document.getElementById("ep-strength-ring");
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
  }

  // ---------------- Basic Information: photo upload ----------------

  document.getElementById("basic-change-photo-btn").addEventListener("click", () => {
    document.getElementById("basic-photo-input").click();
  });

  document.getElementById("basic-photo-input").addEventListener("change", async () => {
    const fileInput = document.getElementById("basic-photo-input");
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast("That image is too large. Please choose one under 2MB.", "error");
      fileInput.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("UserId", userId);
    formData.append("File", file);

    try {
      const response = await fetch(API_ROUTES.uploadProfilePicture, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        showToast(result.message || "Couldn't upload your photo.", "error");
        return;
      }

      document.getElementById("basic-photo").src = result.data;
      document.getElementById("topbar-avatar").src = result.data;
      document.getElementById("preview-photo").src = result.data;
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      fileInput.value = "";
    }
  });

  // ---------------- Save: Basic Information ----------------

  async function saveBasicInfo() {
    const body = {
      userId,
      firstName: document.getElementById("basic-first-name").value.trim(),
      lastName: document.getElementById("basic-last-name").value.trim(),
      tel: document.getElementById("basic-phone").value.trim() || null,
      location: document.getElementById("basic-location").value.trim() || null,
    };

    return postJson(`${API_BASE_URL}/auth/update-basic-info`, body);
  }

  // ---------------- Save: Headline & Summary ----------------

  async function saveHeadlineSummary() {
    const body = {
      userId,
      headLine: document.getElementById("hs-headline").value.trim(),
      summary: document.getElementById("hs-summary").value.trim(),
      gitHubUrl: document.getElementById("hs-github").value.trim() || null,
      linkedInUrl: document.getElementById("hs-linkedin").value.trim() || null,
      websiteUrl: null,
    };

    return postJson(API_ROUTES.updateProfessionalProfile, body);
  }

  // ---------------- Save: Availability ----------------

  async function saveAvailability() {
    const body = {
      userId,
      availabilityStatus: document.getElementById("av-status").value,
      preferredJobTypes: [],
      preferredLocations: [],
      earliestStartDate: document.getElementById("av-start-date").value || null,
      willingToRelocate: document.getElementById("av-relocate").checked,
      workAuthorization: document.getElementById("av-work-auth").value,
      availabilityVisibility: document.getElementById("av-visibility").value,
    };

    return postJson(`${API_BASE_URL}/Professional/update-availability`, body);
  }

  // ---------------- Save Changes button: saves whichever tab is active ----------------

  document.getElementById("save-changes-btn").addEventListener("click", async () => {
    const activeTab = document.querySelector(".ep-tab.is-active").dataset.tab;
    const btn = document.getElementById("save-changes-btn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      let result;
      if (activeTab === "basic") result = await saveBasicInfo();
      else if (activeTab === "headline") result = await saveHeadlineSummary();
      else if (activeTab === "availability") result = await saveAvailability();
      else {
        btn.disabled = false;
        btn.textContent = originalLabel;
        return;
      }

      if (!result.ok) {
        showToast(result.message || "Couldn't save your changes.", "error");
      } else {
        btn.textContent = "Saved!";
        setTimeout(() => { btn.textContent = originalLabel; }, 1200);
      }
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      btn.disabled = false;
      if (btn.textContent === "Saving...") btn.textContent = originalLabel;
    }
  });

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok && result.status !== false, message: result.message, data: result.data };
  }

  // ==================================================================
  // Experience
  // ==================================================================

  function renderExperienceList(list) {
    const el = document.getElementById("experience-manage-list");
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No experience added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((e) => `
      <div class="manage-item">
        <span class="manage-item__icon"><i class="ti ti-briefcase" aria-hidden="true"></i></span>
        <div class="manage-item__body">
          <p class="manage-item__title">${escapeHtml(e.jobTitle)}</p>
          <span class="manage-item__sub">${escapeHtml(e.companyName)}</span><br/>
          <span class="manage-item__meta">${formatDate(e.startDate)} – ${e.isCurrentJob ? "Present" : formatDate(e.endDate)}</span>
        </div>
        <div class="manage-item__actions">
          <button class="manage-item__edit" data-edit-experience="${e.id}"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="manage-item__delete" data-delete-experience="${e.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-edit-experience]").forEach((btn) => {
      btn.addEventListener("click", () => openExperienceForm(list.find((e) => e.id === btn.dataset.editExperience)));
    });
    el.querySelectorAll("[data-delete-experience]").forEach((btn) => {
      btn.addEventListener("click", () => deleteExperience(btn.dataset.deleteExperience));
    });
  }

  const experienceForm = document.getElementById("experience-form");

  document.getElementById("add-experience-btn").addEventListener("click", () => openExperienceForm(null));
  document.getElementById("cancel-experience-btn").addEventListener("click", () => experienceForm.hidden = true);

  function openExperienceForm(exp) {
    document.getElementById("exp-id").value = exp ? exp.id : "";
    document.getElementById("exp-title").value = exp ? exp.jobTitle : "";
    document.getElementById("exp-company").value = exp ? exp.companyName : "";
    document.getElementById("exp-type").value = exp ? exp.employmentType : "FullTime";
    document.getElementById("exp-location").value = exp ? exp.location : "";
    document.getElementById("exp-start").value = exp ? exp.startDate.split("T")[0] : "";
    document.getElementById("exp-end").value = exp && exp.endDate ? exp.endDate.split("T")[0] : "";
    document.getElementById("exp-current").checked = exp ? exp.isCurrentJob : false;
    document.getElementById("exp-desc").value = exp && exp.description ? exp.description : "";
    experienceForm.hidden = false;
  }

  experienceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("exp-id").value;
    const body = {
      professionalProfileId: profileId,
      companyName: document.getElementById("exp-company").value.trim(),
      jobTitle: document.getElementById("exp-title").value.trim(),
      employmentType: document.getElementById("exp-type").value,
      location: document.getElementById("exp-location").value.trim(),
      startDate: document.getElementById("exp-start").value,
      endDate: document.getElementById("exp-end").value || document.getElementById("exp-start").value,
      isCurrentJob: document.getElementById("exp-current").checked,
      description: document.getElementById("exp-desc").value.trim(),
      createdBy: userId,
    };

    const url = id
      ? `${API_BASE_URL}/Professional/update-experience`
      : API_ROUTES.addExperience;
    const payload = id ? { id, ...body } : body;

    const result = await postJson(url, payload);
    if (!result.ok) { showToast(result.message || "Couldn't save experience.", "error"); return; }

    experienceForm.hidden = true;
    await reloadProfile();
  });

  async function deleteExperience(id) {
    if (!confirm("Delete this experience entry?")) return;
    const result = await postJson(`${API_BASE_URL}/Professional/delete-experience`, { id });
    if (!result.ok) { showToast(result.message || "Couldn't delete.", "error"); return; }
    await reloadProfile();
  }

  // ==================================================================
  // Education
  // ==================================================================

  function renderEducationList(list) {
    const el = document.getElementById("education-manage-list");
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No education added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((e) => `
      <div class="manage-item">
        <span class="manage-item__icon"><i class="ti ti-school" aria-hidden="true"></i></span>
        <div class="manage-item__body">
          <p class="manage-item__title">${escapeHtml(e.degree)}</p>
          <span class="manage-item__sub">${escapeHtml(e.institution)}</span><br/>
          <span class="manage-item__meta">${formatDate(e.startDate)} – ${e.endDate ? formatDate(e.endDate) : "Present"}</span>
        </div>
        <div class="manage-item__actions">
          <button class="manage-item__edit" data-edit-education="${e.id}"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="manage-item__delete" data-delete-education="${e.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-edit-education]").forEach((btn) => {
      btn.addEventListener("click", () => openEducationForm(list.find((e) => e.id === btn.dataset.editEducation)));
    });
    el.querySelectorAll("[data-delete-education]").forEach((btn) => {
      btn.addEventListener("click", () => deleteEducation(btn.dataset.deleteEducation));
    });
  }

  const educationForm = document.getElementById("education-form");

  document.getElementById("add-education-btn").addEventListener("click", () => openEducationForm(null));
  document.getElementById("cancel-education-btn").addEventListener("click", () => educationForm.hidden = true);

  function openEducationForm(edu) {
    document.getElementById("edu-id").value = edu ? edu.id : "";
    document.getElementById("edu-institution").value = edu ? edu.institution : "";
    document.getElementById("edu-degree").value = edu ? edu.degree : "";
    document.getElementById("edu-field").value = edu ? (edu.fieldOfStudy || "") : "";
    document.getElementById("edu-grade").value = edu ? (edu.grade || "") : "";
    document.getElementById("edu-start").value = edu ? edu.startDate.split("T")[0] : "";
    document.getElementById("edu-end").value = edu && edu.endDate ? edu.endDate.split("T")[0] : "";
    document.getElementById("edu-desc").value = edu && edu.description ? edu.description : "";
    educationForm.hidden = false;
  }

  educationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edu-id").value;
    const body = {
      professionalProfileId: profileId,
      institution: document.getElementById("edu-institution").value.trim(),
      degree: document.getElementById("edu-degree").value.trim(),
      fieldOfStudy: document.getElementById("edu-field").value.trim(),
      startDate: document.getElementById("edu-start").value,
      endDate: document.getElementById("edu-end").value || null,
      grade: document.getElementById("edu-grade").value.trim(),
      description: document.getElementById("edu-desc").value.trim(),
      createdBy: userId,
    };

    const url = id
      ? `${API_BASE_URL}/Professional/update-education`
      : API_ROUTES.addEducation;
    const payload = id ? { id, ...body } : body;

    const result = await postJson(url, payload);
    if (!result.ok) { showToast(result.message || "Couldn't save education.", "error"); return; }

    educationForm.hidden = true;
    await reloadProfile();
  });

  async function deleteEducation(id) {
    if (!confirm("Delete this education entry?")) return;
    const result = await postJson(`${API_BASE_URL}/Professional/delete-education`, { id, deletePermanently: false });
    if (!result.ok) { showToast(result.message || "Couldn't delete.", "error"); return; }
    await reloadProfile();
  }

  // ==================================================================
  // Skills — fetch full list once (allSkills, above), filter client-side,
  // offer "Create" when nothing matches, then add via
  // API_ROUTES.addProfessionalSkill. Remove unchanged.
  // ==================================================================

  let selectedSkill = null; // { id, name }

  const skillSearchInput = document.getElementById("skill-search-input");
  const skillSearchResults = document.getElementById("skill-search-results");
  const addSkillBtn = document.getElementById("add-skill-btn");

  skillSearchInput.addEventListener("input", () => {
    selectedSkill = null;
    addSkillBtn.disabled = true;

    const query = skillSearchInput.value.trim();
    if (query.length < 1) {
      skillSearchResults.hidden = true;
      return;
    }

    filterAndRenderSkills(query);
  });

  document.addEventListener("click", (e) => {
    if (!skillSearchResults.contains(e.target) && e.target !== skillSearchInput) {
      skillSearchResults.hidden = true;
    }
  });

  function filterAndRenderSkills(query) {
    const lower = query.toLowerCase();
    const matches = allSkills.filter((s) => s.name.toLowerCase().includes(lower)).slice(0, 8);
    renderSkillSearchResults(matches, query);
  }

  function renderSkillSearchResults(matches, query) {
    const items = matches.map((s) => `
      <div class="skill-search-result-item" data-skill-id="${s.id}" data-skill-name="${escapeAttr(s.name)}">${escapeHtml(s.name)}</div>
    `).join("");

    const exactMatch = matches.some((s) => s.name.toLowerCase() === query.toLowerCase());

    const createOption = exactMatch ? "" : `
      <div class="skill-search-result-item skill-search-result-item--create" data-create-skill="${escapeAttr(query)}">
        <i class="ti ti-plus" aria-hidden="true"></i> Create "${escapeHtml(query)}"
      </div>
    `;

    skillSearchResults.innerHTML = (items || `<div class="skill-search-empty">No matches.</div>`) + createOption;
    skillSearchResults.hidden = false;

    skillSearchResults.querySelectorAll("[data-skill-id]").forEach((el) => {
      el.addEventListener("click", () => {
        selectedSkill = { id: el.dataset.skillId, name: el.dataset.skillName };
        skillSearchInput.value = el.dataset.skillName;
        skillSearchResults.hidden = true;
        addSkillBtn.disabled = false;
      });
    });

    const createEl = skillSearchResults.querySelector("[data-create-skill]");
    if (createEl) {
      createEl.addEventListener("click", async () => {
        const name = createEl.dataset.createSkill;
        const result = await postJson(API_ROUTES.createSkill, { name, createdBy: userId });
        if (!result.ok) {
          showToast(result.message || "Couldn't create skill.", "error");
          return;
        }
        // Newly created skill is now real — add it to the cached list so
        // it shows up immediately in future searches without a refetch.
        allSkills.push({ id: result.data.id, name: result.data.name });

        selectedSkill = { id: result.data.id, name: result.data.name };
        skillSearchInput.value = result.data.name;
        skillSearchResults.hidden = true;
        addSkillBtn.disabled = false;
      });
    }
  }

  addSkillBtn.addEventListener("click", async () => {
    if (!selectedSkill) return;

    const body = {
      professionalProfileId: profileId,
      skillId: selectedSkill.id,
      level: document.getElementById("skill-level-select").value,
      yearsOfExperience: Number(document.getElementById("skill-years-input").value) || 0,
    };

    const result = await postJson(API_ROUTES.addProfessionalSkill, body);

    if (!result.ok) {
      showToast(result.message || "Couldn't add skill.", "error");
      return;
    }

    selectedSkill = null;
    skillSearchInput.value = "";
    addSkillBtn.disabled = true;
    await reloadProfile();
  });

  function renderSkillsList(list) {
    const el = document.getElementById("skills-manage-list");
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No skills added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((s) => `
      <span class="chip chip-removable">
        ${escapeHtml(s.skillName)}
        <button type="button" data-remove-skill="${s.id}" title="Remove skill"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>
    `).join("");

    el.querySelectorAll("[data-remove-skill]").forEach((btn) => {
      btn.addEventListener("click", () => removeSkill(btn.dataset.removeSkill));
    });
  }

  async function removeSkill(id) {
    if (!confirm("Remove this skill?")) return;
    const result = await postJson(`${API_BASE_URL}/Professional/remove-professional-skill`, { id });
    if (!result.ok) { showToast(result.message || "Couldn't remove skill.", "error"); return; }
    await reloadProfile();
  }

  // ==================================================================
  // Certifications
  // ==================================================================

  function renderCertificateList(list) {
    const el = document.getElementById("certificate-manage-list");
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No certifications added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((c) => `
      <div class="manage-item">
        <span class="manage-item__icon"><i class="ti ti-certificate" aria-hidden="true"></i></span>
        <div class="manage-item__body">
          <p class="manage-item__title">${escapeHtml(c.name)}</p>
          <span class="manage-item__sub">${escapeHtml(c.issuingOrganization)}</span><br/>
          <span class="manage-item__meta">Issued ${formatDate(c.issueDate)}</span>
        </div>
        <div class="manage-item__actions">
          <button class="manage-item__edit" data-edit-cert="${c.id}"><i class="ti ti-pencil" aria-hidden="true"></i></button>
          <button class="manage-item__delete" data-delete-cert="${c.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `).join("");

    el.querySelectorAll("[data-edit-cert]").forEach((btn) => {
      btn.addEventListener("click", () => openCertificateForm(list.find((c) => c.id === btn.dataset.editCert)));
    });
    el.querySelectorAll("[data-delete-cert]").forEach((btn) => {
      btn.addEventListener("click", () => deleteCertificate(btn.dataset.deleteCert));
    });
  }

  const certificateForm = document.getElementById("certificate-form");

  document.getElementById("add-certificate-btn").addEventListener("click", () => openCertificateForm(null));
  document.getElementById("cancel-certificate-btn").addEventListener("click", () => certificateForm.hidden = true);

  function openCertificateForm(cert) {
    document.getElementById("cert-id").value = cert ? cert.id : "";
    document.getElementById("cert-name").value = cert ? cert.name : "";
    document.getElementById("cert-org").value = cert ? cert.issuingOrganization : "";
    document.getElementById("cert-issue").value = cert ? cert.issueDate.split("T")[0] : "";
    document.getElementById("cert-expire").value = cert && cert.expireDate ? cert.expireDate.split("T")[0] : "";
    document.getElementById("cert-cred-id").value = "";
    document.getElementById("cert-cred-url").value = "";
    certificateForm.hidden = false;
  }

  certificateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("cert-id").value;
    const body = {
      professionalProfileId: profileId,
      name: document.getElementById("cert-name").value.trim(),
      issuingOrganization: document.getElementById("cert-org").value.trim(),
      issueDate: document.getElementById("cert-issue").value,
      expireDate: document.getElementById("cert-expire").value || null,
      credentialId: document.getElementById("cert-cred-id").value.trim(),
      credentialUrl: document.getElementById("cert-cred-url").value.trim(),
      createdBy: userId,
    };

    const url = id
      ? `${API_BASE_URL}/Professional/update-certificate`
      : API_ROUTES.addCertificate;
    const payload = id ? { id, ...body } : body;

    const result = await postJson(url, payload);
    if (!result.ok) { showToast(result.message || "Couldn't save certificate.", "error"); return; }

    certificateForm.hidden = true;
    await reloadProfile();
  });

  async function deleteCertificate(id) {
    if (!confirm("Delete this certification?")) return;
    const result = await postJson(`${API_BASE_URL}/Professional/delete-certificate`, { id, deletePermanently: false });
    if (!result.ok) { showToast(result.message || "Couldn't delete.", "error"); return; }
    await reloadProfile();
  }

  // ==================================================================
  // Resume
  // ==================================================================

  function renderResumePanel(profile) {
    const el = document.getElementById("resume-current");
    if (!profile.resumeUrl) {
      el.innerHTML = `<p class="empty-note">No resume uploaded yet.</p>`;
      return;
    }
    el.innerHTML = `
      <div class="resume-row">
        <i class="ti ti-file-type-pdf" aria-hidden="true"></i>
        <div>
          <div class="resume-row__name">Current resume</div>
          <div class="resume-row__meta">${profile.resumeViewCount || 0} views · ${profile.resumeDownloadCount || 0} downloads</div>
        </div>
      </div>
    `;
  }

  document.getElementById("resume-upload-btn").addEventListener("click", () => {
    document.getElementById("resume-input").click();
  });

  document.getElementById("resume-input").addEventListener("change", async () => {
    const fileInput = document.getElementById("resume-input");
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("ProfessionalProfileId", profileId);
    formData.append("File", file);

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/upload-resume`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        showToast(result.message || "Couldn't upload your resume.", "error");
        return;
      }

      await reloadProfile();
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      fileInput.value = "";
    }
  });

  // ==================================================================
  // Portfolio
  // ==================================================================

  function renderPortfolioList(list) {
    const el = document.getElementById("portfolio-manage-list");
    if (list.length === 0) {
      el.innerHTML = `<p class="empty-note">No portfolio links added yet.</p>`;
      return;
    }
    el.innerHTML = list.map((l) => `
      <div class="pl-manage-item">
        <span class="pl-manage-item__icon"><i class="ti ti-link" aria-hidden="true"></i></span>
        <div class="pl-manage-item__body">
          <p class="pl-manage-item__title">${escapeHtml(l.title)}</p>
          <span class="pl-manage-item__url">${escapeHtml(l.url)}</span>
        </div>
        <button class="pl-manage-item__delete" data-delete-link="${l.id}" title="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>
    `).join("");

    el.querySelectorAll("[data-delete-link]").forEach((btn) => {
      btn.addEventListener("click", () => deletePortfolioLink(btn.dataset.deleteLink));
    });
  }

  const portfolioForm = document.getElementById("add-portfolio-form");

  document.getElementById("add-portfolio-btn").addEventListener("click", () => {
    portfolioForm.hidden = false;
  });
  document.getElementById("cancel-portfolio-btn").addEventListener("click", () => {
    portfolioForm.hidden = true;
  });

  portfolioForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("ProfessionalProfileId", profileId);
    formData.append("Title", document.getElementById("pl-title").value.trim());
    formData.append("Url", document.getElementById("pl-url").value.trim());
    formData.append("LinkType", document.getElementById("pl-type").value);
    formData.append("CreatedBy", userId);

    try {
      const response = await fetch(`${API_BASE_URL}/Professional/add-portfolio-link`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        showToast(result.message || "Couldn't add portfolio link.", "error");
        return;
      }

      portfolioForm.reset();
      portfolioForm.hidden = true;
      await reloadProfile();
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  });

  async function deletePortfolioLink(id) {
    if (!confirm("Delete this portfolio link?")) return;
    const result = await postJson(`${API_BASE_URL}/Professional/delete-portfolio-link`, { id, deletePermanently: false });
    if (!result.ok) { showToast(result.message || "Couldn't delete.", "error"); return; }
    await reloadProfile();
  }

  // ---------------- Reload after any list change ----------------

  async function reloadProfile() {
    const response = await fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.data) {
      currentProfile = result.data;
      populateAllFields(currentProfile);
    }
  }

  // ---------------- Helpers ----------------

  function formatDate(dateStr) {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
});