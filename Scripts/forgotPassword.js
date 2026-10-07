document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgot-form");
  const btnSend = document.getElementById("btn-send-code");
  const sendLabel = document.getElementById("send-code-label");
  const emailInput = document.getElementById("email");

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    clearFieldError("email");
    const email = emailInput.value.trim();

    if (!email) {
      setFieldError("email", "Email is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setFieldError("email", "Enter a valid email address.");
      return;
    }

    btnSend.disabled = true;
    sendLabel.textContent = "Sending...";

    try {
      const response = await fetch(API_ROUTES.forgotPassword, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await response.json().catch(() => ({}));

      // ForgotPasswordHandler intentionally returns the SAME generic success
      // message whether or not the email exists (so nobody can probe which
      // emails are registered). A hard network/server error is the only
      // real failure case worth showing differently.
      if (!response.ok) {
        throw new Error(result.message || "Something went wrong. Please try again.");
      }

      window.location.href = `reset-password.html?email=${encodeURIComponent(email)}`;
    } catch (err) {
      showAlert(err.message);
      btnSend.disabled = false;
      sendLabel.textContent = "Send reset code";
    }
  });
});