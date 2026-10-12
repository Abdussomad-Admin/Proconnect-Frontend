document.addEventListener("DOMContentLoaded", () => {
  const emailEl = document.getElementById("pending-email");
  const countdownEl = document.getElementById("countdown");
  const resendBtn = document.getElementById("resend-btn");
  const resendLabel = document.getElementById("resend-label");
  const resendAlert = document.getElementById("resend-alert");

  const RESEND_COOLDOWN_SECONDS = 45;

  const params = new URLSearchParams(window.location.search);
  const pendingEmail = params.get("email") || sessionStorage.getItem("pc_pending_email");

  if (!pendingEmail) {
    window.location.href = "register.html";
    return;
  }

  sessionStorage.setItem("pc_pending_email", pendingEmail);

  emailEl.textContent = pendingEmail;

  let secondsLeft = RESEND_COOLDOWN_SECONDS;
  let timerId = null;

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function tick() {
    secondsLeft -= 1;
    countdownEl.textContent = formatTime(secondsLeft);

    if (secondsLeft <= 0) {
      clearInterval(timerId);
      resendBtn.disabled = false;
      resendLabel.textContent = "Ready to resend";
      countdownEl.parentElement.style.display = "none";
    }
  }

  function startCountdown() {
    secondsLeft = RESEND_COOLDOWN_SECONDS;
    countdownEl.textContent = formatTime(secondsLeft);
    countdownEl.parentElement.style.display = "block";
    resendLabel.textContent = "Didn't receive the email?";
    resendBtn.disabled = true;
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  startCountdown();

  function showResendAlert(message, isError) {
    resendAlert.textContent = message;
    resendAlert.hidden = false;
    resendAlert.style.color = isError ? "var(--pc-danger)" : "var(--pc-purple)";
    resendAlert.style.background = isError ? "var(--pc-danger-bg)" : "var(--pc-purple-light)";
  }

  resendBtn.addEventListener("click", async () => {
    resendBtn.disabled = true;
    resendBtn.innerHTML = `<span class="spinner"></span><span>Sending...</span>`;
    resendAlert.hidden = true;

    try {
      const url = `${API_ROUTES.resendVerification}?email=${encodeURIComponent(pendingEmail)}`;
      const response = await fetch(url, { method: "GET" });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        showResendAlert(result.message || "Couldn't resend the email. Please try again.", true);
        resendBtn.disabled = false;
      } else {
        showResendAlert("Verification email resent — check your inbox.", false);
        startCountdown();
      }
    } catch (err) {
      showResendAlert("Couldn't reach the server. Check your connection and try again.", true);
      resendBtn.disabled = false;
    } finally {
      resendBtn.innerHTML = `<span class="btn-label">Resend email</span>`;
    }
  });
});