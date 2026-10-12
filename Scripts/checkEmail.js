document.addEventListener("DOMContentLoaded", () => {
  const emailEl = document.getElementById("pending-email");
  const countdownEl = document.getElementById("countdown");
  const resendBtn = document.getElementById("resend-btn");
  const resendLabel = document.getElementById("resend-label");

  const RESEND_COOLDOWN_SECONDS = 45;

  const params = new URLSearchParams(window.location.search);
  const pendingEmail = params.get("email") || sessionStorage.getItem("pc_pending_email");

  // Nobody is waiting to verify: send them to login, not register.
  if (!pendingEmail) {
    window.location.replace("login.html");
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
    countdownEl.textContent = formatTime(Math.max(secondsLeft, 0));

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

  resendBtn.addEventListener("click", async () => {
    resendBtn.disabled = true;
    resendBtn.innerHTML = `<span class="spinner"></span><span>Sending...</span>`;

    try {
      const url = `${API_ROUTES.resendVerification}?email=${encodeURIComponent(pendingEmail)}`;
      const response = await fetch(url, { method: "GET" });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(
          result.message || "Couldn't resend the email. Please try again.",
          "error",
          5000
        );
        resendBtn.disabled = false;
      } else {
        showToast("Verification email resent. Check your inbox.", "success");
        startCountdown();
      }
    } catch (err) {
      showToast(
        "Couldn't reach the server. Check your connection and try again.",
        "error",
        5000
      );
      resendBtn.disabled = false;
    } finally {
      resendBtn.innerHTML = `<span class="btn-label">Resend email</span>`;
    }
  });
});