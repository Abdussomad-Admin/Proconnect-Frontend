(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  const state = {
    tab: "Registered",
    pageNumber: 1,
    pageSize: 8,
  };

  let pendingCancelEventId = null;

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (using a #toast-stack div) has been removed. Its default type was
  // "success"; the global default is "info", so calls below that relied on
  // the old default now pass "success" explicitly.

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
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

  function registrationStatusChip(status) {
    return (
      {
        Registered: `<span class="status-chip status-chip--success">Registered</span>`,
        Attended: `<span class="status-chip status-chip--muted">Attended</span>`,
        NoShow: `<span class="status-chip status-chip--danger">No Show</span>`,
        CancelledByUser: `<span class="status-chip status-chip--danger">Cancelled</span>`,
      }[status] || ""
    );
  }

  const emptyStateText = {
    Registered: { title: "No registered events", subtitle: "Register for an event and it'll show up here." },
    Upcoming: { title: "No upcoming events", subtitle: "Events you've registered for will appear here as they approach." },
    Past: { title: "No past events", subtitle: "Events you've attended will show up here afterward." },
    Saved: { title: "No saved events", subtitle: "Save events from Discover to find them here later." },
  };

  async function loadEvents() {
    try {
      const url = new URL(API_ROUTES.getMyEvents);
      url.searchParams.set("tab", state.tab);
      url.searchParams.set("pageNumber", state.pageNumber);
      url.searchParams.set("pageSize", state.pageSize);
      url.searchParams.set("usePaging", "true");

      const result = await apiRequest(url.toString());
      renderEvents(result.data.items);
      renderPagination(result.data.totalCount);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderEvents(items) {
    const list = document.getElementById("my-events-list");
    const emptyState = document.getElementById("empty-state");

    if (!items.length) {
      list.innerHTML = "";
      const text = emptyStateText[state.tab];
      document.getElementById("empty-title").textContent = text.title;
      document.getElementById("empty-subtitle").textContent = text.subtitle;
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    list.innerHTML = items
      .map(
        (e) => `
      <div class="my-event-card">
        <a href="event-details.html?id=${e.id}" class="my-event-card__image" style="${
          e.coverImageUrl ? `background-image: url('${e.coverImageUrl}')` : ""
        }">
          <span class="event-badge ${eventTypeBadgeClass(e.eventType)}">${e.eventType}</span>
        </a>
        <div class="my-event-card__body">
          <a href="event-details.html?id=${e.id}"><h3>${e.title}</h3></a>
          <div class="my-event-card__meta">
            <span><i class="ti ti-calendar" aria-hidden="true"></i> ${formatDateRange(e.startDateTime, e.endDateTime)}</span>
            <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${locationLabel(e)}</span>
            <span><i class="ti ti-building" aria-hidden="true"></i> ${e.companyName}</span>
          </div>
        </div>
        <div class="my-event-card__status">
          ${e.registrationStatus ? registrationStatusChip(e.registrationStatus) : ""}
        </div>
        <div class="my-event-card__actions">
          ${cardActionsHtml(e)}
        </div>
      </div>
    `
      )
      .join("");

    wireCardActions();
  }

  function cardActionsHtml(e) {
    if (state.tab === "Saved") {
      return `
        <a href="event-details.html?id=${e.id}" class="btn-outline btn-compact">View</a>
        <button type="button" class="card-icon-btn is-saved" data-unsave="${e.id}" title="Remove from saved">
          <i class="ti ti-bookmark-filled" aria-hidden="true"></i>
        </button>
      `;
    }

    if (e.registrationStatus === "Registered") {
      return `
        <a href="event-details.html?id=${e.id}" class="btn-outline btn-compact">View</a>
        <button type="button" class="btn-danger btn-compact" data-cancel="${e.id}" data-title="${e.title.replace(/"/g, "&quot;")}">
          Cancel
        </button>
      `;
    }

    return `<a href="event-details.html?id=${e.id}" class="btn-outline btn-compact">View</a>`;
  }

  function wireCardActions() {
    document.querySelectorAll("[data-unsave]").forEach((btn) => {
      btn.addEventListener("click", () => unsaveEvent(btn.dataset.unsave));
    });

    document.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => openCancelModal(btn.dataset.cancel, btn.dataset.title));
    });
  }

  async function unsaveEvent(eventId) {
    try {
      await apiRequest(API_ROUTES.unsaveEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      showToast("Removed from saved events", "success");
      loadEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openCancelModal(eventId, title) {
    pendingCancelEventId = eventId;
    document.getElementById("cancel-event-title").textContent = title;
    document.getElementById("cancel-modal-overlay").hidden = false;
  }

  document.getElementById("cancel-modal-close").addEventListener("click", closeCancelModal);
  document.getElementById("cancel-modal-back").addEventListener("click", closeCancelModal);

  function closeCancelModal() {
    document.getElementById("cancel-modal-overlay").hidden = true;
    pendingCancelEventId = null;
  }

  document.getElementById("cancel-modal-confirm").addEventListener("click", async () => {
    try {
      await apiRequest(API_ROUTES.cancelEventRegistration, {
        method: "POST",
        body: JSON.stringify({ EventId: pendingCancelEventId }),
      });
      showToast("Registration cancelled", "success");
      closeCancelModal();
      loadEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  function renderPagination(totalCount) {
    const pageCount = Math.ceil(totalCount / state.pageSize);
    const container = document.getElementById("pagination");

    if (pageCount <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = "";
    for (let i = 1; i <= pageCount; i++) {
      html += `<button type="button" class="pagination__btn ${i === state.pageNumber ? "is-active" : ""}" data-page="${i}">${i}</button>`;
    }
    container.innerHTML = html;

    container.querySelectorAll(".pagination__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.pageNumber = parseInt(btn.dataset.page, 10);
        loadEvents();
      });
    });
  }

  document.querySelectorAll("#my-events-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#my-events-tabs .tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.tab = tab.dataset.tab;
      state.pageNumber = 1;
      loadEvents();
    });
  });

  loadEvents();
})();