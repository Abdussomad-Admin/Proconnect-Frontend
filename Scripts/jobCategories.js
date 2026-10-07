document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  let categories = [];
  let currentView = "grid";

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showAlert(message) {
    showToast(message, "error");
  }

  // Icon is presentation-only guesswork based on category name — the
  // backend doesn't store an icon, so this just picks something sensible
  // to look at; it carries no data meaning.
  const ICON_MAP = [
    { match: /design/i, icon: "ti-palette" },
    { match: /dev|engineer|software/i, icon: "ti-code" },
    { match: /market/i, icon: "ti-speakerphone" },
    { match: /product/i, icon: "ti-box" },
    { match: /sales/i, icon: "ti-briefcase" },
    { match: /support|customer/i, icon: "ti-headset" },
    { match: /data/i, icon: "ti-chart-dots" },
    { match: /security|it\b/i, icon: "ti-shield-lock" },
    { match: /writ|content/i, icon: "ti-pencil" },
    { match: /finance|account/i, icon: "ti-currency-dollar" },
    { match: /hr|human/i, icon: "ti-users" },
    { match: /legal/i, icon: "ti-gavel" },
  ];

  function iconFor(name) {
    const found = ICON_MAP.find((m) => m.match.test(name));
    return found ? found.icon : "ti-briefcase-2";
  }

  // ---------------- Load categories (re-fetched whenever type/level filters change) ----------------

  async function loadCategories() {
    const loadingEl = document.getElementById("loading");
    loadingEl.hidden = false;
    document.getElementById("category-container").hidden = true;
    document.getElementById("empty").hidden = true;

    const params = new URLSearchParams();
    const employmentType = document.getElementById("filter-employment-type").value;
    const experienceLevel = document.getElementById("filter-experience-level").value;
    if (employmentType) params.set("employmentType", employmentType);
    if (experienceLevel) params.set("experienceLevel", experienceLevel);

    try {
      const response = await fetch(`${API_ROUTES.getJobCategories}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      loadingEl.hidden = true;

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load job categories.");
        return;
      }

      categories = result.data;
      renderPopular();
      applyFiltersAndRender();

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Categories fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderPopular() {
    const top = [...categories].sort((a, b) => b.jobCount - a.jobCount).slice(0, 5);
    document.getElementById("popular-list").innerHTML = top.map((c) => `
      <a href="job-search.html?categoryId=${c.id}" class="jc-popular-item">
        <span class="jc-popular-item__icon"><i class="ti ${iconFor(c.name)}" aria-hidden="true"></i></span>
        <div>
          <p class="jc-popular-item__name">${escapeHtml(c.name)}</p>
          <span class="jc-popular-item__count">${c.jobCount} jobs</span>
        </div>
      </a>
    `).join("");
  }

  // ---------------- Suggested for you (real trending titles, weighted by activity if available) ----------------

  async function loadSuggestions() {
    try {
      const params = new URLSearchParams();
      if (professionalProfileId) params.set("professionalProfileId", professionalProfileId);

      const response = await fetch(`${API_ROUTES.getSuggestedJobTitles}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.data && result.data.length > 0) {
        document.getElementById("suggested-card").hidden = false;
        document.getElementById("suggested-list").innerHTML = result.data.map((s) => `
          <a href="job-search.html?keyword=${encodeURIComponent(s.title)}" class="jc-suggested-item">
            <span>
              <span class="jc-suggested-item__name">${escapeHtml(s.title)}</span><br />
              <span class="jc-suggested-item__count">${s.jobCount} jobs</span>
            </span>
            <i class="ti ti-chevron-right jc-suggested-item__save" aria-hidden="true"></i>
          </a>
        `).join("");
      }
    } catch (err) {
      console.error("Suggested titles fetch threw an error:", err);
    }
  }

  // ---------------- Filters ----------------

  function applyFiltersAndRender() {
    const keyword = document.getElementById("search-input").value.trim().toLowerCase();
    const sort = document.getElementById("sort-select").value;

    let filtered = categories.filter((c) => c.name.toLowerCase().includes(keyword));

    if (sort === "az") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      filtered.sort((a, b) => b.jobCount - a.jobCount);
    }

    renderGrid(filtered);
  }

  document.getElementById("search-input").addEventListener("input", debounce(applyFiltersAndRender, 250));
  document.getElementById("sort-select").addEventListener("change", applyFiltersAndRender);

  // Type/level filters change which categories even exist in the result
  // set (zero-count categories are hidden by the backend once filtered),
  // so these re-fetch rather than just re-filtering client-side.
  document.getElementById("filter-employment-type").addEventListener("change", loadCategories);
  document.getElementById("filter-experience-level").addEventListener("change", loadCategories);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------------- View toggle ----------------

  document.querySelectorAll(".jc-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".jc-view-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentView = btn.dataset.view;
      document.getElementById("category-container").classList.toggle("is-list", currentView === "list");
    });
  });

  // ---------------- Render grid ----------------

  function renderGrid(items) {
    const container = document.getElementById("category-container");
    const emptyEl = document.getElementById("empty");

    if (items.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    container.hidden = false;
    container.classList.toggle("is-list", currentView === "list");

    container.innerHTML = items.map((c) => `
      <a href="job-search.html?categoryId=${c.id}" class="jc-category-card">
        <div class="jc-category-card__top">
          <span class="jc-category-card__icon"><i class="ti ${iconFor(c.name)}" aria-hidden="true"></i></span>
          <div>
            <p class="jc-category-card__name">${escapeHtml(c.name)}</p>
            <span class="jc-category-card__count">${c.jobCount} jobs</span>
          </div>
        </div>
        <p class="jc-category-card__desc">${escapeHtml(c.description || "")}</p>
        <span class="jc-category-card__link">Explore jobs →</span>
      </a>
    `).join("");
  }

  // ---------------- Init ----------------

  await loadCategories();
  loadSuggestions();
});