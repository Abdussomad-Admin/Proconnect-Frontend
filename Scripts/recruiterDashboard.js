document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("loading-state");
  const dashboardContent = document.getElementById("dashboard-content");

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");
  const recruiterProfileId = localStorage.getItem("pc_profile_id");
  const username = localStorage.getItem("pc_username") || "there";
  const firstName = username.split(" ")[0];

  document.getElementById("welcome-message").textContent =
    `Welcome back, ${firstName}! Here's what's happening with your hiring.`;

  // JobStatus enum order from the backend (used only if the API serializes enums as numbers).
  const STAGE_NAMES = ["New", "Screening", "Shortlisted", "Interview", "Offered", "Hired", "Rejected", "Withdrawn"];

  // ---------------- Helpers ----------------

  function showAlert(message) {
    showToast(message, "error");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  // MySQL/EF dates often arrive without a "Z" suffix, which the browser would read as
  // local time. Everything is stored in UTC, so force UTC when no zone is present.
  // Default .NET dates (year 0001) are treated as "no value".
  function parseUtc(value) {
    if (!value) return null;
    const text = String(value);
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text);
    const date = new Date(hasZone ? text : `${text}Z`);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return null;
    return date;
  }

  // UTC wall-clock without "Z" or milliseconds, so ASP.NET binds it as-is.
  function toApiDate(date) {
    return date.toISOString().slice(0, 19);
  }

  function ymd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  // Calendar weeks run Monday to Sunday in the viewer's local time.
  function startOfWeek(offsetWeeks) {
    const now = new Date();
    const sinceMonday = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday - offsetWeeks * 7);
  }

  function endOfWeek(start) {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
  }

  function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function formatDateTime(date) {
    return date
      ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "—";
  }

  function formatDate(date) {
    return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  }

  function formatTime(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function timeAgo(date) {
    if (!date) return "";
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function postedAgo(date) {
    if (!date) return "—";
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days < 1) return "Today";
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    if (days < 35) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    return formatDate(date);
  }

  function stageName(value) {
    const text = typeof value === "number" ? STAGE_NAMES[value] || String(value) : String(value || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function isLiveCandidate(application) {
    const stage = stageName(application.jobStatus);
    return stage !== "Rejected" && stage !== "Withdrawn";
  }

  function initialsOf(first, last) {
    return `${(first || "").charAt(0)}${(last || "").charAt(0)}`.toUpperCase();
  }

  // InterviewType is a free string on the backend, so match by keyword.
  function describeInterview(type, locationOrLink) {
    const text = String(type || "").trim();
    const lower = text.toLowerCase();
    const isLink = /^https?:/i.test(String(locationOrLink || ""));

    if (/video|online|virtual|remote|zoom|meet|teams/.test(lower) || (!text && isLink)) {
      return { label: "Video Interview", icon: "ti-video" };
    }
    if (/phone|call/.test(lower)) {
      return { label: "Phone Interview", icon: "ti-phone" };
    }
    if (/onsite|on-site|in-person|in person|office|physical/.test(lower)) {
      return { label: "Onsite Interview", icon: "ti-map-pin" };
    }
    if (text) {
      return { label: /interview/i.test(text) ? text : `${text} Interview`, icon: isLink ? "ti-video" : "ti-map-pin" };
    }
    return { label: "Interview", icon: "ti-map-pin" };
  }

  // Returns the response's `data`, or null if the request failed.
  async function apiGet(url, params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.append(key, value);
    });

    try {
      const response = await fetch(`${url}?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.data === undefined || result.data === null) return null;
      return result.data;
    } catch (err) {
      console.error(`Request to ${url} threw an error:`, err);
      return null;
    }
  }

  // ---------------- Data shaping ----------------

  function buildDailySeries(applications, weekStart) {
    const counts = {};
    applications.forEach((a) => {
      const applied = parseUtc(a.appliedAt);
      if (applied) counts[ymd(applied)] = (counts[ymd(applied)] || 0) + 1;
    });

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      return {
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        count: counts[ymd(day)] || 0,
      };
    });
  }

  function sumCounts(series) {
    return series.reduce((total, day) => total + day.count, 0);
  }

  // Upcoming interviews per job (count + earliest), from the loaded applications.
  function upcomingInterviewsByJob(applications) {
    const now = new Date();
    const byJob = new Map();

    applications.forEach((a) => {
      const when = parseUtc(a.interviewScheduledAt);
      if (!when || when < now || !isLiveCandidate(a)) return;

      const entry = byJob.get(a.jobId) || { count: 0, next: null };
      entry.count += 1;
      if (!entry.next || when < entry.next) entry.next = when;
      byJob.set(a.jobId, entry);
    });

    return byJob;
  }

  function niceStep(raw) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(1, nice * magnitude);
  }

  // ---------------- Stat cards ----------------

  function weeklyDelta(current, previous) {
    if (current === null || previous === null) {
      return `<div class="stat-card__caption">This week</div>`;
    }
    if (previous === 0) {
      return `<div class="stat-card__caption">0 last week</div>`;
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) {
      return `<div class="stat-card__caption">Same as last week</div>`;
    }
    const down = pct < 0;
    return `<div class="stat-card__delta${down ? " stat-card__delta--down" : ""}">
      <i class="ti ${down ? "ti-arrow-down" : "ti-arrow-up"}" aria-hidden="true"></i>${Math.abs(pct)}% vs last week
    </div>`;
  }

  function renderStatCards(m) {
    const cards = [
      { icon: "ti-briefcase", tone: "purple", value: m.openJobs, label: "Open Jobs", footer: `<div class="stat-card__caption">Active postings</div>` },
      { icon: "ti-user-plus", tone: "green", value: m.newApplications, label: "New Applications", footer: weeklyDelta(m.newApplications, m.lastWeekApplications) },
      { icon: "ti-calendar", tone: "blue", value: m.interviewsThisWeek, label: "Interviews Scheduled", footer: `<div class="stat-card__caption">This week</div>` },
      { icon: "ti-star", tone: "orange", value: m.offers, label: "Offers Extended", footer: `<div class="stat-card__caption">Currently out</div>` },
      { icon: "ti-user-check", tone: "purple", value: m.hires, label: "Hires This Month", footer: `<div class="stat-card__caption">Marked as hired</div>` },
    ];

    const iconBg = {
      purple: "var(--pc-purple-light)",
      green: "var(--pc-success-bg)",
      blue: "#E5EEFF",
      orange: "#FDEFE0",
    };
    const iconColor = {
      purple: "var(--pc-purple)",
      green: "var(--pc-success)",
      blue: "#2563EB",
      orange: "#D97706",
    };

    document.getElementById("stat-cards").innerHTML = cards
      .map(
        (c) => `
        <div class="stat-card">
          <span class="stat-card__icon" style="background:${iconBg[c.tone]};color:${iconColor[c.tone]};">
            <i class="ti ${c.icon}" aria-hidden="true"></i>
          </span>
          <div>
            <div class="stat-card__value">${c.value ?? "—"}</div>
            <div class="stat-card__label">${c.label}</div>
            ${c.footer}
          </div>
        </div>`
      )
      .join("");
  }

  // ---------------- Hiring pipeline: SVG funnel ----------------
  // Counts are the current stage of each application, so they don't always shrink
  // stage by stage. Shape widths are clamped to keep the funnel look; the numbers are real.

  function renderPipeline(statusCounts) {
    const container = document.getElementById("pipeline-funnel");

    if (!statusCounts) {
      container.innerHTML = `<p class="empty-hint">Couldn't load your pipeline.</p>`;
      return;
    }

    if (!statusCounts.all) {
      container.innerHTML = `<p class="empty-hint">No applications yet — your pipeline will fill up once candidates start applying.</p>`;
      return;
    }

    const stages = [
      { label: "Applications", value: statusCounts.all },
      { label: "Screening", value: statusCounts.screening },
      { label: "Shortlisted", value: statusCounts.shortlisted },
      { label: "Interview", value: statusCounts.interview },
      { label: "Offered", value: statusCounts.offered },
      { label: "Hired", value: statusCounts.hired },
    ];
    const colors = ["#8B7CF0", "#A9A0F5", "#9FD8D0", "#F6D77A", "#F3A977", "#F2847C"];

    const H = 40, GAP = 4, MAX_W = 190, MIN_W = 40, CX = 100;
    const widths = stages.map((s) => Math.max((s.value / statusCounts.all) * MAX_W, MIN_W));
    for (let i = 1; i < widths.length; i++) widths[i] = Math.min(widths[i], widths[i - 1]);

    const shapes = stages.map((s, i) => {
      const y = i * (H + GAP);
      const top = widths[i];
      const bottom = i < widths.length - 1 ? widths[i + 1] : top * 0.7;
      const midY = y + H / 2;
      const points = `${CX - top / 2},${y} ${CX + top / 2},${y} ${CX + bottom / 2},${y + H} ${CX - bottom / 2},${y + H}`;

      return `
        <polygon points="${points}" fill="${colors[i]}"></polygon>
        <line x1="${CX + (top + bottom) / 4 + 6}" y1="${midY}" x2="215" y2="${midY}" stroke="#D9D7E8" stroke-dasharray="2 3"></line>
        <text x="225" y="${midY - 2}" class="funnel-value">${s.value}</text>
        <text x="225" y="${midY + 13}" class="funnel-label">${escapeHtml(s.label)}</text>`;
    });

    const totalHeight = stages.length * (H + GAP) - GAP;
    container.innerHTML = `<svg viewBox="0 0 340 ${totalHeight}" role="img" aria-label="Hiring pipeline funnel">${shapes.join("")}</svg>`;
  }

  function populateJobSelect(jobs) {
    const select = document.getElementById("pipeline-job-select");
    if (!jobs) return;

    const options = [...jobs]
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
      .map((j) => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.title)}</option>`)
      .join("");

    select.innerHTML = `<option value="">All Jobs</option>${options}`;
  }

  // ---------------- Applications Overview: SVG line chart ----------------

  function renderApplicationsChart(thisSeries, lastSeries, statusCounts, avgDaysToHire) {
    const container = document.getElementById("applications-chart");
    const statsEl = document.getElementById("chart-stats");

    if (!thisSeries || !lastSeries) {
      container.innerHTML = `<p class="empty-hint">Couldn't load application activity.</p>`;
      statsEl.innerHTML = "";
      return;
    }

    const thisTotal = sumCounts(thisSeries);
    const lastTotal = sumCounts(lastSeries);

    if (thisTotal === 0 && lastTotal === 0) {
      container.innerHTML = `<p class="empty-hint">No applications in the last two weeks yet.</p>`;
      statsEl.innerHTML = "";
      return;
    }

    const W = 600, H = 220, L = 36, R = 12, T = 12, B = 26;
    const max = Math.max(1, ...thisSeries.map((d) => d.count), ...lastSeries.map((d) => d.count));
    const step = niceStep(max / 4);
    const yMax = step * 4;
    const x = (i) => L + (i / 6) * (W - L - R);
    const y = (v) => T + (1 - v / yMax) * (H - T - B);

    // This week's line stops at today: later days haven't happened, they aren't zero.
    const todayIndex = (new Date().getDay() + 6) % 7;
    const thisPoints = thisSeries.slice(0, todayIndex + 1).map((d, i) => ({ i, count: d.count }));
    const lastPoints = lastSeries.map((d, i) => ({ i, count: d.count }));
    const toPath = (points) =>
      points.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");

    const grid = [0, 1, 2, 3, 4]
      .map((k) => {
        const value = k * step;
        return `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" stroke="#ECEBF5"></line>
                <text x="${L - 8}" y="${y(value) + 4}" text-anchor="end" class="chart-axis">${value}</text>`;
      })
      .join("");

    const xLabels = thisSeries
      .map((d, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="chart-axis">${d.label}</text>`)
      .join("");

    const lastDots = lastPoints
      .map((p) => `<circle cx="${x(p.i)}" cy="${y(p.count)}" r="2.5" fill="#fff" stroke="#C9C3F5" stroke-width="1.5"><title>Last ${lastSeries[p.i].label}: ${p.count}</title></circle>`)
      .join("");

    const thisDots = thisPoints
      .map((p) => `<circle cx="${x(p.i)}" cy="${y(p.count)}" r="3.5" fill="#fff" stroke="#5B3FE0" stroke-width="2"><title>${thisSeries[p.i].label}: ${p.count}</title></circle>`)
      .join("");

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Applications this week compared with last week">
        ${grid}
        ${xLabels}
        <path d="${toPath(lastPoints)}" fill="none" stroke="#C9C3F5" stroke-width="2" stroke-dasharray="5 4"></path>
        ${lastDots}
        <path d="${toPath(thisPoints)}" fill="none" stroke="#5B3FE0" stroke-width="2.5"></path>
        ${thisDots}
      </svg>`;

    const hireRate = statusCounts && statusCounts.all
      ? `${((statusCounts.hired / statusCounts.all) * 100).toFixed(1)}%`
      : "—";
    const avgDays = avgDaysToHire !== null && avgDaysToHire !== undefined ? avgDaysToHire : "—";

    const stat = (value, label) =>
      `<div class="chart-stat"><div class="chart-stat__value">${value}</div><div class="chart-stat__label">${label}</div></div>`;

    statsEl.innerHTML =
      stat(thisTotal, "Applications This Week") +
      stat(lastTotal, "Applications Last Week") +
      stat(hireRate, "Hire Rate (all time)") +
      stat(avgDays, "Avg. Days to Hire");
  }

  // ---------------- Applications by Source ----------------
  // JobApplication has no source field yet, so this stays an empty state.

  function renderDonutPlaceholder() {
    document.getElementById("donut-chart").innerHTML =
      `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="46" fill="none" style="stroke:var(--pc-border)" stroke-width="18"></circle></svg>`;
    document.getElementById("donut-legend").innerHTML =
      `<li class="empty-hint">Source tracking isn't available on applications yet.</li>`;
  }

  // ---------------- My Open Jobs table ----------------

  function renderOpenJobsTable(jobs, interviewsByJob) {
    const tbody = document.getElementById("open-jobs-table-body");
    const emptyHint = document.getElementById("jobs-empty-hint");

    if (jobs === null) {
      tbody.innerHTML = "";
      emptyHint.textContent = "Couldn't load your jobs.";
      emptyHint.hidden = false;
      return;
    }

    if (!jobs.length) {
      tbody.innerHTML = "";
      emptyHint.textContent = "You don't have any open jobs yet.";
      emptyHint.hidden = false;
      return;
    }

    emptyHint.hidden = true;

    const rows = [...jobs]
      .sort((a, b) => (parseUtc(b.dateCreated)?.getTime() || 0) - (parseUtc(a.dateCreated)?.getTime() || 0))
      .slice(0, 6);

    tbody.innerHTML = rows
      .map((j) => {
        const entry = interviewsByJob ? interviewsByJob.get(j.id) : null;
        const interviewCount = interviewsByJob ? (entry ? entry.count : 0) : "—";
        const nextInterview = entry && entry.next ? formatDateTime(entry.next) : "—";

        return `
        <tr>
          <td>${escapeHtml(j.title)}</td>
          <td>${j.applicantCount ?? "—"}</td>
          <td>${interviewCount}</td>
          <td>${nextInterview}</td>
          <td><span class="rd-status-pill rd-status-pill--open">Open</span></td>
          <td>${postedAgo(parseUtc(j.dateCreated))}</td>
          <td><button type="button" class="row-menu-btn" aria-label="More options"><i class="ti ti-dots-vertical" aria-hidden="true"></i></button></td>
        </tr>`;
      })
      .join("");
  }

  // ---------------- Top Open Jobs ----------------

  function renderTopJobs(jobs) {
    const container = document.getElementById("top-jobs-list");

    if (jobs === null) {
      container.innerHTML = `<p class="empty-hint">Couldn't load your jobs.</p>`;
      return;
    }

    if (!jobs.length) {
      container.innerHTML = `<p class="empty-hint">No open jobs yet.</p>`;
      return;
    }

    const top = [...jobs].sort((a, b) => (b.applicantCount ?? 0) - (a.applicantCount ?? 0)).slice(0, 5);

    container.innerHTML = top
      .map((j) => {
        const meta = [j.categoryName, j.location].filter(Boolean).map(escapeHtml).join(" • ");
        return `
        <div class="top-job-row">
          <span class="top-job-row__icon"><i class="ti ti-briefcase" aria-hidden="true"></i></span>
          <div class="top-job-row__info">
            <div class="top-job-row__title">${escapeHtml(j.title)}</div>
            <div class="top-job-row__meta">${meta}</div>
          </div>
          <div class="top-job-row__count">
            ${j.applicantCount ?? "—"}
            <span>Applications</span>
          </div>
        </div>`;
      })
      .join("");
  }

  // ---------------- Interviews This Week ----------------

  function renderInterviewsThisWeek(applications, weekEnd) {
    const container = document.getElementById("interviews-list");
    const emptyHint = document.getElementById("interviews-empty-hint");

    if (applications === null) {
      container.innerHTML = "";
      emptyHint.textContent = "Couldn't load interviews.";
      emptyHint.hidden = false;
      return;
    }

    const from = startOfToday();

    const upcoming = applications
      .map((a) => ({ application: a, when: parseUtc(a.interviewScheduledAt) }))
      .filter((x) => x.when && x.when >= from && x.when <= weekEnd && isLiveCandidate(x.application))
      .sort((a, b) => a.when - b.when)
      .slice(0, 4);

    if (!upcoming.length) {
      container.innerHTML = "";
      emptyHint.textContent = "No interviews scheduled this week.";
      emptyHint.hidden = false;
      return;
    }

    emptyHint.hidden = true;

    container.innerHTML = upcoming
      .map(({ application: a, when }) => {
        const month = when.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
        const type = describeInterview(a.interviewType, a.interviewLocationOrLink);
        const avatar = a.profilePictureUrl
          ? `<img src="${escapeHtml(a.profilePictureUrl)}" alt="" />`
          : escapeHtml(initialsOf(a.firstName, a.lastName));

        return `
        <div class="interview-row">
          <div class="interview-row__date">${month}<span>${when.getDate()}</span></div>
          <span class="interview-row__avatar">${avatar}</span>
          <div class="interview-row__info">
            <div class="interview-row__name">${escapeHtml(a.firstName)} ${escapeHtml(a.lastName)}</div>
            <div class="interview-row__role">${escapeHtml(a.jobTitle)}</div>
          </div>
          <div class="interview-row__time">
            <div class="interview-row__time-main">${formatTime(when)}</div>
            <div class="interview-row__time-sub">${escapeHtml(type.label)}</div>
          </div>
          <i class="ti ${type.icon} interview-row__mode" aria-hidden="true"></i>
        </div>`;
      })
      .join("");
  }

  // ---------------- Recent Activity ----------------
  // Built from two things on each application: when it arrived, and (if a recruiter has
  // touched it) the last status change. Only the latest action per application is known.

  function buildActivityEvents(applications) {
    const me = String(recruiterProfileId || "").toLowerCase();
    const events = [];

    applications.forEach((a) => {
      const name = escapeHtml(`${a.firstName || ""} ${a.lastName || ""}`.trim());
      const job = escapeHtml(a.jobTitle || "a job");
      const applied = parseUtc(a.appliedAt);
      const updated = parseUtc(a.updatedAt);

      if (applied) {
        events.push({
          time: applied,
          icon: "ti-file-text",
          tone: "purple",
          html: `<strong>${name}</strong> applied for ${job}`,
        });
      }

      const stage = stageName(a.jobStatus);
      const touchedByRecruiter =
        updated &&
        a.lastActionedByRecruiterProfileId &&
        (!applied || updated.getTime() - applied.getTime() > 60000) &&
        stage !== "Withdrawn";

      if (!touchedByRecruiter) return;

      const actor =
        String(a.lastActionedByRecruiterProfileId).toLowerCase() === me ? "You" : "A teammate";

      let icon = "ti-user-plus";
      let tone = "purple";
      let html = `${actor} moved <strong>${name}</strong> to ${escapeHtml(stage)} stage`;

      if (stage === "Interview" && a.interviewScheduledAt) {
        icon = "ti-calendar-event";
        tone = "green";
        html = `${actor} scheduled an interview with <strong>${name}</strong>`;
      } else if (stage === "Interview") {
        icon = "ti-user-check";
        tone = "blue";
      } else if (stage === "Offered") {
        icon = "ti-star";
        tone = "orange";
        html = `${actor} extended an offer to <strong>${name}</strong>`;
      } else if (stage === "Hired") {
        icon = "ti-user-check";
        tone = "green";
        html = `${actor} hired <strong>${name}</strong> for ${job}`;
      } else if (stage === "Rejected") {
        icon = "ti-user-x";
        tone = "red";
        html = `${actor} rejected <strong>${name}</strong> for ${job}`;
      } else if (stage === "New") {
        html = `${actor} moved <strong>${name}</strong> back to New`;
      }

      events.push({ time: updated, icon, tone, html });
    });

    return events;
  }

  function renderRecentActivity(applications) {
    const container = document.getElementById("activity-list");

    if (applications === null) {
      container.innerHTML = `<p class="empty-hint">Couldn't load recent activity.</p>`;
      return;
    }

    const recent = buildActivityEvents(applications)
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);

    if (!recent.length) {
      container.innerHTML = `<p class="empty-hint">Recent activity will appear here.</p>`;
      return;
    }

    container.innerHTML = recent
      .map(
        (e) => `
        <div class="activity-row">
          <span class="activity-row__icon activity-row__icon--${e.tone}"><i class="ti ${e.icon}" aria-hidden="true"></i></span>
          <div>
            <div class="activity-row__text">${e.html}</div>
            <div class="activity-row__time">${timeAgo(e.time)}</div>
          </div>
        </div>`
      )
      .join("");
  }

  // ---------------- Load ----------------

  try {
    // A Pending recruiter sees an "awaiting approval" state instead of the dashboard.
    const profileResponse = await fetch(API_ROUTES.recruiterProfile, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profileResult = await profileResponse.json().catch(() => ({}));

    if (!profileResponse.ok || !profileResult.status) {
      loadingState.hidden = true;
      showAlert(profileResult.message || "Couldn't load your recruiter profile.");
      return;
    }

    if (profileResult.data.status === "Pending") {
      loadingState.hidden = true;
      document.getElementById("pending-approval-banner").hidden = false;
      return;
    }

    if (profileResult.data.status === "Suspended") {
      loadingState.hidden = true;
      showAlert("Your access to this company has been suspended. Contact your company admin for help.");
      return;
    }

    const hasProfileId = Boolean(recruiterProfileId);
    if (!hasProfileId) {
      showAlert("Couldn't find your recruiter profile id. Please log in again.");
    }

    const now = new Date();
    const thisWeekStart = startOfWeek(0);
    const thisWeekEnd = endOfWeek(thisWeekStart);
    const lastWeekStart = startOfWeek(1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const dayFormat = { month: "short", day: "numeric" };
    document.getElementById("date-range-label").textContent =
      `${thisWeekStart.toLocaleDateString("en-US", dayFormat)} – ${thisWeekEnd.toLocaleDateString("en-US", { ...dayFormat, year: "numeric" })}`;

    const ifProfile = (request) => (hasProfileId ? request() : Promise.resolve(null));

    const [jobsData, countsData, recentData, interviewData, analyticsData] = await Promise.all([
      // Active jobs posted by this recruiter.
      ifProfile(() => apiGet(API_ROUTES.getJobsByRecruiter, { recruiterProfileId, status: "Active", usePaging: "false" })),
      // Current stage counts across all of this recruiter's applications.
      ifProfile(() => apiGet(API_ROUTES.getApplicationStatusCounts, { recruiterProfileId })),
      // Applications received since the start of last week (chart, activity, interviews).
      ifProfile(() => apiGet(API_ROUTES.getApplicationsByRecruiter, {
        recruiterProfileId,
        appliedAfter: toApiDate(lastWeekStart),
        appliedBefore: toApiDate(thisWeekEnd),
        usePaging: "false",
      })),
      // Everyone currently in the Interview stage (any application date).
      ifProfile(() => apiGet(API_ROUTES.getApplicationsByRecruiter, { recruiterProfileId, status: "Interview", usePaging: "false" })),
      // Company analytics for this month; only this recruiter's hires row is used.
      ifProfile(() => apiGet(API_ROUTES.getRecruiterAnalyticsDashboard, {
        recruiterProfileId,
        preset: "Custom",
        customStart: toApiDate(monthStart),
        customEnd: toApiDate(now),
      })),
    ]);

    const jobs = jobsData ? jobsData.items || [] : null;
    const recentApps = recentData ? recentData.items || [] : null;
    const interviewApps = interviewData ? interviewData.items || [] : null;
    const appsAvailable = recentApps !== null || interviewApps !== null;

    const applicationMap = new Map();
    [...(recentApps || []), ...(interviewApps || [])].forEach((a) => applicationMap.set(a.applicationId, a));
    const allApps = [...applicationMap.values()];

    let thisWeekSeries = null;
    let lastWeekSeries = null;
    if (recentApps) {
      const thisWeekApps = recentApps.filter((a) => {
        const applied = parseUtc(a.appliedAt);
        return applied && applied >= thisWeekStart;
      });
      const lastWeekApps = recentApps.filter((a) => {
        const applied = parseUtc(a.appliedAt);
        return applied && applied < thisWeekStart;
      });
      thisWeekSeries = buildDailySeries(thisWeekApps, thisWeekStart);
      lastWeekSeries = buildDailySeries(lastWeekApps, lastWeekStart);
    }

    let hires = null;
    let avgDaysToHire = null;
    if (analyticsData) {
      const mine = (analyticsData.recruiterPerformance || []).find(
        (p) => String(p.recruiterProfileId).toLowerCase() === String(recruiterProfileId).toLowerCase()
      );
      hires = mine ? mine.hiredCount : 0;
      avgDaysToHire = mine ? mine.avgDaysToHire : null;
    }

    const interviewsThisWeek = appsAvailable
      ? allApps.filter((a) => {
          const when = parseUtc(a.interviewScheduledAt);
          return when && when >= thisWeekStart && when <= thisWeekEnd && isLiveCandidate(a);
        }).length
      : null;

    renderStatCards({
      openJobs: jobs ? jobs.length : null,
      newApplications: thisWeekSeries ? sumCounts(thisWeekSeries) : null,
      lastWeekApplications: lastWeekSeries ? sumCounts(lastWeekSeries) : null,
      interviewsThisWeek,
      offers: countsData ? countsData.offered : null,
      hires,
    });

    renderPipeline(countsData);
    populateJobSelect(jobs);
    renderApplicationsChart(thisWeekSeries, lastWeekSeries, countsData, avgDaysToHire);
    renderDonutPlaceholder();
    renderOpenJobsTable(jobs, appsAvailable ? upcomingInterviewsByJob(allApps) : null);
    renderTopJobs(jobs);
    renderInterviewsThisWeek(appsAvailable ? allApps : null, thisWeekEnd);
    renderRecentActivity(appsAvailable ? allApps : null);

    // Job selector: re-draw only the pipeline for the chosen job.
    const jobSelect = document.getElementById("pipeline-job-select");
    jobSelect.addEventListener("change", async () => {
      const counts = await apiGet(API_ROUTES.getApplicationStatusCounts, {
        recruiterProfileId,
        jobId: jobSelect.value,
      });
      renderPipeline(counts);
    });

    if (window.ProConnectShell) {
      window.ProConnectShell.setBadgeCounts({
        applications: countsData ? countsData.new : 0,
      });
    }

    loadingState.hidden = true;
    dashboardContent.hidden = false;
  } catch (err) {
    console.error("Dashboard load failed:", err);
    loadingState.hidden = true;
    showAlert("Couldn't reach the server. Check your connection and try again.");
  }
});