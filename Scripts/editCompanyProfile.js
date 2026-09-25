document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const alertBox = document.getElementById("form-alert");
  const editLayout = document.getElementById("edit-layout");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const companyId = localStorage.getItem("pc_company_id");

  let currentCompany = null;

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function hideAlert() {
    alertBox.hidden = true;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function initials(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  function stripProtocol(url) {
    if (!url) return "";
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function setBoxImage(node, url, seed) {
    node.innerHTML = url
      ? `<img src="${url}" alt="" />`
      : `<span>${escapeHtml(initials(seed))}</span>`;
  }

  if (!token || !companyId) {
    loadingState.hidden = true;
    showAlert("No connected company found. Create or join a company first.");
    return;
  }

  // ---------------- Element refs ----------------

  const nameInput = document.getElementById("edit-company-name");
  const industrySelect = document.getElementById("edit-industry");
  const sizeSelect = document.getElementById("edit-company-size");
  const websiteInput = document.getElementById("edit-website");
  const locationInput = document.getElementById("edit-location");
  const foundedInput = document.getElementById("edit-founded");
  const companyTypeSelect = document.getElementById("edit-company-type");
  const emailInput = document.getElementById("edit-email");
  const phoneInput = document.getElementById("edit-phone");
  const linkedinInput = document.getElementById("edit-linkedin");
  const twitterInput = document.getElementById("edit-twitter");
  const facebookInput = document.getElementById("edit-facebook");

  const logoPreview = document.getElementById("logo-preview");
  const logoUploadBtn = document.getElementById("logo-upload-btn");
  const logoUploadInput = document.getElementById("logo-upload-input");

  const coverPreview = document.getElementById("cover-preview");
  const coverUploadBtn = document.getElementById("cover-upload-btn");
  const coverUploadInput = document.getElementById("cover-upload-input");

  const aboutEditor = document.getElementById("about-editor"); // plain <textarea> — Description is a plain string field, not HTML
  const aboutCharCount = document.getElementById("about-char-count");

  const previewCover = document.getElementById("preview-cover");
  const previewLogo = document.getElementById("preview-logo");
  const previewName = document.getElementById("preview-name");
  const previewVerified = document.getElementById("preview-verified");
  const previewMeta = document.getElementById("preview-meta");
  const previewContact = document.getElementById("preview-contact");
  const previewBio = document.getElementById("preview-bio");

  // ---------------- Populate + live preview ----------------

  function populateForm(c) {
    nameInput.value = c.name || "";
    industrySelect.value = c.industry || "";
    sizeSelect.value = c.companySize || "";
    websiteInput.value = c.website || "";
    foundedInput.value = c.foundedYear || "";
    companyTypeSelect.value = c.companyType || "";
    emailInput.value = c.email || "";
    phoneInput.value = c.phoneNumber || "";
    linkedinInput.value = c.linkedInUrl || "";
    twitterInput.value = c.twitterUrl || "";
    facebookInput.value = c.facebookUrl || "";

    // Locations comes back as a list ({ city, address, isHeadquarters }).
    // The form only exposes a single "Location" field, so we surface the
    // headquarters entry (or the first one) here and re-wrap it as a
    // single-item list on save. A real multi-office editor would need
    // its own UI — this keeps today's single-field design working.
    const locations = c.locations || [];
    const hq = locations.find((l) => l.isHeadquarters) || locations[0];
    locationInput.value = hq ? hq.city : "";

    setBoxImage(logoPreview, c.logoUrl, c.name);
    coverPreview.innerHTML = c.coverImageUrl
      ? `<img src="${c.coverImageUrl}" alt="" />`
      : `<i class="ti ti-photo" aria-hidden="true"></i>`;

    aboutEditor.value = c.description || "";
    updateCharCount();

    previewVerified.hidden = !c.isVerified;

    updateLivePreview();
  }

  function updateCharCount() {
    aboutCharCount.textContent = aboutEditor.value.length;
  }

  function updateLivePreview() {
    previewName.textContent = nameInput.value.trim() || "Your Company";

    const metaParts = [industrySelect.value, sizeSelect.value].filter(Boolean);
    previewMeta.textContent = metaParts.join(" · ") || "—";

    const contactItems = [
      locationInput.value ? { icon: "ti-map-pin", value: locationInput.value } : null,
      websiteInput.value ? { icon: "ti-link", value: stripProtocol(websiteInput.value) } : null,
      foundedInput.value ? { icon: "ti-calendar", value: `Founded ${foundedInput.value}` } : null,
    ].filter(Boolean);

    previewContact.innerHTML = contactItems
      .map((c) => `<span><i class="ti ${c.icon}" aria-hidden="true"></i> ${escapeHtml(c.value)}</span>`)
      .join("");

    const bioText = aboutEditor.value.trim();
    previewBio.textContent = bioText || "No company description added yet.";

    setBoxImage(previewLogo, currentCompany && currentCompany.logoUrl, nameInput.value);

    if (currentCompany && currentCompany.coverImageUrl) {
      previewCover.style.backgroundImage = `url('${currentCompany.coverImageUrl}')`;
      previewCover.style.backgroundSize = "cover";
      previewCover.style.backgroundPosition = "center";
    }
  }

  [nameInput, industrySelect, sizeSelect, websiteInput, locationInput, foundedInput].forEach((el) => {
    el.addEventListener("input", updateLivePreview);
    el.addEventListener("change", updateLivePreview);
  });

  aboutEditor.addEventListener("input", () => {
    updateCharCount();
    updateLivePreview();
  });

  // ---------------- Logo / cover upload ----------------
  // Matches RecruiterController: PUT /Recruiter/logo and
  // PUT /Recruiter/cover-image, both [Consumes("multipart/form-data")]
  // binding a single IFormFile parameter named "file". The company is
  // resolved server-side from the JWT, so no id is sent here.

  async function uploadCompanyImage(file, routeKey, maxSizeBytes, onSuccess) {
    if (!file) return;

    if (file.size > maxSizeBytes) {
      alert(`That image is too large. Please choose one under ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(API_ROUTES[routeKey], {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        console.error(`${routeKey} failed:`, response.status, result);
        alert(result.message || "Couldn't upload the image. Please try again.");
        return;
      }

      onSuccess(result.data);
    } catch (err) {
      console.error(`${routeKey} threw an error:`, err);
      alert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  logoUploadBtn.addEventListener("click", () => logoUploadInput.click());
  logoUploadInput.addEventListener("change", async () => {
    const file = logoUploadInput.files[0];
    logoPreview.classList.add("is-uploading");
    await uploadCompanyImage(file, "uploadCompanyLogo", 5 * 1024 * 1024, (newUrl) => {
      if (currentCompany) currentCompany.logoUrl = newUrl;
      setBoxImage(logoPreview, newUrl, nameInput.value);
      updateLivePreview();
    });
    logoPreview.classList.remove("is-uploading");
    logoUploadInput.value = "";
  });

  coverUploadBtn.addEventListener("click", () => coverUploadInput.click());
  coverUploadInput.addEventListener("change", async () => {
    const file = coverUploadInput.files[0];
    coverPreview.classList.add("is-uploading");
    await uploadCompanyImage(file, "uploadCompanyCoverImage", 10 * 1024 * 1024, (newUrl) => {
      if (currentCompany) currentCompany.coverImageUrl = newUrl;
      coverPreview.innerHTML = `<img src="${newUrl}" alt="" />`;
      updateLivePreview();
    });
    coverPreview.classList.remove("is-uploading");
    coverUploadInput.value = "";
  });

  // ---------------- Cancel / Save ----------------

  document.getElementById("edit-cancel-btn").addEventListener("click", () => {
    window.location.href = "company-profile.html";
  });

  const saveBtn = document.getElementById("edit-save-btn");

  saveBtn.addEventListener("click", async () => {
    hideAlert();

    const name = nameInput.value.trim();
    const industry = industrySelect.value;
    const description = aboutEditor.value.trim();
    const website = websiteInput.value.trim();
    const email = emailInput.value.trim();
    const phoneNumber = phoneInput.value.trim();
    const companySize = sizeSelect.value;
    const companyType = companyTypeSelect.value;
    const foundedYear = foundedInput.value ? parseInt(foundedInput.value, 10) : null;
    const locationCity = locationInput.value.trim();

    if (!name || !industry || !description || !email || !phoneNumber || !companySize || !companyType) {
      showAlert("Please fill in all required fields before saving.");
      return;
    }

    // Matches UpdateCompanyProfileCommand exactly — RequestingUserId is
    // set server-side from the JWT, so it's omitted here.
    const payload = {
      name,
      industry,
      description,
      website: website || null,
      email,
      phoneNumber,
      companySize,
      companyType,
      foundedYear,
      linkedInUrl: linkedinInput.value.trim() || null,
      twitterUrl: twitterInput.value.trim() || null,
      facebookUrl: facebookInput.value.trim() || null,
      instagramUrl: null,
      locations: locationCity
        ? [{ city: locationCity, address: null, isHeadquarters: true }]
        : [],
    };

    saveBtn.disabled = true;
    saveBtn.classList.add("is-saving");

    try {
      const response = await fetch(API_ROUTES.updateCompanyProfile, {
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

      window.location.href = "company-profile.html";
    } catch (err) {
      console.error("Save company profile threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove("is-saving");
    }
  });

  // ---------------- Load ----------------

  try {
    const response = await fetch(`${API_ROUTES.companyProfile}/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.data) {
      loadingState.hidden = true;
      showAlert(result.message || "Couldn't load your company profile.");
      return;
    }

    currentCompany = result.data;
    populateForm(currentCompany);

    loadingState.hidden = true;
    editLayout.hidden = false;
  } catch (err) {
    loadingState.hidden = true;
    showAlert("Couldn't reach the server. Check your connection and try again.");
  }
});