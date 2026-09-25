document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const alertBox = document.getElementById("form-alert");

  const fields = {
    title: document.getElementById("job-title"),
    employmentType: document.getElementById("employment-type"),
    jobCategory: document.getElementById("job-category"),
    experienceLevel: document.getElementById("experience-level"),
    location: document.getElementById("job-location"),
    minSalary: document.getElementById("min-salary"),
    maxSalary: document.getElementById("max-salary"),
    currency: document.getElementById("currency"),
    applicationDeadline: document.getElementById("application-deadline"),
    description: document.getElementById("job-description"),
    requirement: document.getElementById("job-requirement"),
    scheduledPublishAt: document.getElementById("scheduled-publish-at"),
  };

  let companyId = null;

  // ---------------- Helpers ----------------

  function hideAlert() {
    alertBox.hidden = true;
    alertBox.textContent = "";
    alertBox.classList.remove("form-alert--success");
  }

  function showAlert(message, isSuccess = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("form-alert--success", isSuccess);
    alertBox.hidden = false;
    alertBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearFieldError(id) {
    const err = document.getElementById(`err-${id}`);
    if (err) err.textContent = "";
  }

  function setFieldError(id, message) {
    const err = document.getElementById(`err-${id}`);
    if (err) err.textContent = message;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------- Load recruiter's company ----------------
  // NOTE: assumes GET `${API_ROUTES.recruiterProfile}/{id}` returns a
  // RecruiterProfile-shaped object with a `companyId` field, mirroring the
  // `${API_ROUTES.professionalProfile}/{id}` pattern used elsewhere. If the
  // actual response shape differs, adjust the `result.data.companyId`
  // lookup below.

  try {
    const response = await fetch(API_ROUTES.recruiterProfile, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      window.location.href = "login.html?reason=session-expired";
      return;
    }

    if (!response.ok || !result.data || !result.data.companyId) {
      console.error("Couldn't resolve companyId from recruiter profile:", response.status, result);
      showAlert("Couldn't load your company details. Please refresh, or set up your company first.");
      return;
    }

    companyId = result.data.companyId;

    if (result.data.companyName) {
      document.getElementById("preview-company").textContent = result.data.companyName;
    }
  } catch (err) {
    console.error("Recruiter profile fetch threw an error:", err);
    showAlert("Couldn't reach the server. Check your connection and try again.");
    return;
  }

  // ---------------- Load job categories (Department dropdown) ----------------

  try {
    const response = await fetch(API_ROUTES.getJobCategories, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));

    if (response.ok && result.data) {
      const select = fields.jobCategory;
      result.data.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
      });
    } else {
      console.error("Couldn't load job categories:", response.status, result);
    }
  } catch (err) {
    console.error("Job categories fetch threw an error:", err);
  }

  // ---------------- Skills picker (client-side state, saved after job creation) ----------------

  let allSkills = [];
  let selectedSkills = []; // [{ id, name }]

  async function loadSkillsList() {
    try {
      const response = await fetch(API_ROUTES.getSkills, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        allSkills = result.data;
      }
    } catch (err) {
      console.error("Skills list fetch threw an error:", err);
    }
  }

  const skillsSearchInput = document.getElementById("skills-search");
  const skillsDropdown = document.getElementById("skills-dropdown");

  skillsSearchInput.addEventListener("input", () => {
    const term = skillsSearchInput.value.trim().toLowerCase();
    if (!term) {
      skillsDropdown.hidden = true;
      return;
    }
    const matches = allSkills.filter((s) =>
      s.name.toLowerCase().includes(term) && !selectedSkills.some((sel) => sel.id === s.id)
    ).slice(0, 8);

    skillsDropdown.innerHTML = matches.length > 0
      ? matches.map((s) => `<div class="cj-skills-dropdown__item" data-skill-id="${s.id}" data-skill-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join("")
      : `<div class="cj-skills-dropdown__empty">No matching skills.</div>`;
    skillsDropdown.hidden = false;

    skillsDropdown.querySelectorAll("[data-skill-id]").forEach((item) => {
      item.addEventListener("click", () => {
        selectedSkills.push({ id: item.dataset.skillId, name: item.dataset.skillName });
        renderSkillChips();
        skillsSearchInput.value = "";
        skillsDropdown.hidden = true;
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!skillsDropdown.contains(e.target) && e.target !== skillsSearchInput) {
      skillsDropdown.hidden = true;
    }
  });

  function renderSkillChips() {
    document.getElementById("skills-chips").innerHTML = selectedSkills.map((s) => `
      <span class="cj-skill-chip">${escapeHtml(s.name)} <button type="button" data-remove-skill="${s.id}"><i class="ti ti-x" aria-hidden="true"></i></button></span>
    `).join("");

    document.querySelectorAll("[data-remove-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedSkills = selectedSkills.filter((s) => s.id !== btn.dataset.removeSkill);
        renderSkillChips();
      });
    });
  }

  await loadSkillsList();

  // ---------------- Character counters ----------------

  function wireCharCount(textarea, counterId) {
    const counter = document.getElementById(counterId);
    textarea.addEventListener("input", () => {
      counter.textContent = textarea.value.length;
    });
  }

  wireCharCount(fields.description, "description-count");
  wireCharCount(fields.requirement, "requirement-count");

  // ---------------- Publishing options: show/hide schedule picker ----------------

  const scheduleField = document.getElementById("schedule-field");
  document.querySelectorAll('input[name="publish-option"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      scheduleField.hidden = radio.value !== "schedule" || !radio.checked;
    });
  });

  // ---------------- Live preview ----------------

  function updatePreview() {
    document.getElementById("preview-title").textContent = fields.title.value.trim() || "Job Title";
    document.getElementById("preview-location").innerHTML =
      `<i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(fields.location.value.trim() || "Location")}`;

    const workplaceType = document.querySelector('input[name="workplace-type"]:checked')?.value || "Onsite";
    document.getElementById("preview-workplace").innerHTML =
      `<i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${workplaceType}`;

    const employmentLabel = fields.employmentType.selectedOptions[0]?.textContent || "Employment type";
    document.getElementById("preview-employment").innerHTML =
      `<i class="ti ti-briefcase" aria-hidden="true"></i> ${escapeHtml(employmentLabel)}`;
  }

  [fields.title, fields.location, fields.employmentType].forEach((el) =>
    el.addEventListener("input", updatePreview)
  );
  document.querySelectorAll('input[name="workplace-type"]').forEach((r) =>
    r.addEventListener("change", updatePreview)
  );

  // ---------------- Validation ----------------

  function validate() {
    let valid = true;
    ["job-title", "employment-type", "job-category", "experience-level", "job-location",
      "application-deadline", "job-description", "job-requirement"].forEach(clearFieldError);
    clearFieldError("scheduled-publish-at");

    if (!fields.title.value.trim()) {
      setFieldError("job-title", "Job title is required.");
      valid = false;
    }
    if (!fields.employmentType.value) {
      setFieldError("employment-type", "Select an employment type.");
      valid = false;
    }
    if (!fields.jobCategory.value) {
      setFieldError("job-category", "Select a department.");
      valid = false;
    }
    if (!fields.experienceLevel.value) {
      setFieldError("experience-level", "Select an experience level.");
      valid = false;
    }
    if (!fields.location.value.trim()) {
      setFieldError("job-location", "Location is required.");
      valid = false;
    }
    if (!fields.applicationDeadline.value) {
      setFieldError("application-deadline", "Application deadline is required.");
      valid = false;
    } else if (new Date(fields.applicationDeadline.value) <= new Date()) {
      setFieldError("application-deadline", "Deadline must be in the future.");
      valid = false;
    }
    if (!fields.description.value.trim()) {
      setFieldError("job-description", "Job description is required.");
      valid = false;
    }
    if (!fields.requirement.value.trim()) {
      setFieldError("job-requirement", "Requirements are required.");
      valid = false;
    }
    if (fields.minSalary.value && fields.maxSalary.value &&
        Number(fields.minSalary.value) > Number(fields.maxSalary.value)) {
      setFieldError("job-location", ""); // no dedicated slot; surface via alert instead
      showAlert("Minimum salary cannot exceed maximum salary.");
      valid = false;
    }

    const publishOption = document.querySelector('input[name="publish-option"]:checked')?.value;
    if (publishOption === "schedule" && !fields.scheduledPublishAt.value) {
      setFieldError("scheduled-publish-at", "Pick a publish date and time.");
      valid = false;
    } else if (publishOption === "schedule" && new Date(fields.scheduledPublishAt.value) <= new Date()) {
      setFieldError("scheduled-publish-at", "Publish date must be in the future.");
      valid = false;
    }

    return valid;
  }

  // ---------------- Build & submit ----------------

  function resolveStatus(forceDraft) {
    if (forceDraft) return { status: "Draft", scheduledPublishAt: null };

    const publishOption = document.querySelector('input[name="publish-option"]:checked')?.value;

    if (publishOption === "schedule") {
      return { status: "Scheduled", scheduledPublishAt: new Date(fields.scheduledPublishAt.value).toISOString() };
    }
    if (publishOption === "draft") {
      return { status: "Draft", scheduledPublishAt: null };
    }
    return { status: "Active", scheduledPublishAt: null };
  }

  async function submitJob(forceDraft, triggerButtons) {
    hideAlert();

    if (!forceDraft && !validate()) {
      showAlert("Please fix the highlighted fields before continuing.");
      return;
    }

    if (!fields.title.value.trim() || !fields.employmentType.value || !fields.jobCategory.value ||
        !fields.experienceLevel.value || !fields.location.value.trim() || !fields.applicationDeadline.value) {
      // Even a draft needs the bare minimum to satisfy the backend's non-nullable fields.
      showAlert("Even a draft needs a title, employment type, department, experience level, location, and deadline.");
      return;
    }

    if (!companyId) {
      showAlert("Couldn't determine your company. Please refresh and try again.");
      return;
    }

    const { status, scheduledPublishAt } = resolveStatus(forceDraft);
    const workplaceType = document.querySelector('input[name="workplace-type"]:checked')?.value || "Onsite";

    const payload = {
      companyId,
      recruiterProfileId,
      jobCategoryId: fields.jobCategory.value,
      title: fields.title.value.trim(),
      description: fields.description.value.trim(),
      requirement: fields.requirement.value.trim(),
      employmentType: fields.employmentType.value,
      workPlaceType: workplaceType,
      experienceLevel: fields.experienceLevel.value,
      minSalary: Number(fields.minSalary.value) || 0,
      maxSalary: Number(fields.maxSalary.value) || 0,
      currency: fields.currency.value,
      location: fields.location.value.trim(),
      applicationDeadline: new Date(fields.applicationDeadline.value).toISOString(),
      status,
      scheduledPublishAt,
      createdBy: userId || "unknown",
    };

    triggerButtons.forEach((btn) => (btn.disabled = true));

    try {
      const response = await fetch(API_ROUTES.createJob, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't create the job. Please try again.");
      }

      const newJobId = result.data;

      if (selectedSkills.length > 0) {
        await Promise.all(selectedSkills.map((s) =>
          fetch(API_ROUTES.addJobSkill, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ jobId: newJobId, recruiterProfileId, skillId: s.id, createdBy: userId || "unknown" }),
          }).catch((err) => console.error("Failed to attach skill:", err))
        ));
      }

      showAlert(
        status === "Draft" ? "Job saved as draft." : status === "Scheduled" ? "Job scheduled successfully." : "Job published successfully.",
        true
      );

      setTimeout(() => {
        window.location.href = "jobs.html";
      }, 900);
    } catch (err) {
      console.error("Create job failed:", err);
      showAlert(err.message);
    } finally {
      triggerButtons.forEach((btn) => (btn.disabled = false));
    }
  }

  const draftButtons = [document.getElementById("btn-save-draft"), document.getElementById("btn-save-draft-bottom")];
  const publishButtons = [document.getElementById("btn-publish"), document.getElementById("btn-publish-bottom")];

  draftButtons.forEach((btn) => btn.addEventListener("click", () => submitJob(true, draftButtons)));
  publishButtons.forEach((btn) => btn.addEventListener("click", () => submitJob(false, publishButtons)));

  updatePreview();
});