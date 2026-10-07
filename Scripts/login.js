document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("reason") === "session-expired") {
    showToast("Your session expired. Please log in again.", "error");
  }
  const form = document.getElementById("login-form");
  const btnLogin = document.getElementById("btn-login");
  const loginLabel = document.getElementById("login-label");
  const btnGoogle = document.getElementById("btn-google");
  const togglePassword = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");
  const loginIdInput = document.getElementById("login-id");

  // ---------------- Helpers ----------------

  function showAlert(message) {
    showToast(message, "error");
  }

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

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

  // ---------------- Password visibility toggle ----------------

  togglePassword.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePassword.innerHTML = isHidden
      ? '<i class="ti ti-eye-off" aria-hidden="true"></i>'
      : '<i class="ti ti-eye" aria-hidden="true"></i>';
    togglePassword.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });

  // ---------------- Validation ----------------
  // LoginCommand accepts either an email OR a username in the same field,
  // so we only check that something was typed — no email-format enforcement.

  function validateForm() {
    let valid = true;

    clearFieldError("login-id");
    if (!loginIdInput.value.trim()) {
      setFieldError("login-id", "Enter your email or username.");
      valid = false;
    }

    clearFieldError("password");
    if (!passwordInput.value) {
      setFieldError("password", "Password is required.");
      valid = false;
    }

    return valid;
  }

  // ---------------- Submit ----------------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    if (!validateForm()) return;

    const loginId = loginIdInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = document.getElementById("remember-me").checked;

    // Note: LoginCommand only takes (Login, Password) — rememberMe is not
    // sent to the backend. It's used purely client-side to decide where
    // the token gets stored (localStorage survives closing the browser,
    // sessionStorage does not).

    btnLogin.disabled = true;
    loginLabel.textContent = "Logging in...";

    try {
      const response = await fetch(API_ROUTES.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginId, password }),
      });

      const result = await response.json().catch(() => ({}));

      if (result.message.toLowerCase() === "please verify your email.") {
        sessionStorage.setItem("pc_pending_email", loginId);
        window.location.href = "check-email.html";
      }

      // Result<LoginResponse>.Success(response, token) means:
      //   result.data    -> the LoginResponse object (id, email, role, profileId, userName)
      //   result.message -> the JWT token
      // On failure, result.message carries the actual error text instead
      // (e.g. "Unauthorized", "Please verify your email.", "Account has been deactivated.").

      if (!response.ok || result.status === false) {
        throw new Error(result.message || "Invalid email/username or password. Please try again.");
      }

      const loginData = result.data || {};
      const token = result.message;

      if (loginData.id) localStorage.setItem("pc_user_id", loginData.id);
      if (loginData.profileId) localStorage.setItem("pc_profile_id", loginData.profileId);
      if (loginData.role) localStorage.setItem("pc_role", loginData.role);
      if (loginData.userName) localStorage.setItem("pc_username", loginData.userName);

      console.log(loginData.profileId);

      if (token) {
        const tokenStore = rememberMe ? localStorage : sessionStorage;
        tokenStore.setItem("pc_token", token);
      }

      const resolvedEmail = loginData.email || loginId;
      sessionStorage.setItem("pc_pending_email", resolvedEmail);

      // Case-insensitive on purpose — we haven't confirmed the exact casing
      // the backend's Roles constants use ("Professional" vs "professional"
      // vs something else), so this works regardless.

      

      const role = (loginData.role || "").toLowerCase();

      if (role === "recruiter") {
        window.location.href = "recruiter-dashboard.html"; // not built yet
      } else if (role === "admin") {
        window.location.href = "admin-dashboard.html"; // not built yet
      } else {
        // Professional, or any unrecognized role — land somewhere real
        // rather than a dead link.
        window.location.href = "feed.html";
      }

    } catch (err) {
      showAlert(err.message);
      btnLogin.disabled = false;
      loginLabel.textContent = "Log In";
    }
  });

  // ---------------- Google sign-in (placeholder) ----------------

  btnGoogle.addEventListener("click", () => {
    if (typeof API_ROUTES !== "undefined" && API_ROUTES.googleLogin) {
      window.location.href = API_ROUTES.googleLogin;
    } else {
      showAlert("Google sign-in isn't set up yet.");
    }
  });
});