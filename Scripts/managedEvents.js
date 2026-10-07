(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  const state = {
    status: "",
    searchTerm: "",
    eventType: "",
    pageNumber: 1,
    pageSize: 10,
  };

  let pendingCancelEventId = null;

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (using a #toast-container div with its own fade animation) has
  // been removed. Its default type was "success"; the global default is
  // "info", so calls below that relied on the old default now pass
  // "success" explicitly.

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

  function renderTabCounts(counts) {
    document.querySelector('[data-count="all"]').textContent = counts.all;
    document.querySelector('[data-count="Published"]').textContent = counts.published;
    document.querySelector('[data-count="Draft"]').textContent = counts.drafts;
    document.querySelector('[data-count="Cancelled"]').textContent = counts.cancelled;
    document.querySelector('[data-count="Completed"]').textContent = counts.completed;
  }

  function renderEvents(items) {
    const list = document.getElementById("events-list");
    const emptyState = document.getElementById("empty-state");

    if (!items.length) {
      list.innerHTML = "";
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    list.innerHTML = items
      .map(
        (e) => `
      <div class="managed-event-card" data-event-id="${e.id}">
        <div class="managed-event-card__image" style="${
          e.coverImageUrl ? `background-image: url('${e.coverImageUrl}')` : ""
        }">
          <span class="pill ${statusPillClass(e.status)}">${e.status}</span>
        </div>
        <div class="managed-event-card__body">
          <h3>${e.title}</h3>
          <div class="managed-event-card__meta">
            <span><i class="ti ti-calendar" aria-hidden="true"></i> ${formatDateRange(e.startDateTime, e.endDateTime)}</span>
            <span><i class="ti ti-map-pin" aria-hidden="true"></i> ${e.location || "Online"}</span>
          </div>
        </div>
        <div class="managed-event-card__stats">
          <span><i class="ti ti-users" aria-hidden="true"></i> ${e.registrationCount} Registrations</span>
          <span><i class="ti ti-user-check" aria-hidden="true"></i> ${e.attendedCount} Attended</span>
        </div>
        <div class="managed-event-card__actions">
          ${
            e.status === "Cancelled"
              ? `<a href="manage-event.html?id=${e.id}" class="btn btn-outline btn-sm">View Details</a>`
              : `<div class="dropdown">
                  <button type="button" class="btn btn-primary btn-sm dropdown__toggle">Manage <i class="ti ti-chevron-down" aria-hidden="true"></i></button>
                  <div class="dropdown__menu">
                    <a href="manage-event.html?id=${e.id}"><i class="ti ti-eye" aria-hidden="true"></i> View Details</a>
                    <a href="create-event.html?id=${e.id}"><i class="ti ti-edit" aria-hidden="true"></i> Edit</a>
                    ${
                      e.status === "Draft"
                        ? `<button type="button" class="dropdown__action" data-action="publish" data-id="${e.id}"><i class="ti ti-send" aria-hidden="true"></i> Publish</button>
                           <button type="button" class="dropdown__action dropdown__action--danger" data-action="delete" data-id="${e.id}"><i class="ti ti-trash" aria-hidden="true"></i> Delete Draft</button>`
                        : `<button type="button" class="dropdown__action dropdown__action--danger" data-action="cancel" data-id="${e.id}"><i class="ti ti-ban" aria-hidden="true"></i> Cancel Event</button>`
                    }
                  </div>
                </div>`
          }
        </div>
      </div>
    `
      )
      .join("");

    wireDropdowns();
    wireActions();
  }

  function wireDropdowns() {
    document.querySelectorAll(".dropdown__toggle").forEach((toggle) => {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = toggle.nextElementSibling;
        document.querySelectorAll(".dropdown__menu.is-open").forEach((m) => {
          if (m !== menu) m.classList.remove("is-open");
        });
        menu.classList.toggle("is-open");
      });
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown__menu.is-open").forEach((m) => m.classList.remove("is-open"));
    });
  }

  function wireActions() {
    document.querySelectorAll('[data-action="publish"]').forEach((btn) => {
      btn.addEventListener("click", () => publishEvent(btn.dataset.id));
    });

    document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", () => deleteEvent(btn.dataset.id));
    });

    document.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
      btn.addEventListener("click", () => openCancelModal(btn.dataset.id));
    });
  }

  async function publishEvent(eventId) {
    try {
      await apiRequest(API_ROUTES.publishEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      showToast("Event published successfully", "success");
      loadEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function deleteEvent(eventId) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;

    try {
      await apiRequest(API_ROUTES.deleteEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: eventId }),
      });
      showToast("Draft deleted", "success");
      loadEvents();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function openCancelModal(eventId) {
    pendingCancelEventId = eventId;
    document.getElementById("cancel-reason").value = "";
    document.getElementById("cancel-modal-overlay").hidden = false;
  }

  document.getElementById("cancel-modal-close").addEventListener("click", closeCancelModal);
  document.getElementById("cancel-modal-back").addEventListener("click", closeCancelModal);

  function closeCancelModal() {
    document.getElementById("cancel-modal-overlay").hidden = true;
    pendingCancelEventId = null;
  }

  document.getElementById("cancel-modal-confirm").addEventListener("click", async () => {
    const reason = document.getElementById("cancel-reason").value.trim();

    if (!reason) {
      showToast("Please provide a cancellation reason", "error");
      return;
    }

    try {
      await apiRequest(API_ROUTES.cancelEvent, {
        method: "POST",
        body: JSON.stringify({ EventId: pendingCancelEventId, CancellationReason: reason }),
      });
      showToast("Event cancelled and attendees notified", "success");
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

  async function loadEvents() {
    try {
      const url = new URL(API_ROUTES.getManagedEvents);
      if (state.status) url.searchParams.set("status", state.status);
      if (state.searchTerm) url.searchParams.set("searchTerm", state.searchTerm);
      if (state.eventType) url.searchParams.set("eventType", state.eventType);
      url.searchParams.set("pageNumber", state.pageNumber);
      url.searchParams.set("pageSize", state.pageSize);
      url.searchParams.set("usePaging", "true");

      const result = await apiRequest(url.toString());

      renderTabCounts({
        all: result.data.statusCounts.all,
        published: result.data.statusCounts.published,
        drafts: result.data.statusCounts.drafts,
        cancelled: result.data.statusCounts.cancelled,
        completed: result.data.statusCounts.completed,
      });

      renderEvents(result.data.items);
      renderPagination(result.data.totalCount);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.status = tab.dataset.status;
      state.pageNumber = 1;
      loadEvents();
    });
  });

  let searchDebounce;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchTerm = e.target.value.trim();
      state.pageNumber = 1;
      loadEvents();
    }, 400);
  });

  document.getElementById("event-type-filter").addEventListener("change", (e) => {
    state.eventType = e.target.value;
    state.pageNumber = 1;
    loadEvents();
  });

  document.getElementById("clear-filters-btn").addEventListener("click", () => {
    state.searchTerm = "";
    state.eventType = "";
    state.pageNumber = 1;
    document.getElementById("search-input").value = "";
    document.getElementById("event-type-filter").value = "";
    loadEvents();
  });

  loadEvents();
})();