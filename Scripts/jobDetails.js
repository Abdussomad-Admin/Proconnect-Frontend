document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  const urlSearchParams = new URLSearchParams(window.location.search);
  const jobId = urlSearchParams.get("id");
  const referrer = urlSearchParams.get("ref"); // forwarded to the backend as-is; unrecognized/absent values default to Direct server-side

  if (!jobId) {
    window.location.href = "job-search.html";
    return;
  }

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  let job = null;
  let isSaved = false;
  let alreadyApplied = false;

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Thin wrapper kept so every existing showAlert(message, isSuccess) call
  // site below didn't need touching — now routes to the global toast.
  function showAlert(message, isSuccess = false) {
    showToast(message, isSuccess ? "success" : "error");
  }

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function experienceLabel(level) {
    const map = { EntryLevel: "Entry Level", Junior: "Junior", MidLevel: "Mid Level", Senior: "Senior", Lead: "Lead", Executive: "Executive" };
    return map[level] || level;
  }

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Posted today";
    if (days === 1) return "Posted 1 day ago";
    if (days < 7) return `Posted ${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `Posted ${weeks} week${weeks > 1 ? "s" : ""} ago`;
    return `Posted ${Math.floor(days / 30)} month(s) ago`;
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    return `${currency} ${fmt(min || max)}+`;
  }

  // ---------------- Load job ----------------

  async function loadJob() {
    try {
      const params = new URLSearchParams();
      if (referrer) params.set("ref", referrer);
      const query = params.toString();

      const response = await fetch(`${API_ROUTES.getJob}/${jobId}${query ? `?${query}` : ""}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      document.getElementById("job-loading").hidden = true;

      if (!response.ok || !result.data) {
        showAlert(result.message || "Couldn't load this job. It may have been removed.");
        return;
      }

      job = result.data;
      renderJob();
      document.getElementById("job-content").hidden = false;

      // Non-blocking follow-ups
      checkSavedState();
      checkApplicationState();
      loadSimilarJobs();
      loadJobSkills();

    } catch (err) {
      document.getElementById("job-loading").hidden = true;
      console.error("Job fetch threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderJob() {
    document.title = `${job.title} · ProConnect`;

    document.getElementById("job-title").textContent = job.title;
    document.getElementById("company-link").textContent = job.companyName;
    document.getElementById("company-link").href = `company-profile-public.html?companyId=${job.companyId}`;

    const headerLogo = document.getElementById("header-logo");
    if (job.companyLogoUrl) {
      headerLogo.innerHTML = `<img src="${escapeHtml(job.companyLogoUrl)}" alt="" />`;
    }

    document.getElementById("meta-location").innerHTML = `<i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(job.location)}`;
    document.getElementById("meta-workplace").innerHTML = `<i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${job.workPlaceType}`;
    document.getElementById("meta-employment").innerHTML = `<i class="ti ti-briefcase" aria-hidden="true"></i> ${employmentLabel(job.employmentType)}`;
    document.getElementById("meta-experience").innerHTML = `<i class="ti ti-award" aria-hidden="true"></i> ${experienceLabel(job.experienceLevel)}`;

    const salary = formatSalary(job.minSalary, job.maxSalary, job.currency);
    const tags = document.getElementById("header-tags");
    tags.innerHTML = [
      salary ? `<span class="jd-tag">${escapeHtml(salary)}</span>` : "",
      `<span class="jd-tag">${escapeHtml(job.categoryName)}</span>`,
    ].join("");

    document.getElementById("posted-info").textContent =
      `${timeAgo(job.dateCreated)} · Application deadline: ${new Date(job.applicationDeadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

    document.getElementById("job-description").textContent = job.description;

    const reqList = document.getElementById("job-requirements");
    const reqLines = job.requirement.split("\n").map((l) => l.trim()).filter(Boolean);
    reqList.innerHTML = (reqLines.length > 0 ? reqLines : [job.requirement])
      .map((line) => `<li>${escapeHtml(line)}</li>`).join("");

    document.getElementById("detail-employment").textContent = employmentLabel(job.employmentType);
    document.getElementById("detail-experience").textContent = experienceLabel(job.experienceLevel);
    document.getElementById("detail-workplace").textContent = job.workPlaceType;
    document.getElementById("detail-location").textContent = job.location;

    document.getElementById("company-name-inline").textContent = job.companyName;
    document.getElementById("about-company-name").textContent = job.companyName;
    document.getElementById("about-company-summary").textContent =
      "This is what we know about the company from the job listing. A fuller company profile isn't wired up on this page yet.";
    document.getElementById("view-company-profile-btn").href = `company-public-profile.html?companyId=${job.companyId}`;
    document.getElementById("view-full-company-btn").href = `company-public-profile.html?companyId=${job.companyId}`;

    document.getElementById("sticky-company-name").textContent = job.companyName;

    const applyHref = `apply-job.html?id=${job.id}`;
    document.getElementById("apply-btn").href = applyHref;
    document.getElementById("sticky-apply-btn").href = applyHref;

    if (job.status !== "Active") {
      setApplyDisabled("This job is no longer accepting applications.");
    } else if (new Date(job.applicationDeadline) < new Date()) {
      setApplyDisabled("The application deadline has passed.");
    }
  }

  function setApplyDisabled(reason) {
    [document.getElementById("apply-btn"), document.getElementById("sticky-apply-btn")].forEach((btn) => {
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("is-disabled");
      btn.removeAttribute("href");
      btn.title = reason;
      btn.textContent = "Applications closed";
    });
  }

  // ---------------- Skills tags ----------------

  async function loadJobSkills() {
    try {
      const response = await fetch(`${API_ROUTES.getJobSkills}/${jobId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data && result.data.length > 0) {
        document.getElementById("skills-card").hidden = false;
        document.getElementById("skills-list").innerHTML = result.data
          .map((s) => `<span class="jd-skill-tag">${escapeHtml(s.skillName)}</span>`)
          .join("");
      }
    } catch (err) {
      console.error("Job skills fetch threw an error:", err);
    }
  }

  // ---------------- Tabs ----------------

  document.querySelectorAll(".jd-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".jd-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelectorAll(".jd-panel").forEach((p) => (p.hidden = true));
      document.getElementById(`panel-${tab.dataset.tab}`).hidden = false;
    });
  });

  // ---------------- Save toggle ----------------

  async function checkSavedState() {
    try {
      const params = new URLSearchParams({ professionalProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getSavedJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        isSaved = (result.data.items || []).some((s) => s.jobId === jobId);
        updateSaveButton();
      }
    } catch (err) {
      console.error("Saved-state check threw an error:", err);
    }
  }

  function updateSaveButton() {
    const btn = document.getElementById("save-btn");
    btn.classList.toggle("is-saved", isSaved);
    btn.innerHTML = isSaved
      ? `<i class="ti ti-bookmark-filled" aria-hidden="true"></i> Saved`
      : `<i class="ti ti-bookmark" aria-hidden="true"></i> Save job`;
  }

  document.getElementById("save-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    try {
      const endpoint = isSaved ? API_ROUTES.unsaveJob : API_ROUTES.saveJob;
      const body = isSaved
        ? { jobId, professionalProfileId }
        : { jobId, professionalProfileId, createdBy: userId || "unknown" };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't update saved jobs.");
      }
      isSaved = !isSaved;
      updateSaveButton();
    } catch (err) {
      console.error("Save/unsave failed:", err);
      showAlert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Share ----------------

  document.getElementById("share-btn").addEventListener("click", async () => {
    const btn = document.getElementById("share-btn");
    try {
      // Tag as "external" rather than stripping ref entirely — we know
      // this specific link is a copied share, not organic direct
      // navigation, so ExternalLink is the accurate bucket for whoever
      // opens it next.
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("ref", "external");
      await navigator.clipboard.writeText(shareUrl.toString());
      const original = btn.innerHTML;
      btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Link copied!`;
      setTimeout(() => { btn.innerHTML = original; }, 1500);
    } catch (err) {
      console.error("Couldn't copy link:", err);
    }
  });

  // ---------------- Already-applied check ----------------

  async function checkApplicationState() {
    try {
      const params = new URLSearchParams({ professionalProfileId, usePaging: "false" });
      const response = await fetch(`${API_ROUTES.getApplicationsByProfessional}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        alreadyApplied = (result.data.items || []).some((a) => a.jobId === jobId);
        if (alreadyApplied) {
          [document.getElementById("apply-btn"), document.getElementById("sticky-apply-btn")].forEach((btn) => {
            btn.textContent = "Already applied";
            btn.href = "my-applications.html";
          });
        }
      }
    } catch (err) {
      console.error("Application-state check threw an error:", err);
    }
  }

  // ---------------- Similar jobs ----------------

  async function loadSimilarJobs() {
    try {
      const params = new URLSearchParams({
        jobCategoryId: job.jobCategoryId,
        pageNumber: 1,
        pageSize: 4,
        usePaging: "true",
        sortBy: "Newest",
      });
      const response = await fetch(`${API_ROUTES.searchJobs}?${params.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.data) {
        const others = (result.data.items || []).filter((j) => j.id !== jobId).slice(0, 3);
        if (others.length > 0) {
          document.getElementById("similar-jobs-card").hidden = false;
          // Tagged "other" — an algorithmic "similar jobs" suggestion by
          // category, same bucket as the Recommended tab on job-search.html,
          // not a literal search or network action.
          document.getElementById("similar-jobs-list").innerHTML = others.map((j) => `
            <a href="job-details.html?id=${j.id}&ref=other" class="jd-similar-job">
              <p class="jd-similar-job__title">${escapeHtml(j.title)}</p>
              <p class="jd-similar-job__meta">${escapeHtml(j.companyName)} · ${escapeHtml(j.location)}</p>
            </a>
          `).join("");
        }
      }
    } catch (err) {
      console.error("Similar jobs fetch threw an error:", err);
    }
  }

  // ---------------- Init ----------------

  loadJob();
});