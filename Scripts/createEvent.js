(function () {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  const params = new URLSearchParams(window.location.search);
  const editEventId = params.get("id");

  // Speakers are held client-side until the event exists, since
  // AddEventSpeaker needs a real EventId. On create, they're added one
  // by one right after CreateEvent succeeds; on edit, they're added
  // immediately since the event already exists.
  const pendingSpeakers = [];
  let createdEventId = editEventId || null;

  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("is-visible"), 10);
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

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

  // ---- Cover image ----
  const coverInput = document.getElementById("cover-image-input");
  const coverDropzone = document.getElementById("cover-dropzone");
  const coverPreviewWrap = document.getElementById("cover-preview-wrap");
  const coverPreview = document.getElementById("cover-preview");
  const coverChangeBtn = document.getElementById("cover-change-btn");
  const previewImage = document.getElementById("preview-image");
  const previewImagePlaceholder = document.getElementById("preview-image-placeholder");
  let coverFile = null;

  coverDropzone.addEventListener("click", () => coverInput.click());
  coverChangeBtn.addEventListener("click", () => coverInput.click());

  coverDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    coverDropzone.classList.add("is-dragover");
  });
  coverDropzone.addEventListener("dragleave", () => coverDropzone.classList.remove("is-dragover"));
  coverDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    coverDropzone.classList.remove("is-dragover");
    if (e.dataTransfer.files.length) {
      handleCoverFile(e.dataTransfer.files[0]);
    }
  });

  coverInput.addEventListener("change", () => {
    if (coverInput.files.length) {
      handleCoverFile(coverInput.files[0]);
    }
  });

  function handleCoverFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be under 5MB", "error");
      return;
    }

    coverFile = file;
    const url = URL.createObjectURL(file);

    coverDropzone.hidden = true;
    coverPreviewWrap.hidden = false;
    coverPreview.src = url;

    previewImagePlaceholder.hidden = true;
    previewImage.hidden = false;
    previewImage.src = url;
  }

  // ---- Live preview + counters ----
  const titleInput = document.getElementById("event-title");
  const titleCount = document.getElementById("title-count");
  const descriptionInput = document.getElementById("event-description");
  const descriptionCount = document.getElementById("description-count");
  const previewTitle = document.getElementById("preview-title");
  const previewDescription = document.getElementById("preview-description");
  const previewDate = document.getElementById("preview-date");
  const previewLocation = document.getElementById("preview-location");
  const dateInput = document.getElementById("event-date");
  const locationTypeSelect = document.getElementById("location-type");
  const locationInput = document.getElementById("event-location");
  const meetingLinkInput = document.getElementById("meeting-link");
  const locationField = document.getElementById("location-field");
  const meetingLinkField = document.getElementById("meeting-link-field");

  titleInput.addEventListener("input", () => {
    titleCount.textContent = titleInput.value.length;
    previewTitle.textContent = titleInput.value || "Your event title";
  });

  descriptionInput.addEventListener("input", () => {
    descriptionCount.textContent = descriptionInput.value.length;
    previewDescription.textContent = descriptionInput.value || "Your description will appear here.";
  });

  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    const date = new Date(dateInput.value);
    previewDate.innerHTML = `<i class="ti ti-calendar" aria-hidden="true"></i> ${date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  });

  locationTypeSelect.addEventListener("change", () => {
    const value = locationTypeSelect.value;

    locationField.hidden = value === "Online";
    meetingLinkField.hidden = value === "InPerson";

    updateLocationPreview();
  });

  locationInput.addEventListener("input", updateLocationPreview);
  meetingLinkInput.addEventListener("input", updateLocationPreview);

  function updateLocationPreview() {
    const value = locationTypeSelect.value;
    let text = "Select location";

    if (value === "Online") {
      text = "Online Event";
    } else if (value === "InPerson" && locationInput.value) {
      text = locationInput.value;
    } else if (value === "Hybrid") {
      text = locationInput.value ? `${locationInput.value} + Online` : "Hybrid Event";
    }

    previewLocation.innerHTML = `<i class="ti ti-map-pin" aria-hidden="true"></i> ${text}`;
  }

  // ---- Duration → custom end date toggle ----
  const durationSelect = document.getElementById("event-duration");
  const customEndRow = document.getElementById("custom-end-row");
  const endDateInput = document.getElementById("event-end-date");

  durationSelect.addEventListener("change", () => {
    customEndRow.hidden = durationSelect.value !== "custom";
  });

  function computeEndDateTime(startDateTime) {
    if (durationSelect.value === "custom") {
      return new Date(endDateInput.value);
    }
    const minutes = parseInt(durationSelect.value, 10);
    return new Date(startDateTime.getTime() + minutes * 60000);
  }

  // ---- Speakers ----
  const speakerModalOverlay = document.getElementById("speaker-modal-overlay");
  const speakerList = document.getElementById("speaker-list");
  const speakerEmpty = document.getElementById("speaker-empty");

  document.getElementById("add-speaker-btn").addEventListener("click", () => {
    document.getElementById("speaker-name").value = "";
    document.getElementById("speaker-title").value = "";
    document.getElementById("speaker-company").value = "";
    document.getElementById("speaker-linkedin").value = "";
    document.getElementById("speaker-photo-input").value = "";
    speakerModalOverlay.hidden = false;
  });

  document.getElementById("speaker-modal-close").addEventListener("click", () => (speakerModalOverlay.hidden = true));
  document.getElementById("speaker-modal-cancel").addEventListener("click", () => (speakerModalOverlay.hidden = true));

  document.getElementById("speaker-modal-save").addEventListener("click", async () => {
    const name = document.getElementById("speaker-name").value.trim();

    if (!name) {
      showToast("Speaker name is required", "error");
      return;
    }

    const photoFile = document.getElementById("speaker-photo-input").files[0] || null;

    const speaker = {
      name,
      title: document.getElementById("speaker-title").value.trim() || null,
      company: document.getElementById("speaker-company").value.trim() || null,
      linkedInUrl: document.getElementById("speaker-linkedin").value.trim() || null,
      photo: photoFile,
      photoUrl: photoFile ? URL.createObjectURL(photoFile) : null,
    };

    if (createdEventId) {
      // Editing an existing (or already-created) event — persist immediately.
      try {
        const formData = new FormData();
        formData.append("EventId", createdEventId);
        formData.append("Name", speaker.name);
        if (speaker.title) formData.append("Title", speaker.title);
        if (speaker.company) formData.append("Company", speaker.company);
        if (speaker.linkedInUrl) formData.append("LinkedInUrl", speaker.linkedInUrl);
        if (speaker.photo) formData.append("Photo", speaker.photo);

        const result = await apiRequest(API_ROUTES.addEventSpeaker, { method: "POST", body: formData });
        showToast("Speaker added");
        // Prefer the real uploaded URL from the server response over the
        // local blob preview, once/if the backend returns one.
        if (result.data?.photoUrl) speaker.photoUrl = result.data.photoUrl;
      } catch (err) {
        showToast(err.message, "error");
        return;
      }
    } else {
      pendingSpeakers.push(speaker);
    }

    renderSpeaker(speaker);
    speakerModalOverlay.hidden = true;
  });

  function renderSpeaker(speaker) {
    speakerEmpty.hidden = true;

    const card = document.createElement("div");
    card.className = "speaker-card";
    card.innerHTML = `
      ${
        speaker.photoUrl
          ? `<img src="${speaker.photoUrl}" class="speaker-card__avatar speaker-card__avatar--img" alt="${speaker.name}" />`
          : `<div class="speaker-card__avatar">${speaker.name.charAt(0).toUpperCase()}</div>`
      }
      <div class="speaker-card__info">
        <strong>${speaker.name}</strong>
        <span>${[speaker.title, speaker.company].filter(Boolean).join(" · ")}</span>
      </div>
    `;
    speakerList.appendChild(card);
  }

  // ---- Submit ----
  const form = document.getElementById("event-form");
  const submitBtn = document.getElementById("submit-btn");
  const saveDraftBtn = document.getElementById("save-draft-btn");

  function buildEventPayload(isDraft) {
    const startDateTime = new Date(dateInput.value);
    const endDateTime = computeEndDateTime(startDateTime);
    const locationType = locationTypeSelect.value;

    return {
      Title: titleInput.value.trim(),
      Description: descriptionInput.value.trim(),
      EventType: document.getElementById("event-type").value,
      Category: document.getElementById("event-category").value.trim() || null,
      StartDateTime: startDateTime.toISOString(),
      EndDateTime: endDateTime.toISOString(),
      LocationType: locationType,
      Location: locationType !== "Online" ? locationInput.value.trim() || null : null,
      OnlineMeetingLink: locationType !== "InPerson" ? meetingLinkInput.value.trim() || null : null,
      Visibility: document.getElementById("visibility").value,
      RegistrationType: document.querySelector('input[name="registration-type"]:checked').value,
      AttendeeLimit: document.getElementById("attendee-limit").value
        ? parseInt(document.getElementById("attendee-limit").value, 10)
        : null,
      SaveAsDraft: isDraft,
    };
  }

  function validateForm() {
    if (!titleInput.value.trim()) return "Event title is required";
    if (!document.getElementById("event-type").value) return "Event type is required";
    if (!dateInput.value) return "Date & time is required";
    if (!locationTypeSelect.value) return "Location type is required";
    if (locationTypeSelect.value !== "Online" && !locationInput.value.trim())
      return "Venue/city is required for in-person or hybrid events";
    if (locationTypeSelect.value !== "InPerson" && !meetingLinkInput.value.trim())
      return "Online meeting link is required for online or hybrid events";
    if (!descriptionInput.value.trim()) return "Description is required";
    if (durationSelect.value === "custom" && !endDateInput.value) return "End date/time is required";
    return null;
  }

  async function submitEvent(isDraft) {
    const error = validateForm();
    if (error) {
      showToast(error, "error");
      return;
    }

    const btn = isDraft ? saveDraftBtn : submitBtn;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = isDraft ? "Saving..." : "Creating...";

    try {
      const payload = buildEventPayload(isDraft);
      let eventId;

      if (editEventId) {
        await apiRequest(API_ROUTES.updateEvent, {
          method: "POST",
          body: JSON.stringify({ EventId: editEventId, ...payload }),
        });
        eventId = editEventId;
      } else {
        const result = await apiRequest(API_ROUTES.createEvent, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        eventId = result.data;
        createdEventId = eventId;

        for (const speaker of pendingSpeakers) {
          const formData = new FormData();
          formData.append("EventId", eventId);
          formData.append("Name", speaker.name);
          if (speaker.title) formData.append("Title", speaker.title);
          if (speaker.company) formData.append("Company", speaker.company);
          if (speaker.linkedInUrl) formData.append("LinkedInUrl", speaker.linkedInUrl);
          if (speaker.photo) formData.append("Photo", speaker.photo);
          await apiRequest(API_ROUTES.addEventSpeaker, { method: "POST", body: formData });
        }
      }

      if (coverFile) {
        const coverFormData = new FormData();
        coverFormData.append("EventId", eventId);
        coverFormData.append("File", coverFile);
        await apiRequest(API_ROUTES.uploadEventCoverImage, { method: "POST", body: coverFormData });
      }

      showToast(isDraft ? "Event saved as draft" : "Event published successfully");
      setTimeout(() => (window.location.href = `manage-event.html?id=${eventId}`), 800);
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitEvent(false);
  });

  saveDraftBtn.addEventListener("click", () => submitEvent(true));

  // ---- Edit mode: prefill from GetEventForManage ----
  async function loadForEdit() {
    document.getElementById("page-title").textContent = "Edit Event";
    document.getElementById("page-subtitle").textContent = "Update your event details.";
    submitBtn.textContent = "Save Changes";

    try {
      const result = await apiRequest(`${API_ROUTES.getEventForManage}/${editEventId}`);
      const e = result.data;

      titleInput.value = e.title;
      titleInput.dispatchEvent(new Event("input"));
      document.getElementById("event-type").value = e.eventType;
      document.getElementById("event-category").value = e.category || "";
      descriptionInput.value = e.description;
      descriptionInput.dispatchEvent(new Event("input"));

      const start = new Date(e.startDateTime);
      dateInput.value = start.toISOString().slice(0, 16);
      dateInput.dispatchEvent(new Event("change"));

      durationSelect.value = "custom";
      customEndRow.hidden = false;
      endDateInput.value = new Date(e.endDateTime).toISOString().slice(0, 16);

      locationTypeSelect.value = e.locationType;
      locationTypeSelect.dispatchEvent(new Event("change"));
      locationInput.value = e.location || "";
      meetingLinkInput.value = e.onlineMeetingLink || "";
      updateLocationPreview();

      document.getElementById("visibility").value = e.visibility;
      document.getElementById("attendee-limit").value = e.attendeeLimit || "";
      document.querySelector(`input[name="registration-type"][value="${e.registrationType}"]`).checked = true;

      if (e.coverImageUrl) {
        coverDropzone.hidden = true;
        coverPreviewWrap.hidden = false;
        coverPreview.src = e.coverImageUrl;
        previewImagePlaceholder.hidden = true;
        previewImage.hidden = false;
        previewImage.src = e.coverImageUrl;
      }

      e.speakers.forEach((s) =>
        renderSpeaker({ name: s.name, title: s.title, company: s.company, photoUrl: s.photoUrl })
      );
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  if (editEventId) {
    loadForEdit();
  }
})();