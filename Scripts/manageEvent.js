(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("id");

  if (!eventId) {
    window.location.href = "managed-events.html";
    return;
  }

  let currentEvent = null;
  let editingAgendaItemId = null;
  const registrationsState = { pageNumber: 1, pageSize: 10, status: "" };

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (using a #toast-container div) has been removed. Its default type
  // was "success"; the global default is "info", so calls that relied on
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
    const dateStr = s.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const startTime = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const endTime = e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${startTime} – ${endTime}`;
  }

  function statusPillClass(status) {
    return (
      {
        Published: "pill--published",
        Draft: "pill--draft",
        Cancelled: "pill--cancelled",
        Completed: "pill--completed",
      }[status] || ""
    );
  }

  // ---- Tabs ----
  document.querySelectorAll("#manage-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#manage-tabs .tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
      tab.classList.add("is-active");
      document.getElementById(`tab-${tab.dataset.tab}`).hidden = false;

      if (tab.dataset.tab === "registrations") {
        loadRegistrations();
      }
    });
  });

  // ---- Load event ----
  async function loadEvent() {
    try {
      const result = await apiRequest(`${API_ROUTES.getEventForManage}/${eventId}`);
      currentEvent = result.data;
      renderHero();
      renderStats();
      renderOverview();
      renderSpeakers();
      renderAgenda();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderHero() {
    const e = currentEvent;

    document.getElementById("manage-hero").className =
      "manage-hero" + (e.status === "Cancelled" || e.status === "Completed" ? ` manage-hero--${e.status.toLowerCase()}` : "");

    document.getElementById("hero-image").style.backgroundImage = e.coverImageUrl ? `url('${e.coverImageUrl}')` : "";
    document.getElementById("hero-status-pill").textContent = e.status;
    document.getElementById("hero-status-pill").className = `pill ${statusPillClass(e.status)}`;
    document.getElementById("hero-title").textContent = e.title;
    document.getElementById("hero-date").innerHTML = `<i class="ti ti-calendar" aria-hidden="true"></i> ${formatDateRange(
      e.startDateTime,
      e.endDateTime
    )}`;
    document.getElementById("hero-location").innerHTML = `<i class="ti ti-map-pin" aria-hidden="true"></i> ${
      e.location || "Online"
    }`;

    const actions = document.getElementById("hero-actions");
    actions.innerHTML = "";

    if (e.status === "Draft") {
      actions.innerHTML = `
        <a href="create-event.html?id=${e.id}" class="btn btn-outline">Edit</a>
        <button type="button" class="btn btn-primary" id="hero-publish-btn">Publish</button>
      `;
      document.getElementById("hero-publish-btn").addEventListener("click", publishEvent);
    } else if (e.status === "Published") {
      actions.innerHTML = `
        <a href="create-event.html?id=${e.id}" class="btn btn-outline">Edit</a>
        <button type="button" class="btn btn-danger" id="hero-cancel-btn">Cancel Event</button>
      `;
      document.getElementById("hero-cancel-btn").addEventListener("click", openCancelModal);
    }
  }

  function renderStats() {
    document.getElementById("stat-registered").textContent = currentEvent.registeredCount;
    document.getElementById("stat-attended").textContent = currentEvent.attendedCount;
    document.getElementById("stat-limit").textContent = currentEvent.attendeeLimit ?? "No limit";
  }

  function renderOverview() {
    const e = currentEvent;
    document.getElementById("overview-description").textContent = e.description;
    document.getElementById("detail-type").textContent = e.eventType;
    document.getElementById("detail-category").textContent = e.category || "—";
    document.getElementById("detail-visibility").textContent = e.visibility;
    document.getElementById("detail-registration").textContent = e.registrationType;
    document.getElementById("detail-link").textContent = e.onlineMeetingLink || "—";
    document.getElementById("detail-company").textContent = e.companyName;

    if (e.status === "Cancelled" && e.cancellationReason) {
      document.getElementById("cancellation-card").hidden = false;
      document.getElementById("cancellation-reason").textContent = e.cancellationReason;
    }
  }

  async function publishEvent() {
    try {
      await apiRequest(API_ROUTES.publishEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      showToast("Event published successfully", "success");
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---- Cancel event ----
  function openCancelModal() {
    document.getElementById("cancel-reason").value = "";
    document.getElementById("cancel-modal-overlay").hidden = false;
  }

  function closeCancelModal() {
    document.getElementById("cancel-modal-overlay").hidden = true;
  }

  document.getElementById("cancel-modal-close").addEventListener("click", closeCancelModal);
  document.getElementById("cancel-modal-back").addEventListener("click", closeCancelModal);

  document.getElementById("cancel-modal-confirm").addEventListener("click", async () => {
    const reason = document.getElementById("cancel-reason").value.trim();

    if (!reason) {
      showToast("Please provide a cancellation reason", "error");
      return;
    }

    try {
      await apiRequest(API_ROUTES.cancelEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId, CancellationReason: reason }),
      });
      showToast("Event cancelled and attendees notified", "success");
      closeCancelModal();
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // ---- Speakers ----
  function renderSpeakers() {
    const list = document.getElementById("manage-speaker-list");

    if (!currentEvent.speakers.length) {
      list.innerHTML = `<div class="empty-state"><i class="ti ti-users" aria-hidden="true"></i><span>No speakers added yet</span></div>`;
      return;
    }

    list.innerHTML = currentEvent.speakers
      .map(
        (s) => `
      <div class="speaker-card speaker-card--manage">
        ${
          s.photoUrl
            ? `<img src="${s.photoUrl}" class="speaker-card__avatar speaker-card__avatar--img" alt="" />`
            : `<div class="speaker-card__avatar">${s.name.charAt(0).toUpperCase()}</div>`
        }
        <div class="speaker-card__info">
          <strong>${s.name}</strong>
          <span>${[s.title, s.company].filter(Boolean).join(" · ")}</span>
        </div>
        <button type="button" class="icon-btn icon-btn--danger" data-remove-speaker="${s.id}">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>
    `
      )
      .join("");

    list.querySelectorAll("[data-remove-speaker]").forEach((btn) => {
      btn.addEventListener("click", () => removeSpeaker(btn.dataset.removeSpeaker));
    });
  }

  document.getElementById("manage-add-speaker-btn").addEventListener("click", () => {
    document.getElementById("speaker-name").value = "";
    document.getElementById("speaker-title").value = "";
    document.getElementById("speaker-company").value = "";
    document.getElementById("speaker-linkedin").value = "";
    document.getElementById("speaker-photo-input").value = "";
    document.getElementById("speaker-modal-overlay").hidden = false;
  });

  document.getElementById("speaker-modal-close").addEventListener("click", () => {
    document.getElementById("speaker-modal-overlay").hidden = true;
  });
  document.getElementById("speaker-modal-cancel").addEventListener("click", () => {
    document.getElementById("speaker-modal-overlay").hidden = true;
  });

  document.getElementById("speaker-modal-save").addEventListener("click", async () => {
    const name = document.getElementById("speaker-name").value.trim();

    if (!name) {
      showToast("Speaker name is required", "error");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("EventId", eventId);
      formData.append("Name", name);

      const titleVal = document.getElementById("speaker-title").value.trim();
      const companyVal = document.getElementById("speaker-company").value.trim();
      const linkedinVal = document.getElementById("speaker-linkedin").value.trim();
      const photoFile = document.getElementById("speaker-photo-input").files[0];

      if (titleVal) formData.append("Title", titleVal);
      if (companyVal) formData.append("Company", companyVal);
      if (linkedinVal) formData.append("LinkedInUrl", linkedinVal);
      if (photoFile) formData.append("Photo", photoFile);

      await apiRequest(API_ROUTES.addEventSpeaker, { method: "POST", body: formData });
      showToast("Speaker added", "success");
      document.getElementById("speaker-modal-overlay").hidden = true;
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  async function removeSpeaker(speakerId) {
    if (!confirm("Remove this speaker?")) return;

    try {
      await apiRequest(API_ROUTES.removeEventSpeaker, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId, SpeakerId: speakerId }),
      });
      showToast("Speaker removed", "success");
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---- Agenda ----
  function renderAgenda() {
    const list = document.getElementById("agenda-list");

    if (!currentEvent.agendaItems.length) {
      list.innerHTML = `<div class="empty-state"><i class="ti ti-calendar-event" aria-hidden="true"></i><span>No agenda items added yet</span></div>`;
      return;
    }

    list.innerHTML = currentEvent.agendaItems
      .map(
        (a) => `
      <div class="agenda-item">
        <div class="agenda-item__time">
          ${new Date(a.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} –
          ${new Date(a.endTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </div>
        <div class="agenda-item__body">
          <strong>${a.title}</strong>
          ${a.description ? `<p>${a.description}</p>` : ""}
        </div>
        <div class="agenda-item__actions">
          <button type="button" class="icon-btn" data-edit-agenda="${a.id}"><i class="ti ti-edit" aria-hidden="true"></i></button>
          <button type="button" class="icon-btn icon-btn--danger" data-remove-agenda="${a.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </div>
      </div>
    `
      )
      .join("");

    list.querySelectorAll("[data-edit-agenda]").forEach((btn) => {
      btn.addEventListener("click", () => openAgendaModal(btn.dataset.editAgenda));
    });
    list.querySelectorAll("[data-remove-agenda]").forEach((btn) => {
      btn.addEventListener("click", () => removeAgendaItem(btn.dataset.removeAgenda));
    });
  }

  document.getElementById("add-agenda-btn").addEventListener("click", () => openAgendaModal(null));

  function openAgendaModal(agendaItemId) {
    editingAgendaItemId = agendaItemId;
    const modalTitle = document.getElementById("agenda-modal-title");

    if (agendaItemId) {
      const item = currentEvent.agendaItems.find((a) => a.id === agendaItemId);
      modalTitle.textContent = "Edit Agenda Item";
      document.getElementById("agenda-title").value = item.title;
      document.getElementById("agenda-description").value = item.description || "";
      document.getElementById("agenda-start").value = new Date(item.startTime).toISOString().slice(0, 16);
      document.getElementById("agenda-end").value = new Date(item.endTime).toISOString().slice(0, 16);
    } else {
      modalTitle.textContent = "Add Agenda Item";
      document.getElementById("agenda-title").value = "";
      document.getElementById("agenda-description").value = "";
      document.getElementById("agenda-start").value = "";
      document.getElementById("agenda-end").value = "";
    }

    document.getElementById("agenda-modal-overlay").hidden = false;
  }

  document.getElementById("agenda-modal-close").addEventListener("click", () => {
    document.getElementById("agenda-modal-overlay").hidden = true;
  });
  document.getElementById("agenda-modal-cancel").addEventListener("click", () => {
    document.getElementById("agenda-modal-overlay").hidden = true;
  });

  document.getElementById("agenda-modal-save").addEventListener("click", async () => {
    const title = document.getElementById("agenda-title").value.trim();
    const start = document.getElementById("agenda-start").value;
    const end = document.getElementById("agenda-end").value;

    if (!title || !start || !end) {
      showToast("Title, start time, and end time are required", "error");
      return;
    }

    const payload = {
      EventId: eventId,
      Title: title,
      Description: document.getElementById("agenda-description").value.trim() || null,
      StartTime: new Date(start).toISOString(),
      EndTime: new Date(end).toISOString(),
    };

    try {
      if (editingAgendaItemId) {
        await apiRequest(API_ROUTES.updateEventAgendaItem, {
          method: "POST",
          body: JSON.stringify({ ...payload, AgendaItemId: editingAgendaItemId }),
        });
        showToast("Agenda item updated", "success");
      } else {
        await apiRequest(API_ROUTES.addEventAgendaItem, { method: "POST", body: JSON.stringify(payload) });
        showToast("Agenda item added", "success");
      }

      document.getElementById("agenda-modal-overlay").hidden = true;
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  async function removeAgendaItem(agendaItemId) {
    if (!confirm("Remove this agenda item?")) return;

    try {
      await apiRequest(API_ROUTES.removeEventAgendaItem, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId, AgendaItemId: agendaItemId }),
      });
      showToast("Agenda item removed", "success");
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---- Registrations ----
  async function loadRegistrations() {
    try {
      const url = new URL(`${API_ROUTES.getEventRegistrations}/${eventId}`);
      if (registrationsState.status) url.searchParams.set("status", registrationsState.status);
      url.searchParams.set("pageNumber", registrationsState.pageNumber);
      url.searchParams.set("pageSize", registrationsState.pageSize);
      url.searchParams.set("usePaging", "true");

      const result = await apiRequest(url.toString());
      renderRegistrations(result.data.items);
      renderRegistrationsPagination(result.data.totalCount);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderRegistrations(items) {
    const body = document.getElementById("registrations-body");

    if (!items.length) {
      body.innerHTML = `<tr><td colspan="6" class="table-empty">No registrations found</td></tr>`;
      return;
    }

    body.innerHTML = items
      .map(
        (r) => `
      <tr>
        <td>
          <div class="attendee-cell">
            ${
              r.profilePictureUrl
                ? `<img src="${r.profilePictureUrl}" alt="" />`
                : `<span class="attendee-cell__initial">${r.fullName.charAt(0).toUpperCase()}</span>`
            }
            <span>${r.fullName}</span>
          </div>
        </td>
        <td>${r.email}<br /><span class="table-muted">${r.phone}</span></td>
        <td>${[r.companyOrganization, r.jobTitle].filter(Boolean).join(" · ") || "—"}</td>
        <td>${new Date(r.registeredAt).toLocaleDateString()}</td>
        <td><span class="pill ${registrationPillClass(r.status)}">${r.status}</span></td>
        <td>
          ${
            r.status === "Registered"
              ? `<button type="button" class="btn btn-outline btn-sm" data-mark-attended="${r.id}">Mark Attended</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-mark-noshow="${r.id}">No Show</button>`
              : ""
          }
        </td>
      </tr>
    `
      )
      .join("");

    body.querySelectorAll("[data-mark-attended]").forEach((btn) => {
      btn.addEventListener("click", () => updateRegistrationStatus(btn.dataset.markAttended, "Attended"));
    });
    body.querySelectorAll("[data-mark-noshow]").forEach((btn) => {
      btn.addEventListener("click", () => updateRegistrationStatus(btn.dataset.markNoshow, "NoShow"));
    });
  }

  function registrationPillClass(status) {
    return (
      {
        Registered: "pill--published",
        Attended: "pill--completed",
        NoShow: "pill--cancelled",
        CancelledByUser: "pill--cancelled",
      }[status] || ""
    );
  }

  async function updateRegistrationStatus(registrationId, status) {
    try {
      await apiRequest(API_ROUTES.updateEventRegistrationStatus, {
        method: "POST",
        body: JSON.stringify({ RegistrationId: registrationId, Status: status }),
      });
      showToast("Registration updated", "success");
      loadRegistrations();
      loadEvent();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderRegistrationsPagination(totalCount) {
    const pageCount = Math.ceil(totalCount / registrationsState.pageSize);
    const container = document.getElementById("registrations-pagination");

    if (pageCount <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = "";
    for (let i = 1; i <= pageCount; i++) {
      html += `<button type="button" class="pagination__btn ${i === registrationsState.pageNumber ? "is-active" : ""}" data-page="${i}">${i}</button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll(".pagination__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        registrationsState.pageNumber = parseInt(btn.dataset.page, 10);
        loadRegistrations();
      });
    });
  }

  document.getElementById("registration-status-filter").addEventListener("change", (e) => {
    registrationsState.status = e.target.value;
    registrationsState.pageNumber = 1;
    loadRegistrations();
  });

  loadEvent();
})();