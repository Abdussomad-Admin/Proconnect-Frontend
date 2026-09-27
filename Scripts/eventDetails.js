(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    window.location.href = "events-discover.html";
    return;
  }

  let currentEvent = null;
  let resumeFile = null;
  let resumeUrl = null;
  let resumePublicId = null;
  const attendeesState = { pageNumber: 1, pageSize: 12 };

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (using a #toast-stack div) has been removed. Its default type was
  // "success"; the global default is "info", so calls below that relied on
  // the old default now pass "success" explicitly.

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      throw new Error(data.message || "Something went wrong");
    }

    return data;
  }

  function formatDateRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const dateStr = s.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${startTime} – ${endTime}`;
  }

  function formatShortDate(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${s.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })} – ${e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  function locationLabel(e) {
    if (e.locationType === "Online") return "Online Event";
    if (e.locationType === "Hybrid") return `${e.location || "Hybrid"} + Online`;
    return e.location || "In-person";
  }

  function eventTypeBadgeClass(type) {
    return (
      {
        Networking: "event-badge--networking",
        Webinar: "event-badge--webinar",
        Workshop: "event-badge--workshop",
        Conference: "event-badge--conference",
        CareerFair: "event-badge--careerfair",
        Social: "event-badge--social",
      }[type] || ""
    );
  }

  function initials(name) {
    return name ? name.charAt(0).toUpperCase() : "?";
  }

  // ---- Load event ----
  async function loadEvent() {
    try {
      const result = await apiRequest(`${API_ROUTES.getEventDetails}${eventId}`);
      currentEvent = result.data;
      renderAll();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderAll() {
    renderBanner();
    renderTitleRow();
    renderMetaRow();
    renderOverview();
    renderSpeakers();
    renderAgenda();
    renderSidebar();
    loadSimilarEvents();
  }

  function renderBanner() {
    const e = currentEvent;
    const banner = document.getElementById("event-banner");
    banner.style.backgroundImage = e.coverImageUrl ? `url('${e.coverImageUrl}')` : "";

    const badge = document.getElementById("banner-badge");
    badge.textContent = e.eventType;
    badge.className = `event-badge ${eventTypeBadgeClass(e.eventType)}`;

    const saveBtn = document.getElementById("banner-save-btn");
    saveBtn.classList.toggle("is-saved", e.isSaved);
    saveBtn.querySelector("i").className = `ti ${e.isSaved ? "ti-bookmark-filled" : "ti-bookmark"}`;
    saveBtn.onclick = toggleSave;
  }

  function renderTitleRow() {
    const e = currentEvent;
    document.getElementById("event-title").textContent = e.title;
    document.getElementById("event-description-short").textContent = e.description;

    const actions = document.getElementById("header-actions");

    if (e.status === "Cancelled") {
      actions.innerHTML = `<span class="status-chip status-chip--danger">This event has been cancelled</span>`;
      return;
    }

    if (e.isRegistered) {
      actions.innerHTML = `<span class="status-chip status-chip--success"><i class="ti ti-circle-check" aria-hidden="true"></i> You're registered</span>`;
    } else {
      actions.innerHTML = `<button type="button" class="btn-primary btn-compact" id="header-register-btn">Register Now</button>`;
      document.getElementById("header-register-btn").addEventListener("click", openRegisterModal);
    }
  }

  function renderMetaRow() {
    const e = currentEvent;
    document.getElementById("meta-date").innerHTML = `<i class="ti ti-calendar" aria-hidden="true"></i> ${formatDateRange(
      e.startDateTime,
      e.endDateTime
    )}`;
    document.getElementById("meta-location").innerHTML = `<i class="ti ti-map-pin" aria-hidden="true"></i> ${locationLabel(e)}`;

    const stack = document.getElementById("avatar-stack");
    stack.innerHTML = e.attendeeAvatars
      .map((a) =>
        a.profilePictureUrl
          ? `<img src="${a.profilePictureUrl}" alt="${a.fullName}" title="${a.fullName}" />`
          : `<span class="avatar-stack__initial" title="${a.fullName}">${initials(a.fullName)}</span>`
      )
      .join("");

    const overflow = e.goingCount - e.attendeeAvatars.length;
    document.getElementById("going-count-text").textContent =
      overflow > 0 ? `+${overflow} · ${e.goingCount} going` : `${e.goingCount} going`;
  }

  function renderOverview() {
    const e = currentEvent;
    document.getElementById("overview-description").textContent = e.description;

    const chips = [];
    if (e.speakers.length) chips.push({ icon: "ti-microphone", label: "Expert Speakers" });
    chips.push({ icon: "ti-users", label: "Networking Opportunities" });
    if (e.agendaItems.length) chips.push({ icon: "ti-list-check", label: "Structured Agenda" });

    document.getElementById("feature-chips").innerHTML = chips
      .map((c) => `<span class="chip"><i class="ti ${c.icon}" aria-hidden="true"></i> ${c.label}</span>`)
      .join("");

    document.getElementById("overview-speakers-card").hidden = !e.speakers.length;
    document.getElementById("overview-agenda-card").hidden = !e.agendaItems.length;

    document.getElementById("overview-speaker-grid").innerHTML = speakerCardsHtml(e.speakers.slice(0, 4));
    document.getElementById("overview-agenda-list").innerHTML = agendaItemsHtml(e.agendaItems.slice(0, 4));
  }

  function speakerCardsHtml(speakers) {
    return speakers
      .map(
        (s) => `
      <div class="speaker-tile">
        ${
          s.photoUrl
            ? `<img src="${s.photoUrl}" alt="${s.name}" />`
            : `<span class="speaker-tile__avatar">${initials(s.name)}</span>`
        }
        <strong>${s.name}</strong>
        <span>${[s.title, s.company].filter(Boolean).join(" · ")}</span>
        ${
          s.linkedInUrl
            ? `<a href="${s.linkedInUrl}" target="_blank" rel="noopener"><i class="ti ti-brand-linkedin" aria-hidden="true"></i> View Profile</a>`
            : ""
        }
      </div>
    `
      )
      .join("");
  }

  function agendaItemsHtml(items) {
    if (!items.length) {
      return `<div class="empty-state"><span>No agenda published yet</span></div>`;
    }

    return items
      .map((a) => {
        const durationMin = Math.round((new Date(a.endTime) - new Date(a.startTime)) / 60000);
        return `
      <div class="agenda-row">
        <span class="agenda-row__dot"></span>
        <div class="agenda-row__body">
          <div class="agenda-row__top">
            <strong>${new Date(a.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${new Date(
          a.endTime
        ).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong>
          </div>
          <p class="agenda-row__title">${a.title}</p>
          ${a.description ? `<p class="agenda-row__desc">${a.description}</p>` : ""}
        </div>
        <span class="agenda-row__duration">${durationMin} mins</span>
      </div>
    `;
      })
      .join("");
  }

  function renderSpeakers() {
    document.getElementById("full-speaker-grid").innerHTML = currentEvent.speakers.length
      ? speakerCardsHtml(currentEvent.speakers)
      : `<div class="empty-state"><i class="ti ti-microphone-off" aria-hidden="true"></i><span>No speakers announced yet</span></div>`;
  }

  function renderAgenda() {
    document.getElementById("full-agenda-list").innerHTML = agendaItemsHtml(currentEvent.agendaItems);
  }

  // ---- Tabs ----
  document.querySelectorAll("#detail-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.gotoTab));
  });

  function switchTab(tabName) {
    document.querySelectorAll("#detail-tabs .tab").forEach((t) => t.classList.remove("is-active"));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
    document.querySelector(`#detail-tabs .tab[data-tab="${tabName}"]`).classList.add("is-active");
    document.getElementById(`tab-${tabName}`).hidden = false;

    if (tabName === "attendees" && !document.getElementById("attendees-grid").dataset.loaded) {
      loadAttendees();
    }
  }

  // ---- Attendees ----
  async function loadAttendees() {
    try {
      const url = new URL(`${API_ROUTES.getEventAttendees}/${eventId}`);
      url.searchParams.set("pageNumber", attendeesState.pageNumber);
      url.searchParams.set("pageSize", attendeesState.pageSize);
      url.searchParams.set("usePaging", "true");

      const result = await apiRequest(url.toString());
      document.getElementById("attendees-heading").textContent = `Attendees (${result.data.totalCount})`;
      renderAttendees(result.data.items);
      renderAttendeesPagination(result.data.totalCount);
      document.getElementById("attendees-grid").dataset.loaded = "true";
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderAttendees(items) {
    const grid = document.getElementById("attendees-grid");

    if (!items.length) {
      grid.innerHTML = `<div class="empty-state"><i class="ti ti-users" aria-hidden="true"></i><span>No attendees yet — be the first to register!</span></div>`;
      return;
    }

    grid.innerHTML = items
      .map(
        (a) => `
      <div class="attendee-tile">
        ${
          a.profilePictureUrl
            ? `<img src="${a.profilePictureUrl}" alt="${a.fullName}" />`
            : `<span class="attendee-tile__avatar">${initials(a.fullName)}</span>`
        }
        <strong>${a.fullName}</strong>
        <span>${[a.jobTitle, a.companyOrganization].filter(Boolean).join(" · ") || "&nbsp;"}</span>
      </div>
    `
      )
      .join("");
  }

  function renderAttendeesPagination(totalCount) {
    const pageCount = Math.ceil(totalCount / attendeesState.pageSize);
    const container = document.getElementById("attendees-pagination");

    if (pageCount <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = "";
    for (let i = 1; i <= pageCount; i++) {
      html += `<button type="button" class="pagination__btn ${i === attendeesState.pageNumber ? "is-active" : ""}" data-page="${i}">${i}</button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll(".pagination__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        attendeesState.pageNumber = parseInt(btn.dataset.page, 10);
        loadAttendees();
      });
    });
  }

  // ---- Sidebar: actions, details, organizer ----
  function renderSidebar() {
    const e = currentEvent;

    document.getElementById("actions-card-header").hidden = !e.isRegistered;
    document.getElementById("dropdown-cancel-btn").hidden = !e.isRegistered;
    document.getElementById("dropdown-save-label").textContent = e.isSaved ? "Unsave" : "Save";

    const buttons = document.getElementById("sidebar-actions");

    if (e.status === "Cancelled") {
      buttons.innerHTML = `<span class="status-chip status-chip--danger" style="width:100%; text-align:center;">Event Cancelled</span>`;
    } else if (e.isRegistered) {
      buttons.innerHTML = `
        <button type="button" class="btn-outline" id="sidebar-cancel-btn"><i class="ti ti-circle-minus" aria-hidden="true"></i> Cancel Registration</button>
        <button type="button" class="btn-outline" id="sidebar-share-btn"><i class="ti ti-share-2" aria-hidden="true"></i> Share Event</button>
      `;
      document.getElementById("sidebar-cancel-btn").addEventListener("click", cancelRegistration);
      document.getElementById("sidebar-share-btn").addEventListener("click", shareEvent);
    } else {
      buttons.innerHTML = `
        <button type="button" class="btn-primary" id="sidebar-register-btn">Register Now</button>
        <button type="button" class="btn-outline" id="sidebar-save-btn">
          <i class="ti ${e.isSaved ? "ti-bookmark-filled" : "ti-bookmark"}" aria-hidden="true"></i> ${e.isSaved ? "Saved" : "Save Event"}
        </button>
        <button type="button" class="btn-outline" id="sidebar-share-btn"><i class="ti ti-share-2" aria-hidden="true"></i> Share Event</button>
      `;
      document.getElementById("sidebar-register-btn").addEventListener("click", openRegisterModal);
      document.getElementById("sidebar-save-btn").addEventListener("click", toggleSave);
      document.getElementById("sidebar-share-btn").addEventListener("click", shareEvent);
    }

    document.getElementById("detail-date").textContent = formatDateRange(e.startDateTime, e.endDateTime);
    document.getElementById("detail-location").textContent = locationLabel(e);
    document.getElementById("detail-type").textContent = e.eventType;
    document.getElementById("detail-visibility").textContent = e.visibility;

    const limitRow = document.getElementById("detail-limit-row");
    if (e.attendeeLimit) {
      document.getElementById("detail-limit").textContent = `${e.attendeeLimit} participants`;
      limitRow.hidden = false;
    } else {
      limitRow.hidden = true;
    }

    document.getElementById("organizer-name").textContent = e.companyName;
    document.getElementById("organizer-link").href = `company-profile.html?id=${e.companyId}`;
    const logo = document.getElementById("organizer-logo");
    if (e.companyLogoUrl) {
      logo.innerHTML = `<img src="${e.companyLogoUrl}" alt="${e.companyName}" />`;
    } else {
      logo.textContent = initials(e.companyName);
    }
  }

  // ---- Dropdown ----
  document.getElementById("actions-dropdown-toggle").addEventListener("click", (evt) => {
    evt.stopPropagation();
    document.getElementById("actions-dropdown-menu").classList.toggle("is-open");
  });
  document.addEventListener("click", () => {
    document.getElementById("actions-dropdown-menu").classList.remove("is-open");
  });
  document.getElementById("dropdown-share-btn").addEventListener("click", shareEvent);
  document.getElementById("dropdown-save-btn").addEventListener("click", toggleSave);
  document.getElementById("dropdown-cancel-btn").addEventListener("click", cancelRegistration);

  // ---- Save / Share / Cancel ----
  async function toggleSave() {
    try {
      await apiRequest(currentEvent.isSaved ? API_ROUTES.unsaveEvent : API_ROUTES.saveEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      currentEvent.isSaved = !currentEvent.isSaved;
      showToast(currentEvent.isSaved ? "Event saved" : "Removed from saved events", "success");
      renderBanner();
      renderSidebar();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function shareEvent() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: currentEvent.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      showToast("Event link copied to clipboard", "success");
    }
  }

  async function cancelRegistration() {
    if (!confirm("Cancel your registration for this event?")) return;

    try {
      await apiRequest(API_ROUTES.cancelEventRegistration, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      showToast("Registration cancelled", "success");
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---- Register modal ----
  function openRegisterModal() {
    const e = currentEvent;

    document.getElementById("modal-event-preview").innerHTML = `
      <div class="modal-event-preview__image" style="${e.coverImageUrl ? `background-image: url('${e.coverImageUrl}')` : ""}"></div>
      <div>
        <span class="event-badge ${eventTypeBadgeClass(e.eventType)}">${e.eventType}</span>
        <h4>${e.title}</h4>
        <span><i class="ti ti-calendar" aria-hidden="true"></i> ${formatShortDate(e.startDateTime, e.endDateTime)}</span>
        <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${locationLabel(e)}</span>
        <span><i class="ti ti-users" aria-hidden="true"></i> ${e.goingCount} going</span>
      </div>
    `;

    document.getElementById("reg-full-name").value = "";
    document.getElementById("reg-email").value = "";
    document.getElementById("reg-phone").value = "";
    document.getElementById("reg-company").value = "";
    document.getElementById("reg-job-title").value = "";
    document.getElementById("reg-goals").value = "";
    document.getElementById("goals-count").textContent = "0";
    document.getElementById("reg-terms").checked = true;
    resetResume();

    document.getElementById("register-modal-overlay").hidden = false;
  }

  document.getElementById("register-modal-close").addEventListener("click", closeRegisterModal);
  document.getElementById("register-modal-cancel").addEventListener("click", closeRegisterModal);

  function closeRegisterModal() {
    document.getElementById("register-modal-overlay").hidden = true;
  }

  document.getElementById("reg-goals").addEventListener("input", (e) => {
    document.getElementById("goals-count").textContent = e.target.value.length;
  });

  // ---- Resume upload ----
  const resumeDropzone = document.getElementById("resume-dropzone");
  const resumeInput = document.getElementById("reg-resume-input");

  document.getElementById("resume-choose-btn").addEventListener("click", () => resumeInput.click());
  resumeDropzone.addEventListener("click", (e) => {
    if (e.target.id === "resume-choose-btn") return;
    resumeInput.click();
  });
  resumeDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    resumeDropzone.classList.add("is-dragover");
  });
  resumeDropzone.addEventListener("dragleave", () => resumeDropzone.classList.remove("is-dragover"));
  resumeDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    resumeDropzone.classList.remove("is-dragover");
    if (e.dataTransfer.files.length) handleResumeFile(e.dataTransfer.files[0]);
  });
  resumeInput.addEventListener("change", () => {
    if (resumeInput.files.length) handleResumeFile(resumeInput.files[0]);
  });

  async function handleResumeFile(file) {
    resumeFile = file;
    document.getElementById("resume-file-name").textContent = file.name;
    resumeDropzone.hidden = true;
    document.getElementById("resume-uploaded-row").hidden = false;

    try {
      const formData = new FormData();
      formData.append("File", file);
      const result = await apiRequest(API_ROUTES.uploadEventRegistrationResume, { method: "POST", body: formData });
      resumeUrl = result.data.url;
      resumePublicId = result.data.publicId;
    } catch (err) {
      showToast(err.message, "error");
      resetResume();
    }
  }

  document.getElementById("resume-remove-btn").addEventListener("click", resetResume);

  function resetResume() {
    resumeFile = null;
    resumeUrl = null;
    resumePublicId = null;
    resumeInput.value = "";
    resumeDropzone.hidden = false;
    document.getElementById("resume-uploaded-row").hidden = true;
  }

  // ---- Submit registration ----
  document.getElementById("register-modal-submit").addEventListener("click", async () => {
    const fullName = document.getElementById("reg-full-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const phone = document.getElementById("reg-phone").value.trim();

    if (!fullName || !email || !phone) {
      showToast("Full name, email, and phone are required", "error");
      return;
    }

    if (!document.getElementById("reg-terms").checked) {
      showToast("You must agree to the terms and conditions", "error");
      return;
    }

    const submitBtn = document.getElementById("register-modal-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering...";

    try {
      await apiRequest(API_ROUTES.registerForEvent, {
        method: "POST",
        body: JSON.stringify({
          EventId: eventId,
          FullName: fullName,
          Email: email,
          Phone: phone,
          CompanyOrganization: document.getElementById("reg-company").value.trim() || null,
          JobTitle: document.getElementById("reg-job-title").value.trim() || null,
          GoalsForAttending: document.getElementById("reg-goals").value.trim() || null,
          ResumeUrl: resumeUrl,
          ResumePublicId: resumePublicId,
        }),
      });

      showToast("You're registered! Check your email for details.", "success");
      closeRegisterModal();
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="ti ti-send" aria-hidden="true"></i> Register Now`;
    }
  });

  // ---- Similar events ----
  async function loadSimilarEvents() {
    try {
      const url = new URL(API_ROUTES.discoverEvents);
      url.searchParams.set("eventType", currentEvent.eventType);
      url.searchParams.set("pageNumber", 1);
      url.searchParams.set("pageSize", 4);
      url.searchParams.set("usePaging", "true");

      const result = await apiRequest(url.toString());
      const items = result.data.items.filter((e) => e.id !== eventId).slice(0, 3);

      if (!items.length) return;

      document.getElementById("similar-card").hidden = false;
      document.getElementById("similar-list").innerHTML = items
        .map(
          (e) => `
        <a href="event-details.html?id=${e.id}" class="similar-item">
          <div class="similar-item__image" style="${e.coverImageUrl ? `background-image: url('${e.coverImageUrl}')` : ""}"></div>
          <div>
            <strong>${e.title}</strong>
            <span>${formatShortDate(e.startDateTime, e.endDateTime)}</span>
            <span>${locationLabel(e)}</span>
          </div>
        </a>
      `
        )
        .join("");
    } catch {
      // Similar events are a nice-to-have — fail silently rather than
      // showing a toast for a secondary sidebar widget.
    }
  }

  loadEvent();
})();