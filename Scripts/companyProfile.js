document.addEventListener("DOMContentLoaded", () => {
  const loadingState = document.getElementById("loading-state");
  const alertBox = document.getElementById("form-alert");
  const profileLayout = document.getElementById("profile-layout");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  // companyId comes from the URL (?id=...) when viewing someone else's
  // profile. When absent, we resolve the viewer's OWN company id from the
  // backend (via the authenticated management-overview endpoint, which
  // reads CompanyId off the JWT) rather than trusting a possibly-stale
  // localStorage value.
  const params = new URLSearchParams(window.location.search);
  let companyId = params.get("id");

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.hidden = false;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  if (!companyId && !token) {
    loadingState.hidden = true;
    showAlert("No company selected.");
    return;
  }

  // ---------------- Tabs ----------------

  document.querySelectorAll(".profile-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".profile-tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));

      tab.classList.add("is-active");
      document
        .querySelector(`[data-tab-panel="${tab.dataset.tab}"]`)
        .classList.add("is-active");
    });
  });

  // ---------------- Render helpers ----------------

  function renderProfile(company) {
    document.getElementById("company-name").textContent = company.name;
    document.getElementById("company-industry").textContent = company.industry;
    document.getElementById("company-description").textContent = company.description;

    const logoEl = document.getElementById("company-logo");
    logoEl.innerHTML = company.logoUrl
      ? `<img src="${company.logoUrl}" alt="${escapeHtml(company.name)} logo" />`
      : company.name.charAt(0).toUpperCase();

    // Cover image banner — falls back to the existing gradient/color
    // background from company-profile.css when none has been uploaded.
    const bannerEl = document.querySelector(".cover-card__banner");
    if (bannerEl) {
      if (company.coverImageUrl) {
        bannerEl.style.backgroundImage = `url('${company.coverImageUrl}')`;
        bannerEl.classList.add("has-image");
      } else {
        bannerEl.style.backgroundImage = "";
        bannerEl.classList.remove("has-image");
      }
    }

    const hqLocation = company.locations.find((l) => l.isHeadquarters) || company.locations[0];
    document.getElementById("company-headquarters").innerHTML =
      `<i class="ti ti-map-pin" aria-hidden="true"></i> ${hqLocation ? escapeHtml(hqLocation.city) : "Location not set"}`;
    document.getElementById("company-size-meta").innerHTML =
      `<i class="ti ti-users" aria-hidden="true"></i> ${escapeHtml(company.companySize)}`;
    document.getElementById("company-website-meta").innerHTML = company.website
      ? `<i class="ti ti-world" aria-hidden="true"></i> ${escapeHtml(company.website)}`
      : "";

    const badge = document.getElementById("verified-badge");
    badge.hidden = !company.isVerified;

    // About tab
    document.getElementById("about-industry").textContent = company.industry;
    document.getElementById("about-size").textContent = company.companySize;
    document.getElementById("about-founded").textContent = company.foundedYear || "—";
    document.getElementById("about-type").textContent = company.companyType;
    document.getElementById("about-headquarters").textContent = hqLocation ? hqLocation.city : "—";

    // Locations list
    const locationsDisplay = document.getElementById("locations-display");
    if (company.locations.length) {
      locationsDisplay.innerHTML = company.locations
        .map(
          (loc) => `
          <div class="location-item">
            <i class="ti ti-map-pin" aria-hidden="true"></i>
            <div>
              <span class="location-item__city">${escapeHtml(loc.city)}</span>
              ${loc.isHeadquarters ? '<span class="location-item__hq-badge">HQ</span>' : ""}
              ${loc.address ? `<div class="location-item__address">${escapeHtml(loc.address)}</div>` : ""}
            </div>
          </div>`
        )
        .join("");
    } else {
      locationsDisplay.innerHTML = `<p class="empty-hint">No office locations added yet.</p>`;
    }

    // Highlights
    const highlights = [
      { icon: "ti-users", value: company.teamMemberCount, label: "Team Members" },
      { icon: "ti-briefcase", value: company.openPositionCount, label: "Open Positions" },
      {
        icon: "ti-rocket",
        value: company.foundedYear ? `${new Date().getFullYear() - company.foundedYear}+` : "—",
        label: "Years in Business",
      },
      { icon: "ti-map-pin", value: company.locations.length, label: "Office Locations" },
    ];

    document.getElementById("highlights-grid").innerHTML = highlights
      .map(
        (h) => `
        <div class="highlight-item">
          <span class="highlight-item__icon"><i class="ti ${h.icon}" aria-hidden="true"></i></span>
          <div>
            <div class="highlight-item__value">${h.value}</div>
            <div class="highlight-item__label">${h.label}</div>
          </div>
        </div>`
      )
      .join("");

    // Sidebar
    const websiteLink = document.getElementById("sidebar-website");
    if (company.website) {
      websiteLink.href = company.website;
      websiteLink.textContent = company.website;
    } else {
      websiteLink.textContent = "Not provided";
      websiteLink.removeAttribute("href");
    }

    document.getElementById("sidebar-email").href = `mailto:${company.email}`;
    document.getElementById("sidebar-email").textContent = company.email;
    document.getElementById("sidebar-phone").textContent = company.phoneNumber;

    const socialLinks = [
      { url: company.linkedInUrl, icon: "ti-brand-linkedin" },
      { url: company.twitterUrl, icon: "ti-brand-x" },
      { url: company.facebookUrl, icon: "ti-brand-facebook" },
      { url: company.instagramUrl, icon: "ti-brand-instagram" },
    ].filter((s) => s.url);

    document.getElementById("social-links").innerHTML = socialLinks
      .map(
        (s) => `<a href="${s.url}" target="_blank" rel="noopener"><i class="ti ${s.icon}" aria-hidden="true"></i></a>`
      )
      .join("");

    // Verification card
    const verificationCard = document.getElementById("verification-card");
    const verificationTitle = document.getElementById("verification-title");
    const verificationText = document.getElementById("verification-text");

    if (company.isVerified) {
      verificationCard.classList.remove("is-unverified");
      verificationTitle.textContent = "Verified Company";
      verificationText.textContent = company.verifiedAt
        ? `This company profile is verified. Verified on ${new Date(company.verifiedAt).toLocaleDateString()}.`
        : "This company profile is verified.";
    } else {
      verificationCard.classList.add("is-unverified");
      verificationTitle.textContent = "Verification Pending";
      verificationText.textContent = "This company profile has not been verified yet.";
    }

    // Only the company's own admin can edit — hide the edit link otherwise.
    const viewerCompanyId = localStorage.getItem("pc_company_id");
    const editLink = document.getElementById("edit-profile-link");
    if (viewerCompanyId !== company.id) {
      editLink.hidden = true;
    }
  }

  async function fetchTeamPreview() {
    if (!token) return;

    try {
      const response = await fetch(`${API_ROUTES.companyTeam}?pageSize=6&usePaging=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.status) return;

      const members = result.data.items || [];
      const teamGrid = document.getElementById("team-grid");

      teamGrid.innerHTML = members
        .map(
          (m) => `
          <div class="team-member-card">
            <div class="team-member-card__avatar">
              ${
                m.profilePictureUrl
                  ? `<img src="${m.profilePictureUrl}" alt="${escapeHtml(m.fullName)}" />`
                  : escapeHtml(m.fullName.charAt(0))
              }
            </div>
            <div>
              <div class="team-member-card__name">${escapeHtml(m.fullName)}</div>
              <div class="team-member-card__role">${escapeHtml(m.jobTitle || "Recruiter")}</div>
            </div>
          </div>`
        )
        .join("");
    } catch (err) {
      // Non-blocking — team tab simply stays empty if this fails.
    }
  }

  // ---------------- Load ----------------

  async function resolveOwnCompanyId() {
    try {
      const response = await fetch(API_ROUTES.companyManagementOverview, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) return null;

      // Keep localStorage in sync now that we have the real value.
      localStorage.setItem("pc_company_id", result.data.companyId);
      return result.data.companyId;
    } catch (err) {
      return null;
    }
  }

  (async function loadProfile() {
    try {
      if (!companyId) {
        companyId = await resolveOwnCompanyId();

        if (!companyId) {
          loadingState.hidden = true;
          showAlert("You're not yet linked to a company. Create or join a company first.");
          return;
        }
      }

      const response = await fetch(`${API_ROUTES.companyProfile}/${companyId}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        loadingState.hidden = true;
        showAlert(result.message || "Couldn't load this company profile.");
        return;
      }

      renderProfile(result.data);
      await fetchTeamPreview();

      loadingState.hidden = true;
      profileLayout.hidden = false;
    } catch (err) {
      loadingState.hidden = true;
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  })();
});