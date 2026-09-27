document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("create-company-form");
  const submitBtn = document.getElementById("submit-btn");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  let currentStep = 1;
  let selectedLogoFile = null;
  let locationCount = 0;

  // ---------------- Helpers ----------------

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.querySelector(`[data-error-for="${fieldId}"]`);
    if (input) input.classList.toggle("is-invalid", Boolean(message));
    if (errorEl) errorEl.textContent = message || "";
  }

  function clearErrors(fieldIds) {
    fieldIds.forEach((id) => setFieldError(id, ""));
  }

  function goToStep(step) {
    currentStep = step;

    document.querySelectorAll(".wizard-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === String(step));
    });

    document.querySelectorAll(".wizard-step").forEach((el) => {
      const stepNum = Number(el.dataset.step);
      el.classList.toggle("is-active", stepNum === step);
      el.classList.toggle("is-complete", stepNum < step);
    });

    if (step === 3) populateAdminPreview();
    if (step === 4) populateReview();
  }

  // ---------------- Step 1 validation ----------------

  function validateStep1() {
    clearErrors(["companyName", "industry", "companySize", "companyType", "companyEmail", "phoneNumber"]);
    let valid = true;

    const companyName = document.getElementById("companyName").value.trim();
    if (!companyName) {
      setFieldError("companyName", "Company name is required.");
      valid = false;
    }

    const industry = document.getElementById("industry").value;
    if (!industry) {
      setFieldError("industry", "Please select an industry.");
      valid = false;
    }

    const companySize = document.getElementById("companySize").value;
    if (!companySize) {
      setFieldError("companySize", "Please select a company size.");
      valid = false;
    }

    const companyType = document.getElementById("companyType").value;
    if (!companyType) {
      setFieldError("companyType", "Please select a company type.");
      valid = false;
    }

    const companyEmail = document.getElementById("companyEmail").value.trim();
    if (!companyEmail) {
      setFieldError("companyEmail", "Company email is required.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      setFieldError("companyEmail", "Enter a valid email address.");
      valid = false;
    }

    const phoneNumber = document.getElementById("phoneNumber").value.trim();
    if (!phoneNumber) {
      setFieldError("phoneNumber", "Company phone is required.");
      valid = false;
    }

    return valid;
  }

  // ---------------- Step 2 validation ----------------

  function validateStep2() {
    clearErrors(["description"]);
    let valid = true;

    const description = document.getElementById("description").value.trim();
    if (!description) {
      setFieldError("description", "Company description is required.");
      valid = false;
    }

    return valid;
  }

  // ---------------- Next / Back buttons ----------------

  document.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentStep === 1 && !validateStep1()) return;
      if (currentStep === 2 && !validateStep2()) return;

      goToStep(Number(btn.dataset.next));
    });
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)));
  });

  // ---------------- Logo upload ----------------

  const dropzone = document.getElementById("logo-dropzone");
  const logoInput = document.getElementById("companyLogo");

  dropzone.addEventListener("click", () => logoInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });

  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    if (e.dataTransfer.files.length) {
      logoInput.files = e.dataTransfer.files;
      handleLogoSelected(e.dataTransfer.files[0]);
    }
  });

  logoInput.addEventListener("change", () => {
    if (logoInput.files.length) {
      handleLogoSelected(logoInput.files[0]);
    }
  });

  function handleLogoSelected(file) {
    setFieldError("companyLogo", "");

    if (file.size > 2 * 1024 * 1024) {
      setFieldError("companyLogo", "File is too large. Max size is 2MB.");
      return;
    }

    selectedLogoFile = file;

    const reader = new FileReader();
    reader.onload = () => {
      dropzone.innerHTML = `
        <img src="${reader.result}" alt="Logo preview" class="logo-dropzone__preview" />
        <span class="logo-dropzone__label">${file.name}</span>
        <span class="logo-dropzone__hint">Click to change</span>
      `;
    };
    reader.readAsDataURL(file);
  }

  // Uploads the selected logo file to the backend as multipart/form-data.
  // Called only after the company has been created, since the logo
  // endpoint attaches to the caller's own company record.
  async function uploadSelectedLogo() {
    if (!selectedLogoFile) return;

    const formData = new FormData();
    formData.append("file", selectedLogoFile);

    try {
      await fetch(API_ROUTES.uploadCompanyLogo, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
    } catch (err) {
      // Non-blocking — company already exists; logo can be added later
      // from the Company Profile edit screen if this call fails.
    }
  }

  // ---------------- Locations (Additional Info step) ----------------

  const locationsList = document.getElementById("locations-list");
  const addLocationBtn = document.getElementById("add-location-btn");

  function addLocationRow(city = "", address = "", isHq = locationCount === 0) {
    locationCount++;
    const rowId = `location-${locationCount}`;

    const row = document.createElement("div");
    row.className = "location-row";
    row.dataset.rowId = rowId;
    row.innerHTML = `
      <input type="text" placeholder="City, State/Country" class="location-city" value="${city}" />
      <input type="text" placeholder="Street address (optional)" class="location-address" value="${address}" />
      <label class="hq-toggle">
        <input type="radio" name="hq-location" class="location-hq" ${isHq ? "checked" : ""} />
        HQ
      </label>
      <button type="button" class="remove-location" aria-label="Remove location">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    `;

    row.querySelector(".remove-location").addEventListener("click", () => row.remove());

    locationsList.appendChild(row);
  }

  addLocationBtn.addEventListener("click", () => addLocationRow());

  // Seed with one location row by default
  addLocationRow();

  function collectLocations() {
    const rows = locationsList.querySelectorAll(".location-row");
    const locations = [];

    rows.forEach((row) => {
      const city = row.querySelector(".location-city").value.trim();
      if (!city) return;

      locations.push({
        city,
        address: row.querySelector(".location-address").value.trim() || null,
        isHeadquarters: row.querySelector(".location-hq").checked,
      });
    });

    return locations;
  }

  // ---------------- Step 3: Admin preview ----------------

  function populateAdminPreview() {
    const username = localStorage.getItem("pc_username") || "You";
    document.getElementById("admin-name").textContent = username;
    document.getElementById("admin-avatar").textContent = username.charAt(0).toUpperCase();
  }

  // ---------------- Step 4: Review ----------------

  function populateReview() {
    const summary = document.getElementById("review-summary");
    const locations = collectLocations();

    const rows = [
      ["Company Name", document.getElementById("companyName").value],
      ["Industry", document.getElementById("industry").value],
      ["Company Size", document.getElementById("companySize").value],
      ["Company Type", document.getElementById("companyType").value],
      ["Company Email", document.getElementById("companyEmail").value],
      ["Phone", document.getElementById("phoneNumber").value],
      ["Website", document.getElementById("website").value || "—"],
      ["Founded Year", document.getElementById("foundedYear").value || "—"],
      ["Description", document.getElementById("description").value],
      ["Locations", locations.length ? locations.map((l) => l.city).join(", ") : "—"],
    ];

    summary.innerHTML = rows
      .map(
        ([label, value]) => `
        <div class="review-row">
          <span class="review-row__label">${label}</span>
          <span class="review-row__value">${value}</span>
        </div>`
      )
      .join("");
  }

  // ---------------- Submit ----------------

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? `<span class="spinner"></span><span>Creating company...</span>`
      : `<span class="btn-label">Create Company</span>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateStep1() || !validateStep2()) {
      showToast("Please complete all required fields before submitting.", "error");
      return;
    }

    const payload = {
      name: document.getElementById("companyName").value.trim(),
      industry: document.getElementById("industry").value,
      description: document.getElementById("description").value.trim(),
      website: document.getElementById("website").value.trim() || null,
      email: document.getElementById("companyEmail").value.trim(),
      phoneNumber: document.getElementById("phoneNumber").value.trim(),
      companySize: document.getElementById("companySize").value,
      companyType: document.getElementById("companyType").value,
      foundedYear: document.getElementById("foundedYear").value
        ? Number(document.getElementById("foundedYear").value)
        : null,
    };

    setLoading(true);

    try {
      const response = await fetch(API_ROUTES.createCompany, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      console.log(result, response);

      if (!response.ok || !result.status) {
        showToast(result.message || "Couldn't create your company. Please check your details and try again.", "error");
        return;
      }

      const companyId = result.data;
      localStorage.setItem("pc_company_id", companyId);

      // Upload the logo now that the company exists (endpoint attaches
      // to the caller's own company record).
      await uploadSelectedLogo();

      // Persist the extended profile fields (locations, socials) via the
      // update-profile endpoint, since CreateCompanyCommand only covers
      // the core Step 1 fields.
      const locations = collectLocations();
      const linkedInUrl = document.getElementById("linkedInUrl").value.trim() || null;
      const twitterUrl = document.getElementById("twitterUrl").value.trim() || null;
      const facebookUrl = document.getElementById("facebookUrl").value.trim() || null;
      const instagramUrl = document.getElementById("instagramUrl").value.trim() || null;

      if (locations.length || linkedInUrl || twitterUrl || facebookUrl || instagramUrl) {
        await fetch(API_ROUTES.updateCompanyProfile, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...payload,
            linkedInUrl,
            twitterUrl,
            facebookUrl,
            instagramUrl,
            locations,
          }),
        }).catch(() => {
          // Non-blocking — company already created; profile extras can be
          // edited later from the Company Profile page if this call fails.
        });
      }

      window.location.href = "company-management.html";
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    } finally {
      setLoading(false);
    }
  });
});