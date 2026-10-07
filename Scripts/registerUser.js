document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("register-form");
  const submitBtn = document.getElementById("submit-btn");

  // Password toggles
  document.querySelectorAll(".icon-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-toggle-for");
      const input = document.getElementById(targetId);
      const icon = btn.querySelector("i");
      const isHidden = input.type === "password";

      input.type = isHidden ? "text" : "password";
      icon.className = isHidden ? "ti ti-eye-off" : "ti ti-eye";
      btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  });

  //  Validation 
  function setFieldError(fieldName, message) {
    const input = document.getElementById(fieldName);
    const errorEl = document.querySelector(`[data-error-for="${fieldName}"]`);
    if (message) {
      input.classList.add("is-invalid");
      errorEl.textContent = message;
    } else {
      input.classList.remove("is-invalid");
      errorEl.textContent = "";
    }
  }

  function clearAllErrors() {
    ["firstName", "lastName", "username", "email", "phoneNumber", "password", "confirmPassword"]
      .forEach((field) => setFieldError(field, ""));
    hideAlert();
  }

  function validate(data) {
    let isValid = true;

    if (!data.firstName.trim()) {
      setFieldError("firstName", "First name is required.");
      isValid = false;
    }
    if (!data.lastName.trim()) {
      setFieldError("lastName", "Last name is required.");
      isValid = false;
    }
    if (!data.username.trim()) {
      setFieldError("username", "Username is required.");
      isValid = false;
    } else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(data.username.trim())) {
      setFieldError("username", "3-30 characters: letters, numbers, dots, dashes, underscores.");
      isValid = false;
    }

    if (!data.email.trim()) {
      setFieldError("email", "Email is required.");
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      setFieldError("email", "Enter a valid email address.");
      isValid = false;
    }

    if (!data.phoneNumber.trim()) {
      setFieldError("phoneNumber", "Phone number is required.");
      isValid = false;
    }

    if (!data.password) {
      setFieldError("password", "Password is required.");
      isValid = false;
    } else if (data.password.length < 8) {
      setFieldError("password", "Use at least 8 characters.");
      isValid = false;
    }

    if (data.confirmPassword !== data.password) {
      setFieldError("confirmPassword", "Passwords do not match.");
      isValid = false;
    }

    return isValid;
  }

  // Routes to the global toast (Scripts/toast.js) instead of the old
  // #form-alert div; call sites are unchanged.
  function showAlert(message) {
    showToast(message, "error");
  }

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? `<span class="spinner"></span><span>Creating account...</span>`
      : `<span class="btn-label">Create account</span>`;
  }

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const formData = new FormData(form);
    const payload = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      username: formData.get("username"),
      email: formData.get("email"),
      phoneNumber: formData.get("phoneNumber"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    };

    if (!validate(payload)) return;

    setLoading(true);

    try {
      const response = await fetch(API_ROUTES.register, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: payload.firstName,
          lastName: payload.lastName,
          username: payload.username,
          email: payload.email,
          tel: payload.phoneNumber,
          password: payload.password,
          confirmPassword: payload.confirmPassword,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (result.errors) {
          const fieldNameMap = { tel: "phoneNumber" };

          Object.entries(result.errors).forEach(([field, messages]) => {
            const camelField = field.charAt(0).toLowerCase() + field.slice(1);
            const normalizedField = fieldNameMap[camelField] || camelField;
            setFieldError(normalizedField, Array.isArray(messages) ? messages[0] : messages);
          });
        } else {

          if (result.message.toLowerCase() === "user created but due to an error not verified") {
            sessionStorage.setItem("pc_pending_email", payload.email);
            window.location.href = "check-email.html";
          }
          showAlert(result.message || "Couldn't create your account. Please check your details and try again.");
        }
        return;
      }

      sessionStorage.setItem("pc_pending_email", payload.email);
      localStorage.setItem("pc_user_id", result.data);
      window.location.href = "check-email.html";

    } catch (err) {
      showAlert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  });
});