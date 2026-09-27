document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const professionalProfileId = localStorage.getItem("pc_profile_id");
  const userId = localStorage.getItem("pc_user_id");

  const jobId = new URLSearchParams(window.location.search).get("id");
  if (!jobId) {
    window.location.href = "job-search.html";
    return;
  }

  if (!token || !professionalProfileId) {
    window.location.href = "login.html";
    return;
  }

  let job = null;
  let profileResumeUrl = null;
  let uploadedResume = null; // { url, publicId, fileName }
  let currentStep = 1;
  const totalSteps = 5;

  document.getElementById("back-link").href = `job-details.html?id=${jobId}`;
  document.getElementById("save-exit-1").href = `job-details.html?id=${jobId}`;

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

  function employmentLabel(type) {
    const map = { FullTime: "Full-time", PartTime: "Part-time", Contract: "Contract", Internship: "Internship", Freelance: "Freelance", Temporary: "Temporary", Remote: "Remote" };
    return map[type] || type;
  }

  function formatSalary(min, max, currency) {
    if (!min && !max) return null;
    const fmt = (n) => n >= 1000 ? `${Math.round(n / 1000)}k` : n;
    if (min && max) return `${currency} ${fmt(min)} - ${fmt(max)}`;
    return `${currency} ${fmt(min || max)}+`;
  }

  const WORK_AUTH_LABELS = {
    AuthorizedNoSponsorship: "Authorized — no sponsorship needed",
    RequiresSponsorship: "Will need sponsorship now or in the future",
    NotAuthorized: "Not authorized",
  };

  // ---------------- Load job + profile ----------------

  async function loadData() {
    try {
      const [jobResponse, profileResponse, applicationsResponse] = await Promise.all([
        fetch(`${API_ROUTES.getJob}/${jobId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ROUTES.professionalProfile}/${professionalProfileId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ROUTES.getApplicationsByProfessional}?${new URLSearchParams({ professionalProfileId, usePaging: "false" })}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (jobResponse.status === 401 || profileResponse.status === 401) {
        window.location.href = "login.html?reason=session-expired";
        return;
      }

      const jobResult = await jobResponse.json().catch(() => ({}));
      const profileResult = await profileResponse.json().catch(() => ({}));
      const applicationsResult = await applicationsResponse.json().catch(() => ({}));

      document.getElementById("page-loading").hidden = true;

      if (!jobResponse.ok || !jobResult.data) {
        showAlert(jobResult.message || "Couldn't load this job.");
        return;
      }

      job = jobResult.data;

      if (job.status !== "Active") {
        showAlert("This job is no longer accepting applications.");
        return;
      }
      if (new Date(job.applicationDeadline) < new Date()) {
        showAlert("The application deadline for this job has passed.");
        return;
      }

      const alreadyApplied = applicationsResult.data &&
        (applicationsResult.data.items || []).some((a) => a.jobId === jobId);

      if (alreadyApplied) {
        showAlert("You've already applied to this job.");
        setTimeout(() => { window.location.href = "my-applications.html"; }, 1500);
        return;
      }

      renderJobSummary();

      if (profileResponse.ok && profileResult.data) {
        prefillFromProfile(profileResult.data);
      }

      document.getElementById("apply-content").hidden = false;

    } catch (err) {
      document.getElementById("page-loading").hidden = true;
      console.error("Apply page load threw an error:", err);
      showAlert("Couldn't reach the server. Check your connection and try again.");
    }
  }

  function renderJobSummary() {
    document.getElementById("job-title-heading").textContent = job.title;
    document.getElementById("view-job-details-link").href = `job-details.html?id=${jobId}`;

    document.getElementById("chip-title").textContent = job.title;
    document.getElementById("chip-meta").textContent = job.companyName;
    document.getElementById("summary-title").textContent = job.title;
    document.getElementById("summary-company").textContent = job.companyName;

    [document.getElementById("chip-logo"), document.getElementById("summary-logo")].forEach((logo) => {
      if (job.companyLogoUrl) logo.innerHTML = `<img src="${escapeHtml(job.companyLogoUrl)}" alt="" />`;
    });

    document.getElementById("summary-location").innerHTML = `<i class="ti ti-map-pin" aria-hidden="true"></i> ${escapeHtml(job.location)}`;
    document.getElementById("summary-workplace").innerHTML = `<i class="ti ti-building-skyscraper" aria-hidden="true"></i> ${job.workPlaceType}`;
    document.getElementById("summary-employment").innerHTML = `<i class="ti ti-briefcase" aria-hidden="true"></i> ${employmentLabel(job.employmentType)}`;

    const salary = formatSalary(job.minSalary, job.maxSalary, job.currency);
    if (salary) {
      const el = document.getElementById("summary-salary");
      el.innerHTML = `<i class="ti ti-cash" aria-hidden="true"></i> ${escapeHtml(salary)}`;
      el.hidden = false;
    }

    document.getElementById("submitted-job-title").textContent = job.title;
    document.getElementById("submitted-company").textContent = job.companyName;
  }

  function prefillFromProfile(profile) {
    const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
    document.getElementById("display-name").value = fullName || "—";
    document.getElementById("display-email").value = profile.email || "—";

    document.getElementById("input-phone").value = profile.phone || "";
    document.getElementById("input-location").value = profile.location || "";
    document.getElementById("input-linkedin").value = profile.linkedInUrl || "";

    const currentExp = (profile.experiences || []).find((e) => e.isCurrentJob);
    if (currentExp) {
      document.getElementById("input-job-title").value = currentExp.jobTitle || "";
    }

    profileResumeUrl = profile.resumeUrl || null;
    const resumeOption = document.getElementById("use-profile-resume-option");
    if (profileResumeUrl) {
      resumeOption.hidden = false;
      document.getElementById("profile-resume-name").textContent =
        profile.resumeFileName || "Resume on your profile";
    } else {
      resumeOption.hidden = true;
      document.querySelector('input[name="resume-source"][value="upload"]').checked = true;
      document.getElementById("upload-zone").hidden = false;
    }
  }

  // ---------------- Stepper ----------------

  function goToStep(step) {
    currentStep = step;

    document.querySelectorAll(".aj-step-panel").forEach((p) => p.classList.remove("is-active"));
    document.getElementById(`step-${step}`).classList.add("is-active");

    document.querySelectorAll(".aj-step").forEach((s) => {
      const stepNum = Number(s.dataset.step);
      s.classList.toggle("is-active", stepNum === step);
      s.classList.toggle("is-complete", stepNum < step);
    });

    document.getElementById("progress-step-label").textContent = `Step ${step} of ${totalSteps}`;
    document.getElementById("progress-pct").textContent = `${Math.round((step / totalSteps) * 100)}% complete`;
    document.getElementById("progress-bar").style.width = `${(step / totalSteps) * 100}%`;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateChecklist() {
    const resumeItem = document.getElementById("checklist-resume");
    const hasResume = getSelectedResumeUrl() !== null;
    resumeItem.classList.toggle("is-done", hasResume);
    resumeItem.querySelector("span").textContent = hasResume ? "Added" : "Not added";

    const coverItem = document.getElementById("checklist-cover");
    const hasCover = document.getElementById("cover-letter").value.trim().length > 0;
    coverItem.classList.toggle("is-done", hasCover);
    coverItem.querySelector("span").textContent = hasCover ? "Added" : "Not added";

    const authItem = document.getElementById("checklist-auth");
    const hasAuth = !!document.querySelector('input[name="work-auth"]:checked');
    authItem.classList.toggle("is-done", hasAuth);
    authItem.querySelector("span").textContent = hasAuth ? "Answered" : "Pending";
  }

  // ---------------- Step 1 ----------------

  document.getElementById("next-1").addEventListener("click", () => {
    document.getElementById("err-work-auth").textContent = "";
    const workAuth = document.querySelector('input[name="work-auth"]:checked');
    if (!workAuth) {
      document.getElementById("err-work-auth").textContent = "Please select your work authorization status.";
      return;
    }
    updateChecklist();
    goToStep(2);
  });

  // ---------------- Step 2: Resume ----------------

  document.querySelectorAll('input[name="resume-source"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.getElementById("upload-zone").hidden = radio.value !== "upload";
    });
  });

  document.getElementById("choose-file-btn").addEventListener("click", () => {
    document.getElementById("resume-file-input").click();
  });

  document.getElementById("resume-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      document.getElementById("upload-status").textContent = "File too large (max 5MB).";
      e.target.value = "";
      return;
    }

    document.getElementById("upload-file-name").textContent = file.name;
    document.getElementById("upload-status").textContent = "Uploading...";

    const formData = new FormData();
    formData.append("File", file);

    try {
      const response = await fetch(API_ROUTES.uploadApplicationResume, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.data) {
        throw new Error(result.message || "Couldn't upload your resume.");
      }

      uploadedResume = {
        url: result.data.resumeUrl,
        publicId: result.data.resumePublicId,
        fileName: result.data.fileName,
      };

      document.getElementById("upload-status").textContent = "Uploaded ✓";
      updateChecklist();

    } catch (err) {
      console.error("Resume upload failed:", err);
      document.getElementById("upload-status").textContent = "Upload failed — try again.";
      uploadedResume = null;
    }
  });

  function getSelectedResumeUrl() {
    const source = document.querySelector('input[name="resume-source"]:checked')?.value;
    if (source === "profile") return profileResumeUrl;
    return uploadedResume ? uploadedResume.url : null;
  }

  document.getElementById("back-2").addEventListener("click", () => goToStep(1));

  document.getElementById("next-2").addEventListener("click", () => {
    document.getElementById("err-resume").textContent = "";
    if (!getSelectedResumeUrl()) {
      document.getElementById("err-resume").textContent = "Please provide a resume before continuing.";
      return;
    }
    updateChecklist();
    goToStep(3);
  });

  // ---------------- Step 3: Additional Info ----------------

  const coverLetterInput = document.getElementById("cover-letter");
  coverLetterInput.addEventListener("input", () => {
    document.getElementById("cover-letter-count").textContent = coverLetterInput.value.length;
  });

  document.getElementById("back-3").addEventListener("click", () => goToStep(2));

  document.getElementById("next-3").addEventListener("click", () => {
    document.getElementById("err-cover-letter").textContent = "";
    if (!coverLetterInput.value.trim()) {
      document.getElementById("err-cover-letter").textContent = "A cover letter is required.";
      return;
    }
    updateChecklist();
    populateReview();
    goToStep(4);
  });

  // ---------------- Step 4: Review ----------------

  function populateReview() {
    const name = document.getElementById("display-name").value;
    const phone = document.getElementById("input-phone").value.trim();
    const location = document.getElementById("input-location").value.trim();
    const jobTitle = document.getElementById("input-job-title").value.trim();
    const years = document.getElementById("input-years-exp").value;
    const linkedin = document.getElementById("input-linkedin").value.trim();

    const personalLines = [
      name,
      phone ? `Phone: ${phone}` : null,
      location ? `Location: ${location}` : null,
      jobTitle ? `Current title: ${jobTitle}` : null,
      years ? `Years of experience: ${years}` : null,
      linkedin ? `LinkedIn: ${linkedin}` : null,
    ].filter(Boolean);
    document.getElementById("review-personal").textContent = personalLines.join("\n");

    const workAuth = document.querySelector('input[name="work-auth"]:checked')?.value;
    document.getElementById("review-work-auth").textContent = WORK_AUTH_LABELS[workAuth] || "—";

    const source = document.querySelector('input[name="resume-source"]:checked')?.value;
    document.getElementById("review-resume").textContent =
      source === "profile" ? "Using resume from your profile" : (uploadedResume ? uploadedResume.fileName : "—");

    document.getElementById("review-cover-letter").textContent = coverLetterInput.value.trim();

    const additional = document.getElementById("additional-info").value.trim();
    const block = document.getElementById("review-additional-block");
    if (additional) {
      document.getElementById("review-additional").textContent = additional;
      block.hidden = false;
    } else {
      block.hidden = true;
    }
  }

  document.getElementById("back-4").addEventListener("click", () => goToStep(3));

  // ---------------- Submit ----------------

  document.getElementById("submit-application").addEventListener("click", async () => {
    const btn = document.getElementById("submit-application");
    btn.disabled = true;
    btn.textContent = "Submitting...";

    const workAuth = document.querySelector('input[name="work-auth"]:checked')?.value;
    const additionalInfo = document.getElementById("additional-info").value.trim();
    const source = document.querySelector('input[name="resume-source"]:checked')?.value;

    const resumeUrl = source === "profile" ? profileResumeUrl : (uploadedResume ? uploadedResume.url : null);
    const resumePublicId = source === "upload" && uploadedResume ? uploadedResume.publicId : null;

    const years = document.getElementById("input-years-exp").value;

    const payload = {
      jobId,
      professionalProfileId,
      coverLetter: coverLetterInput.value.trim(),
      resumeUrl,
      resumePublicId,
      workAuthorization: workAuth,
      additionalAnswers: additionalInfo
        ? JSON.stringify([{ question: "Anything else you'd like to share?", answer: additionalInfo }])
        : null,
      applicantPhone: document.getElementById("input-phone").value.trim() || null,
      applicantLocation: document.getElementById("input-location").value.trim() || null,
      applicantCurrentJobTitle: document.getElementById("input-job-title").value.trim() || null,
      applicantYearsOfExperience: years ? Number(years) : null,
      applicantLinkedInUrl: document.getElementById("input-linkedin").value.trim() || null,
      createdBy: userId || "unknown",
    };

    try {
      const response = await fetch(API_ROUTES.applyJob, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Couldn't submit your application. Please try again.");
      }

      goToStep(5);

    } catch (err) {
      console.error("Submit application failed:", err);
      showAlert(err.message);
      btn.disabled = false;
      btn.textContent = "Submit Application";
    }
  });

  // ---------------- Init ----------------

  await loadData();
});