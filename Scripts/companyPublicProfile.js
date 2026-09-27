document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const userId = localStorage.getItem("pc_user_id");

  const companyId = new URLSearchParams(window.location.search).get("companyId");
  if (!companyId) {
    window.location.href = "job-search.html";
    return;
  }

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  let company = null;
  let reviewsPage = 1;
  const reviewsPageSize = 5;

  document.getElementById("back-link").href = document.referrer || "job-search.html";

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Thin wrapper kept so every existing showAlert(message, isSuccess) call
  // site below didn't need touching — now routes to the global toast
  // (Scripts/toast.js) instead of the old #form-alert div.
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  function starString(rating) {
    const full = Math.round(rating);
    return `<i class="ti ti-star-filled" aria-hidden="true"></i>`.repeat(full) +
           `<i class="ti ti-star" aria-hidden="true"></i>`.repeat(5 - full);
  }

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // ---------------- Load company profile ----------------

  async function loadCompany() {
    try {
      const response = await fetch(`${API_ROUTES.getCompanyPublicProfile}/${companyId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      document.getElementById("loading").hidden = true;

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load this company.");
        return;
      }

      company = result.data;
      renderCompany();
      document.getElementById("company-content").hidden = false;

      loadRatingSummary();
      loadPeopleYouMightKnow();

    } catch (err) {
      document.getElementById("loading").hidden = true;
      console.error("Company fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderCompany() {
    document.title = `${company.name} · ProConnect`;

    document.getElementById("company-name").textContent = company.name;
    document.getElementById("about-company-name").textContent = company.name;
    document.getElementById("tab-job-count").textContent = `(${company.activeJobCount})`;
    document.getElementById("tab-review-count").textContent = `(${company.reviewCount})`;

    if (company.logoUrl) {
      document.getElementById("header-logo").innerHTML = `<img src="${escapeHtml(company.logoUrl)}" alt="" />`;
    }

    if (company.isVerified) {
      document.getElementById("verified-badge").hidden = false;
    }

    if (company.website) {
      const link = document.getElementById("company-website");
      link.href = company.website;
      link.textContent = company.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
      link.hidden = false;
    }

    document.getElementById("meta-headquarters").innerHTML =
      `<i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(company.headquarters || "—")}`;
    document.getElementById("meta-industry").innerHTML =
      `<i class="ti ti-building-factory" aria-hidden="true"></i> ${escapeHtml(company.industry)}`;
    document.getElementById("meta-size").innerHTML =
      `<i class="ti ti-users" aria-hidden="true"></i> ${escapeHtml(company.companySize)}`;

    document.getElementById("view-jobs-btn").addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector('.cp-tab[data-tab="jobs"]').click();
    });

    document.getElementById("company-description").textContent = company.description;

    if (company.strengths) {
      const strengths = company.strengths.split(",").map((s) => s.trim()).filter(Boolean);
      if (strengths.length > 0) {
        document.getElementById("strengths-card").hidden = false;
        document.getElementById("strengths-list").innerHTML =
          strengths.map((s) => `<span class="cp-strength-tag">${escapeHtml(s)}</span>`).join("");
      }
    }

    document.getElementById("stat-jobs").textContent = company.activeJobCount;
    document.getElementById("stat-reviews").textContent = company.reviewCount;
    document.getElementById("stat-rating").textContent = company.reviewCount > 0 ? company.averageRating.toFixed(1) : "—";
    document.getElementById("stat-founded").textContent = company.foundedYear || "—";

    document.getElementById("highlight-industry").textContent = company.industry;
    document.getElementById("highlight-size").textContent = company.companySize;
    document.getElementById("highlight-hq").textContent = company.headquarters || "—";
    document.getElementById("highlight-founded").textContent = company.foundedYear || "—";
    if (company.website) {
      document.getElementById("highlight-website-row").hidden = false;
      const el = document.getElementById("highlight-website");
      el.href = company.website;
      el.textContent = company.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }

  // ---------------- Tabs ----------------

  document.querySelectorAll(".cp-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".cp-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelectorAll(".cp-panel").forEach((p) => (p.hidden = true));
      document.getElementById(`panel-${tab.dataset.tab}`).hidden = false;

      if (tab.dataset.tab === "reviews" && !document.getElementById("review-list").dataset.loaded) {
        loadReviews();
      }
      if (tab.dataset.tab === "jobs" && !document.getElementById("company-job-list").dataset.loaded) {
        loadCompanyJobs();
      }
    });
  });

  // ---------------- Rating summary ----------------

  async function loadRatingSummary() {
    try {
      const response = await fetch(`${API_ROUTES.getCompanyRatingSummary}/${companyId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data) return;

      const s = result.data;
      document.getElementById("summary-score").textContent = s.overallAverage.toFixed(1);
      document.getElementById("summary-stars").innerHTML = starString(s.overallAverage);
      document.getElementById("summary-count").textContent = `${s.totalReviews} review${s.totalReviews === 1 ? "" : "s"}`;

      const total = s.totalReviews || 1;
      document.getElementById("bar-5").style.width = `${(s.fiveStarCount / total) * 100}%`;
      document.getElementById("bar-4").style.width = `${(s.fourStarCount / total) * 100}%`;
      document.getElementById("bar-3").style.width = `${(s.threeStarCount / total) * 100}%`;
      document.getElementById("bar-2").style.width = `${(s.twoStarCount / total) * 100}%`;
      document.getElementById("bar-1").style.width = `${(s.oneStarCount / total) * 100}%`;

      document.getElementById("highlights-grid").innerHTML = [
        ["Work-life balance", s.workLifeBalanceAvg],
        ["Compensation & benefits", s.compensationAvg],
        ["Job security & growth", s.jobSecurityAvg],
        ["Management", s.managementAvg],
        ["Culture", s.cultureAvg],
      ].map(([label, val]) => `
        <div class="cp-highlight-item"><span>${label}</span><strong>${val > 0 ? val.toFixed(1) : "—"}</strong></div>
      `).join("");

    } catch (err) {
      console.error("Rating summary fetch threw an error:", err);
    }
  }

  // ---------------- Reviews list ----------------

  async function loadReviews() {
    const listEl = document.getElementById("review-list");
    const loadingEl = document.getElementById("reviews-loading");
    const emptyEl = document.getElementById("reviews-empty");
    const paginationEl = document.getElementById("reviews-pagination");

    loadingEl.hidden = false;
    emptyEl.hidden = true;
    paginationEl.hidden = true;

    try {
      const params = new URLSearchParams({ pageNumber: reviewsPage, pageSize: reviewsPageSize, usePaging: "true" });
      const response = await fetch(`${API_ROUTES.getCompanyReviews}/${companyId}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      loadingEl.hidden = true;
      listEl.dataset.loaded = "true";

      if (!response.ok || !result.data) return;

      const items = result.data.items || [];

      if (items.length === 0) {
        emptyEl.hidden = false;
        listEl.innerHTML = "";
        return;
      }

      listEl.innerHTML = items.map((r) => `
        <div class="cp-review-card" data-review-id="${r.id}">
          <div class="cp-review-card__header">
            <div>
              <div class="cp-review-card__name">${escapeHtml(r.reviewerFirstName)} ${escapeHtml(r.reviewerLastName.charAt(0))}.</div>
              <div class="cp-review-card__meta">${escapeHtml(r.jobTitle)}${r.location ? ` · ${escapeHtml(r.location)}` : ""}</div>
            </div>
            <div class="cp-review-card__meta">${formatDate(r.dateCreated)}</div>
          </div>
          <div class="cp-review-card__stars">${starString(r.overallRating)} ${r.overallRating.toFixed(1)}</div>
          <p class="cp-review-card__title">${escapeHtml(r.title)}</p>
          <p class="cp-review-card__content">${escapeHtml(r.content)}</p>
          <div class="cp-review-card__badges">
            <span class="cp-review-badge">${r.isCurrentEmployee ? "Current employee" : "Former employee"}</span>
            ${r.yearsAtCompany ? `<span class="cp-review-badge">${r.yearsAtCompany} year${r.yearsAtCompany > 1 ? "s" : ""} at company</span>` : ""}
          </div>
          <div class="cp-review-card__footer">
            <button type="button" class="cp-helpful-btn" data-helpful-btn><i class="ti ti-thumb-up" aria-hidden="true"></i> Helpful? <span data-helpful-count>${r.helpfulCount}</span></button>
          </div>
        </div>
      `).join("");

      listEl.querySelectorAll("[data-helpful-btn]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const card = btn.closest("[data-review-id]");
          const reviewId = card.dataset.reviewId;
          btn.disabled = true;
          try {
            const res = await fetch(API_ROUTES.markReviewHelpful, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ reviewId }),
            });
            const r = await res.json().catch(() => ({}));
            if (res.ok && r.data) {
              btn.querySelector("[data-helpful-count]").textContent = r.data;
            }
          } catch (err) {
            console.error("Mark helpful failed:", err);
          } finally {
            btn.disabled = false;
          }
        });
      });

      const totalPages = Math.max(1, Math.ceil(result.data.totalCount / result.data.pageSize));
      if (totalPages > 1) {
        paginationEl.hidden = false;
        document.getElementById("reviews-page-info").textContent = `Page ${reviewsPage} of ${totalPages}`;
        document.getElementById("reviews-prev").disabled = reviewsPage <= 1;
        document.getElementById("reviews-next").disabled = reviewsPage >= totalPages;
      }

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Reviews fetch threw an error:", err);
    }
  }

  document.getElementById("reviews-prev").addEventListener("click", () => { reviewsPage = Math.max(1, reviewsPage - 1); loadReviews(); });
  document.getElementById("reviews-next").addEventListener("click", () => { reviewsPage += 1; loadReviews(); });

  // ---------------- Company jobs ----------------

  async function loadCompanyJobs() {
    const listEl = document.getElementById("company-job-list");
    const loadingEl = document.getElementById("jobs-loading");
    const emptyEl = document.getElementById("jobs-empty");

    try {
      const params = new URLSearchParams({ companyId, pageNumber: 1, pageSize: 20, usePaging: "true", sortBy: "Newest" });
      const response = await fetch(`${API_ROUTES.searchJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      loadingEl.hidden = true;
      listEl.dataset.loaded = "true";

      if (!response.ok || !result.data || (result.data.items || []).length === 0) {
        emptyEl.hidden = false;
        return;
      }

      listEl.hidden = false;
      listEl.innerHTML = result.data.items.map((j) => `
        <a href="job-details.html?id=${j.id}" class="cp-job-card">
          <div>
            <p class="cp-job-card__title">${escapeHtml(j.title)}</p>
            <p class="cp-job-card__meta">${escapeHtml(j.location)} · ${j.workPlaceType} · ${employmentLabel(j.employmentType)}</p>
          </div>
          <i class="ti ti-chevron-right" aria-hidden="true"></i>
        </a>
      `).join("");

    } catch (err) {
      loadingEl.hidden = true;
      console.error("Company jobs fetch threw an error:", err);
    }
  }

  // ---------------- People you might know ----------------

  async function loadPeopleYouMightKnow() {
    if (!userId) return;
    try {
      const params = new URLSearchParams({ currentUserId: userId, take: 5 });
      const response = await fetch(`${API_ROUTES.getPeopleYouMightKnow}/${companyId}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data && result.data.length > 0) {
        document.getElementById("people-card").hidden = false;
        document.getElementById("people-list").innerHTML = result.data.map((p) => `
          <div class="cp-person-row">
            <span class="cp-person-avatar">
              ${p.profilePictureUrl ? `<img src="${escapeHtml(p.profilePictureUrl)}" alt="" />` : `${(p.firstName || "?").charAt(0)}${(p.lastName || "").charAt(0)}`}
            </span>
            <div>
              <p class="cp-person-name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</p>
              ${p.mutualConnectionCount > 0 ? `<span class="cp-person-mutual">${p.mutualConnectionCount} mutual connection${p.mutualConnectionCount > 1 ? "s" : ""}</span>` : ""}
            </div>
          </div>
        `).join("");
      }
    } catch (err) {
      console.error("People you might know fetch threw an error:", err);
    }
  }

  // ---------------- Share ----------------

  document.getElementById("share-btn").addEventListener("click", async () => {
    const btn = document.getElementById("share-btn");
    try {
      await navigator.clipboard.writeText(window.location.href);
      const original = btn.innerHTML;
      btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Link copied!`;
      setTimeout(() => { btn.innerHTML = original; }, 1500);
    } catch (err) {
      console.error("Couldn't copy link:", err);
    }
  });

  // ---------------- Write review modal ----------------

  const reviewOverlay = document.getElementById("review-overlay");
  const ratings = { overall: 0, worklife: 0, compensation: 0, jobsecurity: 0, management: 0, culture: 0 };

  function wireStarInput(el, key) {
    const stars = [1, 2, 3, 4, 5].map((n) => `<i class="ti ti-star" data-star="${n}" aria-hidden="true"></i>`).join("");
    el.innerHTML = stars;
    el.querySelectorAll("[data-star]").forEach((star) => {
      star.addEventListener("click", () => {
        ratings[key] = Number(star.dataset.star);
        renderStars(el, ratings[key]);
      });
    });
  }

  function renderStars(el, value) {
    el.querySelectorAll("[data-star]").forEach((star) => {
      const n = Number(star.dataset.star);
      star.className = n <= value ? "ti ti-star-filled" : "ti ti-star";
    });
  }

  wireStarInput(document.getElementById("rating-overall"), "overall");
  document.querySelectorAll(".cp-star-input--sm").forEach((el) => wireStarInput(el, el.dataset.key));

  document.getElementById("write-review-btn").addEventListener("click", () => {
    if (!userId) {
      showAlert("Please log in to write a review.");
      return;
    }
    reviewOverlay.hidden = false;
  });

  document.getElementById("review-cancel").addEventListener("click", () => { reviewOverlay.hidden = true; });

  document.getElementById("review-submit").addEventListener("click", async () => {
    const jobTitle = document.getElementById("review-job-title").value.trim();
    const location = document.getElementById("review-location").value.trim();
    const isCurrentEmployee = document.getElementById("review-current-employee").checked;
    const years = document.getElementById("review-years").value;
    const title = document.getElementById("review-title").value.trim();
    const content = document.getElementById("review-content").value.trim();

    const errEl = document.getElementById("err-review");
    errEl.textContent = "";

    if (!ratings.overall) { errEl.textContent = "Please give an overall rating."; return; }
    if (!jobTitle) { errEl.textContent = "Job title is required."; return; }
    if (!title) { errEl.textContent = "Review title is required."; return; }
    if (!content) { errEl.textContent = "Review content is required."; return; }

    const fallback = ratings.overall;
    const btn = document.getElementById("review-submit");
    btn.disabled = true;

    try {
      const response = await fetch(API_ROUTES.submitCompanyReview, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          companyId,
          reviewerId: userId,
          overallRating: ratings.overall,
          workLifeBalanceRating: ratings.worklife || fallback,
          compensationRating: ratings.compensation || fallback,
          jobSecurityRating: ratings.jobsecurity || fallback,
          managementRating: ratings.management || fallback,
          cultureRating: ratings.culture || fallback,
          title,
          content,
          jobTitle,
          location: location || null,
          isCurrentEmployee,
          yearsAtCompany: years ? Number(years) : null,
          createdBy: userId,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't submit your review.");
      }

      reviewOverlay.hidden = true;
      showAlert("Review submitted. Thank you!", true);
      delete document.getElementById("review-list").dataset.loaded;
      reviewsPage = 1;
      loadReviews();
      loadRatingSummary();

    } catch (err) {
      console.error("Submit review failed:", err);
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Init ----------------

  loadCompany();
});