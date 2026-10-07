document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const layout = document.getElementById("profile-view-layout");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const viewerUserId = localStorage.getItem("pc_user_id");


  const params = new URLSearchParams(window.location.search);
  const profileId = params.get("id"); // ProfessionalProfile.Id or RecruiterProfile.Id — NOT User.Id
  const profileType = params.get("type"); // "professional" | "recruiter" — set by the page that links here

  let profile = null;
  let isProfessional = profileType ? profileType === "professional" : true;

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
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

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  if (!profileId) {
    loadingState.hidden = true;
    showAlert("No profile specified.");
    return;
  }

  // ---------------- Tabs ----------------

  function setActiveTab(tabName) {
    document.querySelectorAll(".profile-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === tabName));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.tabPanel === tabName));
  }

  document.querySelectorAll(".profile-tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.gotoTab));
  });

  function applyRoleVisibility() {
    document.querySelectorAll("[data-professional-only]").forEach((el) => {
      el.hidden = !isProfessional;
    });
  }

  // ---------------- Dropdown (More options) ----------------

  function wireDropdown(toggleWrapId, menuId) {
    const wrap = document.getElementById(toggleWrapId);
    const menu = document.getElementById(menuId);
    if (!wrap || !menu) return;
    const toggle = wrap.querySelector("button");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("is-open");
    });
    document.addEventListener("click", () => menu.classList.remove("is-open"));
  }
  wireDropdown("cover-more-toggle", "cover-more-dropdown");

  // ================================================================
  // PROFESSIONAL rendering — field names confirmed against the real
  // GetProfessionalProfileResponse record.
  // ================================================================

  function renderProfessionalHeader(p) {
    const fullName = `${p.firstName || ""} ${p.lastName || ""}`.trim() || "User";
    document.getElementById("profile-name").textContent = fullName;

    document.getElementById("profile-avatar").innerHTML = p.profilePicture
      ? `<img src="${p.profilePicture}" alt="${escapeHtml(fullName)}" />`
      : escapeHtml(initials(fullName));

    document.getElementById("verified-icon").hidden = !p.isVerified;
    document.getElementById("profile-headline").textContent = p.headLine || "—";

    const topEducation = (p.educations || [])[0];
    const metaItems = [
      p.location ? { icon: "ti-map-pin", value: p.location } : null,
      p.websiteUrl ? { icon: "ti-link", value: stripProtocol(p.websiteUrl) } : null,
      topEducation ? { icon: "ti-school", value: topEducation.degree || topEducation.institution } : null,
    ].filter(Boolean);

    document.getElementById("profile-meta").innerHTML = metaItems
      .map((m) => `<span><i class="ti ${m.icon}" aria-hidden="true"></i> ${escapeHtml(m.value)}</span>`)
      .join("");
  }

  function renderProfessionalAbout(p) {
    const aboutEl = document.getElementById("about-text");
    aboutEl.textContent = p.summary || "No summary added yet.";

    requestAnimationFrame(() => {
      const toggleBtn = document.getElementById("about-toggle");
      if (aboutEl.scrollHeight > aboutEl.clientHeight + 2) {
        toggleBtn.hidden = false;
        toggleBtn.addEventListener("click", () => {
          const expanded = aboutEl.classList.toggle("is-expanded");
          toggleBtn.textContent = expanded ? "Show less" : "Show more";
        });
      }
    });
  }

  function renderProfessionalQuickFacts(p) {
    const grid = document.getElementById("quick-facts-grid");
    const experiences = p.experiences || [];
    const educations = p.educations || [];
    const facts = [];

    if (experiences.length) {
      facts.push({ icon: "ti-briefcase", label: "Experience", value: `${experiences.length} role${experiences.length === 1 ? "" : "s"}` });
    }
    if (educations.length) {
      facts.push({ icon: "ti-school", label: "Education", value: educations[0].degree || educations[0].institution });
    }
    if (p.location) {
      facts.push({ icon: "ti-map-pin", label: "Location", value: p.location });
    }
    if (p.availabilityStatus) {
      facts.push({ icon: "ti-clock", label: "Availability", value: p.availabilityStatus });
    }

    if (!facts.length) {
      grid.closest(".card").hidden = true;
      return;
    }

    grid.innerHTML = facts
      .map(
        (f) => `
        <div class="quick-fact">
          <span class="quick-fact__icon"><i class="ti ${f.icon}" aria-hidden="true"></i></span>
          <div>
            <span class="quick-fact__label">${f.label}</span>
            <span class="quick-fact__value">${escapeHtml(f.value)}</span>
          </div>
        </div>`
      )
      .join("");
  }

  function renderExperience(p) {
    const list = p.experiences || [];
    const previewCard = document.getElementById("experience-preview-card");
    const previewList = document.getElementById("experience-preview-list");
    const fullList = document.getElementById("experience-full-list");

    if (!list.length) {
      previewCard.hidden = true;
      fullList.innerHTML = `<p class="empty-note">No experience added yet.</p>`;
      return;
    }

    const itemHtml = (e) => `
      <div class="timeline-item">
        <span class="timeline-item__logo">${escapeHtml(initials(e.companyName))}</span>
        <div>
          <p class="timeline-item__title">${escapeHtml(e.jobTitle)}</p>
          <p class="timeline-item__sub">${escapeHtml(e.companyName)}</p>
          <span class="timeline-item__meta">${formatDate(e.startDate)} – ${e.isCurrentJob ? "Present" : formatDate(e.endDate)} · ${escapeHtml(e.location || "")}</span>
        </div>
      </div>`;

    previewCard.hidden = false;
    previewList.innerHTML = list.slice(0, 2).map(itemHtml).join("");
    fullList.innerHTML = list.map(itemHtml).join("");
  }

  function renderEducation(p) {
    const list = p.educations || [];
    const previewCard = document.getElementById("education-preview-card");
    const previewList = document.getElementById("education-preview-list");
    const fullList = document.getElementById("education-full-list");

    if (!list.length) {
      previewCard.hidden = true;
      fullList.innerHTML = `<p class="empty-note">No education added yet.</p>`;
      return;
    }

    const itemHtml = (e) => `
      <div class="timeline-item">
        <span class="timeline-item__logo">${escapeHtml(initials(e.institution))}</span>
        <div>
          <p class="timeline-item__title">${escapeHtml(e.degree)}</p>
          <p class="timeline-item__sub">${escapeHtml(e.institution)}</p>
          <span class="timeline-item__meta">${formatDate(e.startDate)} – ${e.endDate ? formatDate(e.endDate) : "Present"}</span>
        </div>
      </div>`;

    previewCard.hidden = false;
    previewList.innerHTML = list.slice(0, 1).map(itemHtml).join("");
    fullList.innerHTML = list.map(itemHtml).join("");
  }

  function renderSkills(p) {
    // NOTE: the exact property name for a skill's display name inside
    // GetProfessionalSkillsByProfileRespone wasn't confirmed (only the
    // constructor call site was seen, not the record definition) — this
    // tries a couple of likely names before falling back.
    const list = p.skills || [];
    const fullList = document.getElementById("skills-full-list");
    const sidebarCard = document.getElementById("skills-sidebar-card");
    const sidebarList = document.getElementById("skills-sidebar-list");

    const skillName = (s) => s.name || s.skillName || s.Name || "";

    if (!list.length) {
      fullList.innerHTML = `<p class="empty-note">No skills added yet.</p>`;
      sidebarCard.hidden = true;
      return;
    }

    const chipsHtml = list.map((s) => `<span class="chip">${escapeHtml(skillName(s))}</span>`).join("");
    fullList.innerHTML = chipsHtml;

    sidebarCard.hidden = false;
    sidebarList.innerHTML = list.slice(0, 8).map((s) => `<span class="chip">${escapeHtml(skillName(s))}</span>`).join("");
  }

  // Email/Phone are only shown when viewing your own profile — the
  // backend (GetProfessionalProfile) currently returns them to any
  // caller regardless of who's asking, so this is a frontend-only
  // mitigation. It doesn't stop the data being sent over the wire to
  // someone calling the endpoint directly; a real fix needs the backend
  // to redact these fields when ViewerUserId != the profile owner.
  function renderProfessionalContactAndSocial(p, isOwnProfile) {
    const contactItems = [
      isOwnProfile && p.email ? { icon: "ti-mail", label: "Email", value: p.email, href: `mailto:${p.email}` } : null,
      isOwnProfile && p.phone ? { icon: "ti-phone", label: "Phone", value: p.phone } : null,
      p.location ? { icon: "ti-map-pin", label: "Location", value: p.location } : null,
      p.websiteUrl ? { icon: "ti-link", label: "Website", value: stripProtocol(p.websiteUrl), href: p.websiteUrl } : null,
    ].filter(Boolean);

    document.getElementById("contact-info-list").innerHTML = contactItems
      .map(
        (c) => `
        <li>
          <i class="ti ${c.icon}" aria-hidden="true"></i>
          <div>
            <span class="detail-list__label">${c.label}</span>
            ${c.href ? `<a href="${c.href}" target="_blank" rel="noopener">${escapeHtml(c.value)}</a>` : `<span>${escapeHtml(c.value)}</span>`}
          </div>
        </li>`
      )
      .join("");

    const socialLinks = [
      p.linkedInUrl ? { icon: "ti-brand-linkedin", cls: "linkedin", url: p.linkedInUrl } : null,
      p.gitHubUrl ? { icon: "ti-brand-github", cls: "github", url: p.gitHubUrl } : null,
    ].filter(Boolean);

    const socialCard = document.getElementById("social-links-card");
    if (!socialLinks.length) {
      socialCard.hidden = true;
    } else {
      socialCard.hidden = false;
      document.getElementById("social-links-list").innerHTML = socialLinks
        .map(
          (s) => `
          <li>
            <span class="social-icon social-icon--${s.cls}"><i class="ti ${s.icon}" aria-hidden="true"></i></span>
            <a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(stripProtocol(s.url))}</a>
          </li>`
        )
        .join("");
    }
  }

  // ================================================================
  // RECRUITER rendering — field names confirmed against
  // GetRecruiterPublicProfile.RecruiterPublicProfileResponse (new
  // query added alongside this frontend work).
  // ================================================================

  function renderRecruiterHeader(p) {
    document.getElementById("profile-name").textContent = p.fullName || "User";

    document.getElementById("profile-avatar").innerHTML = p.profilePictureUrl
      ? `<img src="${p.profilePictureUrl}" alt="${escapeHtml(p.fullName)}" />`
      : escapeHtml(initials(p.fullName));

    document.getElementById("verified-icon").hidden = true; // no IsVerified concept on recruiter profile

    const headlineText = [p.jobTitle, p.companyName || p.department].filter(Boolean).join(" · ");
    document.getElementById("profile-headline").textContent = headlineText || "—";

    const metaItems = [
      p.location ? { icon: "ti-map-pin", value: p.location } : null,
    ].filter(Boolean);

    document.getElementById("profile-meta").innerHTML = metaItems
      .map((m) => `<span><i class="ti ${m.icon}" aria-hidden="true"></i> ${escapeHtml(m.value)}</span>`)
      .join("");
  }

  function renderRecruiterAbout(p) {
    document.getElementById("about-text").textContent = p.bio || "No summary added yet.";
  }

  function renderRecruiterQuickFacts(p) {
    const grid = document.getElementById("quick-facts-grid");
    const facts = [
      p.jobTitle ? { icon: "ti-id-badge-2", label: "Role", value: p.jobTitle } : null,
      p.department ? { icon: "ti-sitemap", label: "Department", value: p.department } : null,
      p.companyName ? { icon: "ti-building", label: "Company", value: p.companyName } : null,
      p.location ? { icon: "ti-map-pin", label: "Location", value: p.location } : null,
    ].filter(Boolean);

    if (!facts.length) {
      grid.closest(".card").hidden = true;
      return;
    }

    grid.innerHTML = facts
      .map(
        (f) => `
        <div class="quick-fact">
          <span class="quick-fact__icon"><i class="ti ${f.icon}" aria-hidden="true"></i></span>
          <div>
            <span class="quick-fact__label">${f.label}</span>
            <span class="quick-fact__value">${escapeHtml(f.value)}</span>
          </div>
        </div>`
      )
      .join("");
  }

  function renderRecruiterContact(p, isOwnProfile) {
    const contactItems = [
      isOwnProfile && p.email ? { icon: "ti-mail", label: "Email", value: p.email, href: `mailto:${p.email}` } : null,
      isOwnProfile && p.tel ? { icon: "ti-phone", label: "Phone", value: p.tel } : null,
      p.location ? { icon: "ti-map-pin", label: "Location", value: p.location } : null,
    ].filter(Boolean);

    document.getElementById("contact-info-list").innerHTML = contactItems
      .map(
        (c) => `
        <li>
          <i class="ti ${c.icon}" aria-hidden="true"></i>
          <div>
            <span class="detail-list__label">${c.label}</span>
            ${c.href ? `<a href="${c.href}" target="_blank" rel="noopener">${escapeHtml(c.value)}</a>` : `<span>${escapeHtml(c.value)}</span>`}
          </div>
        </li>`
      )
      .join("");

    document.getElementById("social-links-card").hidden = true; // recruiters have no social link fields
  }

  function renderCompanyCard(p) {
    const companyCard = document.getElementById("company-card");

    if (!p.companyName) {
      companyCard.hidden = true;
      return;
    }

    companyCard.hidden = false;
    document.getElementById("connected-company").innerHTML = `
      <div class="connected-company__logo">
        ${
          p.companyLogoUrl
            ? `<img src="${p.companyLogoUrl}" alt="${escapeHtml(p.companyName)}" />`
            : escapeHtml(initials(p.companyName))
        }
      </div>
      <div>
        <div class="connected-company__name">${escapeHtml(p.companyName)}</div>
        <div class="connected-company__meta">${escapeHtml(p.companyIndustry || "")}</div>
      </div>
    `;
  }

  // ---------------- Activity tab ----------------
  // Posts are authored by User.Id, so this always uses profile.userId,
  // not the profile-id from the URL.

  async function loadActivity(userId) {
    const activityList = document.getElementById("activity-list");
    const emptyHint = document.getElementById("activity-empty");

    try {
      const response = await fetch(`${API_ROUTES.getPostsByUser}/${userId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        activityList.innerHTML = "";
        emptyHint.hidden = false;
        return;
      }

      const posts = result.data.items || result.data || [];

      if (!posts.length) {
        activityList.innerHTML = "";
        emptyHint.hidden = false;
        return;
      }

      activityList.innerHTML = posts
        .map(
          (post) => `
          <div class="activity-item">
            <div class="activity-item__meta">${formatDate(post.dateCreated || post.createdAt)}</div>
            <div class="activity-item__content">${escapeHtml(post.content || post.text || "")}</div>
          </div>`
        )
        .join("");
    } catch (err) {
      activityList.innerHTML = "";
      emptyHint.hidden = false;
    }
  }

  // ---------------- Connect / Message actions ----------------
  // Confirmed against the real SendConnectionRequest command:
  // SendConnectionRequestCommand(Guid SenderId, Guid ReceiverId).
  // SenderId is presumed to be set server-side from the JWT (matching
  // every other command we've seen do this), so only receiverId is sent.
  //
  // There is currently no endpoint that returns the connection status
  // between two users, so the button can't know up front whether you're
  // already connected/pending. It optimistically shows "Connect" and
  // reconciles state from the response when clicked (including reading
  // the failure message text for "already connected" / "already
  // pending" cases returned by the handler). A dedicated status field
  // (e.g. added to these profile responses, or a GetConnectionStatus
  // endpoint) would remove the need for this workaround.

  function setConnectButtonState(status) {
    const sidebarLabelText = status === "Connected" ? "Connected" : status === "Pending" ? "Request Sent" : "Add to My Network";
    const coverLabelText = status === "Connected" ? "Connected" : status === "Pending" ? "Pending" : "Connect";

    document.getElementById("connect-btn-label").textContent = coverLabelText;
    document.getElementById("sidebar-connect-label").textContent = sidebarLabelText;

    [document.getElementById("connect-btn"), document.getElementById("sidebar-connect-btn")].forEach((btn) => {
      btn.classList.toggle("is-connected", status === "Connected");
      btn.disabled = status === "Pending" || status === "Connected";
    });
  }

  async function handleConnectClick(targetUserId) {
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    try {
      const response = await fetch(`${API_ROUTES.sendConnectionRequest}?receiverId=${encodeURIComponent(targetUserId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        const message = (result.message || "").toLowerCase();
        if (message.includes("already connected")) {
          setConnectButtonState("Connected");
        } else if (message.includes("already pending")) {
          setConnectButtonState("Pending");
        } else {
          showToast(result.message || "Couldn't send connection request.", "error");
        }
        return;
      }

      setConnectButtonState("Pending");
    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
    }
  }

  async function handleMessageClick(targetUserId) {
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    try {
      const response = await fetch(API_ROUTES.startConversation, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientUserId: targetUserId }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        window.location.href = "messages.html";
        return;
      }

      const conversationId = result.data.id || result.data;
      window.location.href = `messages.html?conversationId=${encodeURIComponent(conversationId)}`;
    } catch (err) {
      window.location.href = "messages.html";
    }
  }

  // ---------------- Load ----------------

  try {
    let response;
    if (isProfessional) {
      response = await fetch(`${API_ROUTES.professionalProfile}/${profileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } else {
      response = await fetch(`${API_ROUTES.getRecruiterPublicProfile}/${profileId}/public-profile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.data) {
      loadingState.hidden = true;
      showAlert(result.message || "Couldn't load this profile.");
      return;
    }

    profile = result.data;
    applyRoleVisibility();

    const targetUserId = profile.userId;
    const isOwnProfile = String(targetUserId) === String(viewerUserId);

    if (isProfessional) {
      renderProfessionalHeader(profile);
      renderProfessionalAbout(profile);
      renderProfessionalQuickFacts(profile);
      renderExperience(profile);
      renderEducation(profile);
      renderSkills(profile);
      renderProfessionalContactAndSocial(profile, isOwnProfile);
      document.getElementById("company-card").hidden = true;
    } else {
      renderRecruiterHeader(profile);
      renderRecruiterAbout(profile);
      renderRecruiterQuickFacts(profile);
      renderRecruiterContact(profile, isOwnProfile);
      renderCompanyCard(profile);
    }

    if (isOwnProfile) {
      document.getElementById("connect-btn").hidden = true;
      document.getElementById("message-btn").hidden = true;
      document.getElementById("sidebar-connect-btn").hidden = true;
      document.getElementById("sidebar-message-btn").hidden = true;
    } else {
      setConnectButtonState("None");
      document.getElementById("connect-btn").addEventListener("click", () => handleConnectClick(targetUserId));
      document.getElementById("sidebar-connect-btn").addEventListener("click", () => handleConnectClick(targetUserId));
      document.getElementById("message-btn").addEventListener("click", () => handleMessageClick(targetUserId));
      document.getElementById("sidebar-message-btn").addEventListener("click", () => handleMessageClick(targetUserId));
    }

    loadActivity(targetUserId);

    loadingState.hidden = true;
    layout.hidden = false;
  } catch (err) {
    loadingState.hidden = true;
    showAlert("Couldn't reach the server. Check your connection and try again.");
  }
});