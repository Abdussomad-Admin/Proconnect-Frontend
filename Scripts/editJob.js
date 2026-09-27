document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  if (!token || !recruiterProfileId) {
    window.location.href = "login.html";
    return;
  }

  const jobId = new URLSearchParams(window.location.search).get("id");
  if (!jobId) {
    window.location.href = "jobs.html";
    return;
  }

  const loadingEl = document.getElementById("job-loading");
  const contentEl = document.getElementById("edit-content");

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
  };

  let currentStatus = null;

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Thin wrapper kept so every existing showAlert(message, isSuccess) call
  // site below didn't need touching — now routes to the global toast
  // (Scripts/toast.js) instead of the old #form-alert div.
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide. Kept so existing hideAlert() call sites don't
  // need to be touched.
  function hideAlert() {}

  function clearFieldError(id) {
    const err = document.getElementById(`err-${id}`);
    if (err) err.textContent = "";
  }

  function setFieldError(id, message) {
    const err = document.getElementById(`err-${id}`);
    if (err) err.textContent = message;
  }

  function toDateInputValue(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toISOString().slice(0, 10);
  }

  function statusBadgeClass(status) {
    const map = {
      Active: "jm-status-badge--active",
      Draft: "jm-status-badge--draft",
      Scheduled: "jm-status-badge--scheduled",
      Closed: "jm-status-badge--closed",
    };
    return map[status] || "jm-status-badge--draft";
  }

  // ---------------- Load job categories ----------------

  async function loadCategories() {
    try {
      const response = await fetch(API_ROUTES.getJobCategories, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        result.data.forEach((cat) => {
          const opt = document.createElement("option");
          opt.value = cat.id;
          opt.textContent = cat.name;
          fields.jobCategory.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Job categories fetch threw an error:", err);
    }
  }

  // ---------------- Skills picker (live add/remove) ----------------

  let allSkills = [];
  let currentJobSkills = []; // [{ skillId, skillName }]

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

  async function loadJobSkills() {
    try {
      const response = await fetch(`${API_ROUTES.getJobSkills}/${jobId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        currentJobSkills = result.data.map((s) => ({ skillId: s.skillId, skillName: s.skillName }));
        renderSkillChips();
      }
    } catch (err) {
      console.error("Job skills fetch threw an error:", err);
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
      s.name.toLowerCase().includes(term) && !currentJobSkills.some((sel) => sel.skillId === s.id)
    ).slice(0, 8);

    skillsDropdown.innerHTML = matches.length > 0
      ? matches.map((s) => `<div class="cj-skills-dropdown__item" data-skill-id="${s.id}" data-skill-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join("")
      : `<div class="cj-skills-dropdown__empty">No matching skills.</div>`;
    skillsDropdown.hidden = false;

    skillsDropdown.querySelectorAll("[data-skill-id]").forEach((item) => {
      item.addEventListener("click", () => addSkillToJob(item.dataset.skillId, item.dataset.skillName));
    });
  });

  document.addEventListener("click", (e) => {
    if (!skillsDropdown.contains(e.target) && e.target !== skillsSearchInput) {
      skillsDropdown.hidden = true;
    }
  });

  async function addSkillToJob(skillId, skillName) {
    skillsSearchInput.value = "";
    skillsDropdown.hidden = true;

    try {
      const response = await fetch(API_ROUTES.addJobSkill, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, recruiterProfileId, skillId, createdBy: userId || "unknown" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't add this skill.");
      }
      currentJobSkills.push({ skillId, skillName });
      renderSkillChips();
    } catch (err) {
      console.error("Add skill failed:", err);
      showAlert(err.message);
    }
  }

  async function removeSkillFromJob(skillId) {
    try {
      const response = await fetch(API_ROUTES.removeJobSkill, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, recruiterProfileId, skillId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't remove this skill.");
      }
      currentJobSkills = currentJobSkills.filter((s) => s.skillId !== skillId);
      renderSkillChips();
    } catch (err) {
      console.error("Remove skill failed:", err);
      showAlert(err.message);
    }
  }

  function renderSkillChips() {
    document.getElementById("skills-chips").innerHTML = currentJobSkills.map((s) => `
      <span class="cj-skill-chip">${escapeHtml(s.skillName)} <button type="button" data-remove-skill="${s.skillId}"><i class="ti ti-x" aria-hidden="true"></i></button></span>
    `).join("");

    document.querySelectorAll("[data-remove-skill]").forEach((btn) => {
      btn.addEventListener("click", () => removeSkillFromJob(btn.dataset.removeSkill));
    });
  }

  // ---------------- Load job ----------------

  async function loadJob() {
    try {
      const response = await fetch(`${API_ROUTES.getJob}/${jobId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      loadingEl.hidden = true;

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load this job.");
        return;
      }

      const job = result.data;

      if (job.recruiterProfileId !== recruiterProfileId) {
        showAlert("You don't have permission to edit this job.");
        return;
      }

      fields.title.value = job.title;
      fields.employmentType.value = job.employmentType;
      fields.jobCategory.value = job.jobCategoryId;
      fields.experienceLevel.value = job.experienceLevel;
      fields.location.value = job.location;
      fields.minSalary.value = job.minSalary || "";
      fields.maxSalary.value = job.maxSalary || "";
      fields.currency.value = job.currency || "USD";
      fields.applicationDeadline.value = toDateInputValue(job.applicationDeadline);
      fields.description.value = job.description;
      fields.requirement.value = job.requirement;

      document.getElementById("description-count").textContent = job.description.length;
      document.getElementById("requirement-count").textContent = job.requirement.length;

      const workplaceRadio = document.querySelector(`input[name="workplace-type"][value="${job.workPlaceType}"]`);
      if (workplaceRadio) workplaceRadio.checked = true;

      document.getElementById("preview-company").textContent = job.companyName || "Company Name";

      currentStatus = job.status;

      const statusPill = document.getElementById("status-pill");
      statusPill.textContent = job.status;
      statusPill.className = `jm-status-badge ${statusBadgeClass(job.status)}`;

      document.getElementById("status-posted-on").textContent =
        new Date(job.dateCreated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      const showPublish = job.status === "Draft" || job.status === "Scheduled";
      const showClose = job.status === "Active" || job.status === "Scheduled";

      document.getElementById("btn-publish").hidden = !showPublish;
      document.getElementById("btn-publish-bottom").hidden = !showPublish;
      document.getElementById("btn-close-job").hidden = !showClose;
      document.getElementById("btn-close-job-sidebar").hidden = !showClose;

      updatePreview();
      contentEl.hidden = false;

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Job fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  // ---------------- Character counters ----------------

  function wireCharCount(textarea, counterId) {
    const counter = document.getElementById(counterId);
    textarea.addEventListener("input", () => {
      counter.textContent = textarea.value.length;
    });
  }
  wireCharCount(fields.description, "description-count");
  wireCharCount(fields.requirement, "requirement-count");

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

    if (!fields.title.value.trim()) { setFieldError("job-title", "Job title is required."); valid = false; }
    if (!fields.employmentType.value) { setFieldError("employment-type", "Select an employment type."); valid = false; }
    if (!fields.jobCategory.value) { setFieldError("job-category", "Select a department."); valid = false; }
    if (!fields.experienceLevel.value) { setFieldError("experience-level", "Select an experience level."); valid = false; }
    if (!fields.location.value.trim()) { setFieldError("job-location", "Location is required."); valid = false; }
    if (!fields.applicationDeadline.value) { setFieldError("application-deadline", "Application deadline is required."); valid = false; }
    if (!fields.description.value.trim()) { setFieldError("job-description", "Job description is required."); valid = false; }
    if (!fields.requirement.value.trim()) { setFieldError("job-requirement", "Requirements are required."); valid = false; }
    if (fields.minSalary.value && fields.maxSalary.value &&
        Number(fields.minSalary.value) > Number(fields.maxSalary.value)) {
      showAlert("Minimum salary cannot exceed maximum salary.");
      valid = false;
    }
    return valid;
  }

  // ---------------- Save (+ optional Publish) ----------------

  async function saveJob(alsoPublish, triggerButtons) {
    hideAlert();
    if (!validate()) {
      showAlert("Please fix the highlighted fields before continuing.");
      return;
    }

    const workplaceType = document.querySelector('input[name="workplace-type"]:checked')?.value || "Onsite";

    const payload = {
      jobId,
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
    };

    triggerButtons.forEach((btn) => (btn.disabled = true));

    try {
      const response = await fetch(API_ROUTES.updateJob, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't save changes.");
      }

      if (alsoPublish) {
        const publishResponse = await fetch(API_ROUTES.publishJob, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jobId, recruiterProfileId }),
        });
        const publishResult = await publishResponse.json().catch(() => ({}));

        if (!publishResponse.ok || publishResult.status === false) {
          throw new Error(publishResult.message || "Changes saved, but publishing failed.");
        }

        showAlert("Job saved and published.", true);
      } else {
        showAlert("Changes saved.", true);
      }

      setTimeout(() => { window.location.href = "jobs.html"; }, 900);

    } catch (err) {
      console.error("Save job failed:", err);
      showAlert(err.message);
    } finally {
      triggerButtons.forEach((btn) => (btn.disabled = false));
    }
  }

  const saveButtons = [document.getElementById("btn-save"), document.getElementById("btn-save-bottom")];
  const publishButtons = [document.getElementById("btn-publish"), document.getElementById("btn-publish-bottom")];

  saveButtons.forEach((btn) => btn.addEventListener("click", () => saveJob(false, saveButtons)));
  publishButtons.forEach((btn) => btn.addEventListener("click", () => saveJob(true, publishButtons)));

  // ---------------- Close Job ----------------

  const overlay = document.getElementById("confirm-overlay");
  const confirmOkBtn = document.getElementById("confirm-ok");
  const confirmCancelBtn = document.getElementById("confirm-cancel");

  [document.getElementById("btn-close-job"), document.getElementById("btn-close-job-sidebar")].forEach((btn) =>
    btn.addEventListener("click", () => { overlay.hidden = false; })
  );

  confirmCancelBtn.addEventListener("click", () => { overlay.hidden = true; });

  confirmOkBtn.addEventListener("click", async () => {
    confirmOkBtn.disabled = true;
    try {
      const response = await fetch(API_ROUTES.closeJob, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, recruiterProfileId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't close the job.");
      }

      overlay.hidden = true;
      showAlert("Job closed.", true);
      setTimeout(() => { window.location.href = "jobs.html"; }, 900);

    } catch (err) {
      console.error("Close job failed:", err);
      overlay.hidden = true;
      showAlert(err.message);
    } finally {
      confirmOkBtn.disabled = false;
    }
  });

  // ---------------- Init ----------------

  await loadCategories();
  await loadSkillsList();
  await loadJobSkills();
  await loadJob();
});