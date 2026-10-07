document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("reset-form");
  const btnReset = document.getElementById("btn-reset");
  const resetLabel = document.getElementById("reset-label");
  const btnResend = document.getElementById("btn-resend");
  const resendCooldown = document.getElementById("resend-cooldown");
  const resetSubtitle = document.getElementById("reset-subtitle");

  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("reset-code");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");

  const params = new URLSearchParams(window.location.search);
  const emailFromLink = params.get("email");

  if (emailFromLink) {
    emailInput.value = emailFromLink;
    resetSubtitle.textContent = `Enter the 6-digit code sent to ${emailFromLink}.`;
  }

  // ---------------- Helpers ----------------

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  function clearFieldError(id) {
    const input = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (input) input.classList.remove("is-invalid");
    if (err) err.textContent = "";
  }

  function setFieldError(id, message) {
    const input = document.getElementById(id);
    const err = document.getElementById(`err-${id}`);
    if (input) input.classList.add("is-invalid");
    if (err) err.textContent = message;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setupPasswordToggle(toggleId, inputEl) {
    const toggle = document.getElementById(toggleId);
    toggle.addEventListener("click", () => {
      const isHidden = inputEl.type === "password";
      inputEl.type = isHidden ? "text" : "password";
      toggle.innerHTML = isHidden
        ? '<i class="ti ti-eye-off" aria-hidden="true"></i>'
        : '<i class="ti ti-eye" aria-hidden="true"></i>';
      toggle.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  }

  setupPasswordToggle("toggle-new-password", newPasswordInput);
  setupPasswordToggle("toggle-confirm-password", confirmPasswordInput);

  // Only allow digits in the code field
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });

  // ---------------- Validation ----------------

  function validateForm() {
    let valid = true;

    clearFieldError("email");
    const email = emailInput.value.trim();
    if (!email) {
      setFieldError("email", "Email is required.");
      valid = false;
    } else if (!isValidEmail(email)) {
      setFieldError("email", "Enter a valid email address.");
      valid = false;
    }

    clearFieldError("reset-code");
    if (!/^\d{6}$/.test(codeInput.value.trim())) {
      setFieldError("reset-code", "Enter the 6-digit code from your email.");
      valid = false;
    }

    clearFieldError("new-password");
    if (newPasswordInput.value.length < 8) {
      setFieldError("new-password", "Password must be at least 8 characters.");
      valid = false;
    }

    clearFieldError("confirm-password");
    if (confirmPasswordInput.value !== newPasswordInput.value) {
      setFieldError("confirm-password", "Passwords do not match.");
      valid = false;
    }

    return valid;
  }

  // ---------------- Submit ----------------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    if (!validateForm()) return;

    const payload = {
      email: emailInput.value.trim(),
      resetCode: codeInput.value.trim(),
      newPassword: newPasswordInput.value,
    };

    btnReset.disabled = true;
    resetLabel.textContent = "Resetting...";

    try {
      const response = await fetch(API_ROUTES.resetPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.isSuccess === false) {
        throw new Error(result.message || "That code is invalid or has expired. Please try again.");
      }

      window.location.href = "login.html?reset=success";
    } catch (err) {
      showAlert(err.message);
      btnReset.disabled = false;
      resetLabel.textContent = "Reset password";
    }
  });

  // ---------------- Resend code (with cooldown) ----------------

  let cooldownSeconds = 0;
  let cooldownTimer = null;

  function startCooldown(seconds) {
    cooldownSeconds = seconds;
    btnResend.disabled = true;
    resendCooldown.hidden = false;
    resendCooldown.textContent = `(${cooldownSeconds}s)`;

    cooldownTimer = setInterval(() => {
      cooldownSeconds -= 1;
      resendCooldown.textContent = `(${cooldownSeconds}s)`;

      if (cooldownSeconds <= 0) {
        clearInterval(cooldownTimer);
        btnResend.disabled = false;
        resendCooldown.hidden = true;
      }
    }, 1000);
  }

  btnResend.addEventListener("click", async () => {
    hideAlert();

    clearFieldError("email");
    const email = emailInput.value.trim();

    if (!email || !isValidEmail(email)) {
      setFieldError("email", "Enter a valid email address first.");
      return;
    }

    btnResend.disabled = true;

    try {
      const response = await fetch(API_ROUTES.forgotPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Couldn't resend the code. Please try again.");
      }

      showToast("A new code has been sent if this email is registered.", "success");
      startCooldown(60);
    } catch (err) {
      showAlert(err.message);
      btnResend.disabled = false;
    }
  });
});