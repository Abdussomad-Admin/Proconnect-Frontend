document.addEventListener("DOMContentLoaded", () => {
  const steps = Array.from(document.querySelectorAll(".form-step"));
  const progressItems = Array.from(document.querySelectorAll(".step-progress__item"));
  const btnSkip = document.getElementById("btn-skip");
  const btnSaveProfile = document.getElementById("btn-save-profile");
  const saveProfileLabel = document.getElementById("save-profile-label");
  const btnFinish = document.getElementById("btn-finish");
  const finishLabel = document.getElementById("finish-label");

  const TOTAL_STEPS = steps.length;

  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || sessionStorage.getItem("pc_pending_email");
  const userId = localStorage.getItem("pc_user_id");

  if (!userId) {
    window.location.href = "register.html";
    return;
  }

  let professionalProfileId = null;
  let currentStep = 1;
  updateSkipLabel(currentStep);

  // ---------------- Shared helpers ----------------

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  function isValidUrl(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  function clearFieldError(id) {
    const input = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (input) input.classList.remove("is-invalid");
    if (err) err.textContent = "";
  }

  function setFieldError(id, message) {
    const input = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (input) input.classList.add("is-invalid");
    if (err) err.textContent = message;
  }

  function updateSkipLabel(stepNumber) {
    if (stepNumber === TOTAL_STEPS) {
      btnSkip.textContent = "Skip & finish";
    } else if (stepNumber === 2) {
      btnSkip.textContent = "Skip for now";
    } else {
      btnSkip.textContent = "Skip this step";
    }
  }

  function goToStep(stepNumber) {
    currentStep = stepNumber;

    steps.forEach((step) => {
      step.classList.toggle("is-active", Number(step.dataset.step) === stepNumber);
    });

    progressItems.forEach((item) => {
      const itemStep = Number(item.dataset.step);
      item.classList.toggle("is-active", itemStep === stepNumber);
      item.classList.toggle("is-complete", itemStep < stepNumber);
    });

    updateSkipLabel(stepNumber);
    hideAlert();
  }

  function requireProfileId() {
    if (!professionalProfileId) {
      showAlert("Please save your profile info first (steps 1–2) before continuing.");
      goToStep(2);
      return false;
    }
    return true;
  }

  // ---------------- Step 1: URL validation ----------------

  function validateUrlField(id) {
    clearFieldError(id);
    const value = document.getElementById(id).value.trim();
    if (value && !isValidUrl(value)) {
      setFieldError(id, "Enter a valid URL (include https://).");
      return false;
    }
    return true;
  }

  function validateStep1() {
    const portfolioOk = validateUrlField("portfolioUrl");
    const gitHubOk = validateUrlField("gitHubUrl");
    return portfolioOk && gitHubOk;
  }

  function validateStep2Urls() {
    const linkedInOk = validateUrlField("linkedInUrl");
    const resumeOk = validateUrlField("resumeUrl");
    return linkedInOk && resumeOk;
  }

  // ---------------- "Other" dropdown helper ----------------
  // Wires a <select> that has an "__other__" option to a sibling text input,
  // revealing/hiding it as needed, and returns the effective value.

  function setupOtherSelect(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    const otherInput = document.getElementById(otherInputId);

    select.addEventListener("change", () => {
      const isOther = select.value === "__other__";
      otherInput.hidden = !isOther;
      if (isOther) {
        otherInput.focus();
      } else {
        otherInput.value = "";
      }
    });
  }

  function getSelectOrOtherValue(selectId, otherInputId) {
    const select = document.getElementById(selectId);
    if (select.value === "__other__") {
      return document.getElementById(otherInputId).value.trim();
    }
    return select.value;
  }

  setupOtherSelect("edu-institution", "edu-institution-other");
  setupOtherSelect("edu-degree", "edu-degree-other");
  setupOtherSelect("edu-field", "edu-field-other");
  setupOtherSelect("edu-grade", "edu-grade-other");
  setupOtherSelect("cert-org", "cert-org-other");

  // ---------------- Summary suggestions ----------------

  const btnToggleSummarySuggestions = document.getElementById("btn-toggle-summary-suggestions");
  const summarySuggestionsPanel = document.getElementById("summary-suggestions");
  const summaryTextarea = document.getElementById("summary");

  btnToggleSummarySuggestions.addEventListener("click", () => {
    summarySuggestionsPanel.hidden = !summarySuggestionsPanel.hidden;
  });

  summarySuggestionsPanel.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const useAsIs = !summaryTextarea.value.trim();
      summaryTextarea.value = useAsIs
        ? chip.dataset.summary
        : `${summaryTextarea.value.trim()}\n\n${chip.dataset.summary}`;
      summaryTextarea.focus();
      clearFieldError("summary");
    });
  });

  // ---------------- Step 1 -> Step 2 ----------------

  document.querySelector('#form-step-1 [data-action="next"]').addEventListener("click", () => {
    if (!validateStep1()) return;
    goToStep(2);
  });

  // ---------------- Step 2: Save profile (creates/updates profile, returns profileId) ----------------

  async function saveProfileAndAdvance() {
    hideAlert();

    if (!validateStep1() || !validateStep2Urls()) {
      goToStep(1);
      return false;
    }

    const payload = {
      userId,
      headLine: document.getElementById("headLine").value.trim() || null,
      summary: document.getElementById("summary").value.trim() || null,
      portfolioUrl: document.getElementById("portfolioUrl").value.trim() || null,
      gitHubUrl: document.getElementById("gitHubUrl").value.trim() || null,
      linkedInUrl: document.getElementById("linkedInUrl").value.trim() || null,
      resumeUrl: document.getElementById("resumeUrl").value.trim() || null,
    };

    btnSaveProfile.disabled = true;
    btnSkip.disabled = true;
    saveProfileLabel.textContent = "Saving...";

    try {
      const response = await fetch(API_ROUTES.updateProfessionalProfile, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't save your profile. Please try again.");
      }

      // Expecting the professional profile ID back in result.data.
      // Update the backend to return this if it isn't already.
      professionalProfileId = result.data;

      if (!professionalProfileId) {
        throw new Error("Profile saved, but no profile ID was returned. Check the API response.");
      }

      goToStep(3);
      return true;
    } catch (err) {
      showAlert(err.message);
      return false;
    } finally {
      btnSaveProfile.disabled = false;
      btnSkip.disabled = false;
      saveProfileLabel.textContent = "Save & continue";
    }
  }

  btnSaveProfile.addEventListener("click", saveProfileAndAdvance);

  // ---------------- Generic Back / Next (steps 3–6) ----------------

  document.querySelectorAll('[data-action="back"]').forEach((btn) => {
    btn.addEventListener("click", () => goToStep(currentStep - 1));
  });

  document.querySelectorAll('.form-step[data-step="3"] [data-action="next"], ' +
    '.form-step[data-step="4"] [data-action="next"], ' +
    '.form-step[data-step="5"] [data-action="next"], ' +
    '.form-step[data-step="6"] [data-action="next"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!requireProfileId()) return;
      goToStep(currentStep + 1);
    });
  });

  // ---------------- Entry list rendering ----------------

  function renderEntry(listId, { icon, title, subtitle, badge }) {
    const list = document.getElementById(listId);
    const card = document.createElement("div");
    card.className = "entry-card";
    card.innerHTML = `
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <span class="entry-card__icon"><i class="ti ${icon}" aria-hidden="true"></i></span>
        <div>
          <p class="entry-card__title">${title}</p>
          ${subtitle ? `<p class="entry-card__subtitle">${subtitle}</p>` : ""}
          ${badge ? `<span class="entry-card__badge"><i class="ti ti-check" aria-hidden="true"></i> ${badge}</span>` : ""}
        </div>
      </div>
    `;
    list.appendChild(card);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // ---------------- Add Experience ----------------

  const btnAddExperience = document.querySelector('[data-action="add-experience"]');
  const expCurrentCheckbox = document.getElementById("exp-current");
  const expCurrentWrap = document.getElementById("exp-current-wrap");
  const expEndInput = document.getElementById("exp-end");

  expCurrentCheckbox.addEventListener("change", () => {
    expEndInput.disabled = expCurrentCheckbox.checked;
    expCurrentWrap.classList.toggle("is-checked", expCurrentCheckbox.checked);
    if (expCurrentCheckbox.checked) expEndInput.value = "";
  });

  btnAddExperience.addEventListener("click", async () => {
    if (!requireProfileId()) return;
    hideAlert();

    const companyName = document.getElementById("exp-company").value.trim();
    const position = document.getElementById("exp-position").value.trim();
    const description = document.getElementById("exp-description").value.trim();
    const startDate = document.getElementById("exp-start").value;
    const isCurrent = expCurrentCheckbox.checked;
    const endDate = isCurrent ? null : document.getElementById("exp-end").value;

    if (!companyName || !position || !startDate || (!isCurrent && !endDate)) {
      showAlert("Company, position, and start date (and end date, unless current) are required to add an experience.");
      return;
    }

    btnAddExperience.disabled = true;

    try {
      const response = await fetch(API_ROUTES.addExperience, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          companyName,
          position,
          description: description || null,
          startDate,
          endDate,
          isCurrent,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't add this experience.");
      }

      renderEntry("list-experience", {
        icon: "ti-briefcase",
        title: `${escapeHtml(position)} · ${escapeHtml(companyName)}`,
        subtitle: `${startDate} — ${isCurrent ? "Present" : endDate}`,
        badge: isCurrent ? "Current" : "",
      });

      document.querySelectorAll(".entry-form input, .entry-form textarea").forEach((el) => {
        if (el.closest(".form-step").dataset.step === "3" && el.type !== "checkbox") el.value = "";
      });
      expCurrentCheckbox.checked = false;
      expCurrentWrap.classList.remove("is-checked");
      expEndInput.disabled = false;
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAddExperience.disabled = false;
    }
  });

  // ---------------- Add Education ----------------

  const btnAddEducation = document.querySelector('[data-action="add-education"]');

  btnAddEducation.addEventListener("click", async () => {
    if (!requireProfileId()) return;
    hideAlert();

    const institution = getSelectOrOtherValue("edu-institution", "edu-institution-other");
    const degree = getSelectOrOtherValue("edu-degree", "edu-degree-other");
    const fieldOfStudy = getSelectOrOtherValue("edu-field", "edu-field-other");
    const startDate = document.getElementById("edu-start").value;
    const endDate = document.getElementById("edu-end").value;
    const grade = getSelectOrOtherValue("edu-grade", "edu-grade-other");
    const description = document.getElementById("edu-description").value.trim();

    if (!institution || !degree || !startDate || !endDate) {
      showAlert("Institution, degree, start date, and end date are required to add education.");
      return;
    }

    btnAddEducation.disabled = true;

    try {
      const response = await fetch(API_ROUTES.addEducation, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          institution,
          degree,
          fieldOfStudy: fieldOfStudy || null,
          startDate,
          endDate,
          grade: grade || null,
          description: description || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't add this education entry.");
      }

      renderEntry("list-education", {
        icon: "ti-school",
        title: `${escapeHtml(degree)}${fieldOfStudy ? " · " + escapeHtml(fieldOfStudy) : ""}`,
        subtitle: `${escapeHtml(institution)} · ${startDate} — ${endDate}`,
      });

      document.querySelectorAll('.form-step[data-step="4"] input, .form-step[data-step="4"] textarea')
        .forEach((el) => (el.value = ""));
      document.querySelectorAll('.form-step[data-step="4"] select').forEach((el) => (el.value = ""));
      document.querySelectorAll('.form-step[data-step="4"] .other-input').forEach((el) => (el.hidden = true));
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAddEducation.disabled = false;
    }
  });

  // ---------------- Add Certificate ----------------

  const btnAddCertificate = document.querySelector('[data-action="add-certificate"]');

  btnAddCertificate.addEventListener("click", async () => {
    if (!requireProfileId()) return;
    hideAlert();

    const name = document.getElementById("cert-name").value.trim();
    const issuingOrganization = getSelectOrOtherValue("cert-org", "cert-org-other");
    const issueDate = document.getElementById("cert-issue").value;
    const expireDate = document.getElementById("cert-expire").value;
    const credentialId = document.getElementById("cert-credential-id").value.trim();
    const credentialUrl = document.getElementById("cert-credential-url").value.trim();

    if (!name || !issuingOrganization || !issueDate) {
      showAlert("Certificate name, issuing organization, and issue date are required.");
      return;
    }

    if (credentialUrl && !isValidUrl(credentialUrl)) {
      showAlert("Enter a valid credential URL (include https://).");
      return;
    }

    btnAddCertificate.disabled = true;

    try {
      const response = await fetch(API_ROUTES.addCertificate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          name,
          issuingOrganization,
          issueDate,
          expireDate: expireDate || null,
          credentialId: credentialId || null,
          credentialUrl: credentialUrl || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.isSuccess === false) {
        throw new Error(result.message || "Couldn't add this certificate.");
      }

      renderEntry("list-certificate", {
        icon: "ti-certificate",
        title: escapeHtml(name),
        subtitle: `${escapeHtml(issuingOrganization)} · Issued ${issueDate}${expireDate ? " · Expires " + expireDate : ""}`,
      });

      document.querySelectorAll('.form-step[data-step="5"] input').forEach((el) => (el.value = ""));
      document.getElementById("cert-org").value = "";
      document.getElementById("cert-org-other").hidden = true;
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAddCertificate.disabled = false;
    }
  });

  // ---------------- Skills: load list + add ----------------

  const skillSelect = document.getElementById("skill-select");

  async function loadSkills() {
    try {
      const response = await fetch(API_ROUTES.getSkills, { method: "GET" });
      const result = await response.json().catch(() => ({}));

      const skills = result?.data || [];

      if (!response.ok || !Array.isArray(skills) || skills.length === 0) {
        skillSelect.innerHTML = '<option value="">No skills available</option>';
        return;
      }

      skillSelect.innerHTML = skills
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
        .join("");
    } catch (err) {
      skillSelect.innerHTML = '<option value="">Couldn\'t load skills</option>';
    }
  }

  loadSkills();

  const btnAddSkill = document.querySelector('[data-action="add-skill"]');

  btnAddSkill.addEventListener("click", async () => {
    if (!requireProfileId()) return;
    hideAlert();

    const skillId = skillSelect.value;
    const skillName = skillSelect.options[skillSelect.selectedIndex]?.text || "";
    const level = document.getElementById("skill-level").value;
    const years = document.getElementById("skill-years").value;

    if (!skillId) {
      showAlert("Select a skill first.");
      return;
    }

    btnAddSkill.disabled = true;

    try {
      const response = await fetch(API_ROUTES.addProfessionalSkill, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          skillId,
          level,
          yearsOfExperience: years ? Number(years) : 0,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.isSuccess === false) {
        throw new Error(result.message || "Couldn't add this skill.");
      }

      renderEntry("list-skill", {
        icon: "ti-bolt",
        title: escapeHtml(skillName),
        subtitle: `${level}${years ? " · " + years + " yrs" : ""}`,
      });

      document.getElementById("skill-years").value = "";
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAddSkill.disabled = false;
    }
  });

  // ---------------- Add Project ----------------

  const btnAddProject = document.querySelector('[data-action="add-project"]');

  btnAddProject.addEventListener("click", async () => {
    if (!requireProfileId()) return;
    hideAlert();

    const title = document.getElementById("proj-title").value.trim();
    const description = document.getElementById("proj-description").value.trim();
    const projectUrl = document.getElementById("proj-url").value.trim();

    if (!title) {
      showAlert("Project title is required.");
      return;
    }

    if (projectUrl && !isValidUrl(projectUrl)) {
      showAlert("Enter a valid project URL (include https://).");
      return;
    }

    btnAddProject.disabled = true;

    try {
      const response = await fetch(API_ROUTES.addProject, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId,
          title,
          description: description || null,
          projectUrl: projectUrl || null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.isSuccess === false) {
        throw new Error(result.message || "Couldn't add this project.");
      }

      renderEntry("list-project", {
        icon: "ti-rocket",
        title: escapeHtml(title),
        subtitle: description ? escapeHtml(description) : "",
      });

      document.querySelectorAll('.form-step[data-step="7"] input, .form-step[data-step="7"] textarea')
        .forEach((el) => (el.value = ""));
    } catch (err) {
      showAlert(err.message);
    } finally {
      btnAddProject.disabled = false;
    }
  });

  // ---------------- Finish ----------------

  btnFinish.addEventListener("click", () => {
    window.location.href = `profile-overview.html?email=${encodeURIComponent(email)}`;
  });

  // ---------------- Skip (scoped to the current step only) ----------------

  btnSkip.addEventListener("click", async () => {
    hideAlert();

    if (currentStep === 1) {
      if (!validateStep1()) return;
      goToStep(2);
      return;
    }

    if (currentStep === 2) {
      await saveProfileAndAdvance();
      return;
    }

    if (currentStep === TOTAL_STEPS) {
      // window.location.href = `dashboard.html?email=${encodeURIComponent(email)}`;
      window.location.href = `profile-overview.html`;
      return;
    }

    if (!requireProfileId()) return;
    goToStep(currentStep + 1);
  });
});