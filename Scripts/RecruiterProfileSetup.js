document.addEventListener("DOMContentLoaded", () => {
  const steps = Array.from(document.querySelectorAll(".form-step"));
  const progressItems = Array.from(document.querySelectorAll(".step-progress__item"));

  const btnSkipCompany = document.getElementById("btn-skip-company");
  const btnSaveCompany = document.getElementById("btn-save-company");
  const saveCompanyLabel = document.getElementById("save-company-label");
  const btnFinishRecruiter = document.getElementById("btn-finish-recruiter");
  const finishRecruiterLabel = document.getElementById("finish-recruiter-label");
  const btnBackToCompany = document.querySelector('[data-action="back-to-company"]');

  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || sessionStorage.getItem("pc_pending_email");
  const userId = localStorage.getItem("pc_user_id");

  if (!userId) {
    window.location.href = "register.html";
    return;
  }

  let companyId = null;
  let currentStep = 1;

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

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

    hideAlert();
  }

  // ---------------- "Other" dropdown helper ----------------

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

  setupOtherSelect("company-industry", "company-industry-other");
  setupOtherSelect("recruiter-department", "recruiter-department-other");

  // ---------------- STEP 1: Company (optional) ----------------

  function validateCompanyUrls() {
    let valid = true;

    ["company-website", "company-logo"].forEach((id) => {
      clearFieldError(id);
      const value = document.getElementById(id).value.trim();
      if (value && !isValidUrl(value)) {
        setFieldError(id, "Enter a valid URL (include https://).");
        valid = false;
      }
    });

    clearFieldError("company-email");
    const emailValue = document.getElementById("company-email").value.trim();
    if (emailValue && !isValidEmail(emailValue)) {
      setFieldError("company-email", "Enter a valid email address.");
      valid = false;
    }

    return valid;
  }

  function companyFormIsEmpty() {
    const name = document.getElementById("company-name").value.trim();
    const industry = getSelectOrOtherValue("company-industry", "company-industry-other");
    const email = document.getElementById("company-email").value.trim();
    const description = document.getElementById("company-description").value.trim();
    const website = document.getElementById("company-website").value.trim();
    const phone = document.getElementById("company-phone").value.trim();
    const logo = document.getElementById("company-logo").value.trim();
    return !name && !industry && !email && !description && !website && !phone && !logo;
  }

  async function createCompany() {
    hideAlert();

    if (!validateCompanyUrls()) return false;

    const name = document.getElementById("company-name").value.trim();

    if (!name) {
      setFieldError("company-name", "Company name is required to save company details.");
      showAlert("Enter a company name, or use Skip this step if you'd rather add it later.");
      return false;
    }

    const payload = {
      name,
      industry: getSelectOrOtherValue("company-industry", "company-industry-other") || null,
      description: document.getElementById("company-description").value.trim() || null,
      website: document.getElementById("company-website").value.trim() || null,
      email: document.getElementById("company-email").value.trim() || null,
      phoneNumber: document.getElementById("company-phone").value.trim() || null,
      logo: document.getElementById("company-logo").value.trim() || null,
    };

    btnSaveCompany.disabled = true;
    btnSkipCompany.disabled = true;
    saveCompanyLabel.textContent = "Saving...";

    try {
      const response = await fetch(API_ROUTES.createCompany, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't save your company. Please try again.");
      }

      companyId = result.data;
      return true;
    } catch (err) {
      showAlert(err.message);
      return false;
    } finally {
      btnSaveCompany.disabled = false;
      btnSkipCompany.disabled = false;
      saveCompanyLabel.textContent = "Save & continue";
    }
  }

  btnSaveCompany.addEventListener("click", async () => {
    if (companyFormIsEmpty()) {
      goToStep(2);
      return;
    }

    const created = await createCompany();
    if (created) goToStep(2);
  });

  btnSkipCompany.addEventListener("click", () => {
    companyId = null;
    goToStep(2);
  });

  btnBackToCompany.addEventListener("click", () => {
    goToStep(1);
  });

  // ---------------- STEP 2: Recruiter Details (required) ----------------

  function validateRecruiterDetails() {
    let valid = true;

    clearFieldError("recruiter-job-title");
    const jobTitle = document.getElementById("recruiter-job-title").value.trim();
    if (!jobTitle) {
      setFieldError("recruiter-job-title", "Job title is required.");
      valid = false;
    }

    clearFieldError("recruiter-department");
    const department = getSelectOrOtherValue("recruiter-department", "recruiter-department-other");
    if (!department) {
      setFieldError("recruiter-department", "Department is required.");
      valid = false;
    }

    return valid;
  }

  const recruiterAdminCheckbox = document.getElementById("recruiter-admin");
  const recruiterAdminWrap = document.getElementById("recruiter-admin-wrap");

  recruiterAdminCheckbox.addEventListener("change", () => {
    recruiterAdminWrap.classList.toggle("is-checked", recruiterAdminCheckbox.checked);
  });

  btnFinishRecruiter.addEventListener("click", async () => {
    hideAlert();

    if (!validateRecruiterDetails()) return;

    const payload = {
      userId,
      companyId, // may be null if Company step was skipped
      jobTitle: document.getElementById("recruiter-job-title").value.trim(),
      department: getSelectOrOtherValue("recruiter-department", "recruiter-department-other"),
      isCompanyAdmin: recruiterAdminCheckbox.checked,
    };

    btnFinishRecruiter.disabled = true;
    btnBackToCompany.disabled = true;
    finishRecruiterLabel.textContent = "Finishing...";

    try {
      const response = await fetch(API_ROUTES.createRecruiterProfile, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't finish setting up your recruiter account.");
      }

      window.location.href = `profile-overview.html?email=${encodeURIComponent(email || "")}`;
    } catch (err) {
      showAlert(err.message);
      btnFinishRecruiter.disabled = false;
      btnBackToCompany.disabled = false;
      finishRecruiterLabel.textContent = "Finish setup";
    }
  });
});