document.addEventListener("DOMContentLoaded", () => {
  const codeInput = document.getElementById("invitationCode");

  const verifyBtn = document.getElementById("verify-btn");
  const backToStep1 = document.getElementById("back-to-step1");
  const continueBtn = document.getElementById("continue-btn");
  const submitRequestBtn = document.getElementById("submit-request-btn");

  let verifiedCode = null;
  let companyPreview = null;

  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  // Pre-fill code from ?code= query param (from invitation email link)
  const params = new URLSearchParams(window.location.search);
  const prefilledCode = params.get("code");
  if (prefilledCode) {
    codeInput.value = prefilledCode;
  }

  function showAlert(message) {
    showToast(message, "error");
  }

  // No-op now — toasts auto-dismiss themselves, so there's no persistent
  // alert box left to hide.
  function hideAlert() {}

  function setFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.querySelector(`[data-error-for="${fieldId}"]`);
    if (message) {
      input.classList.add("is-invalid");
      errorEl.textContent = message;
    } else {
      input.classList.remove("is-invalid");
      errorEl.textContent = "";
    }
  }

  function setLoading(btn, isLoading, label) {
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
      ? `<span class="spinner"></span><span>Please wait...</span>`
      : `<span class="btn-label">${label}</span>`;
  }

  function goToStep(stepKey) {
    document.querySelectorAll(".wizard-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === String(stepKey));
    });

    document.querySelectorAll(".wizard-step").forEach((step) => {
      const stepNum = Number(step.dataset.step);
      step.classList.toggle("is-active", stepNum === Number(stepKey));
      step.classList.toggle("is-complete", stepNum < Number(stepKey));
    });
  }

  // Step 1 -> verify invitation code
  verifyBtn.addEventListener("click", async () => {
    hideAlert();
    setFieldError("invitationCode", "");

    const code = codeInput.value.trim();
    if (!code) {
      setFieldError("invitationCode", "Invitation code is required.");
      return;
    }

    setLoading(verifyBtn, true, "Verify Code");

    try {
      const response = await fetch(
        `${API_ROUTES.companyInvitationPreview}/${encodeURIComponent(code)}`,
        { method: "GET" }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        showAlert(result.message || "Invalid or expired invitation code.");
        return;
      }

      verifiedCode = code;
      companyPreview = result.data;

      document.getElementById("company-name").textContent = companyPreview.name;
      document.getElementById("company-industry").textContent = companyPreview.industry;
      document.getElementById("company-size").textContent = companyPreview.companySize;

      const logoEl = document.getElementById("company-logo");
      logoEl.innerHTML = companyPreview.logoUrl
        ? `<img src="${companyPreview.logoUrl}" alt="${companyPreview.name} logo" />`
        : companyPreview.name.charAt(0).toUpperCase();

      goToStep(2);
    } catch (err) {
      showAlert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(verifyBtn, false, "Verify Code");
    }
  });

  backToStep1.addEventListener("click", () => goToStep(1));

  continueBtn.addEventListener("click", () => goToStep(3));

  // Step 3 -> submit join request
  submitRequestBtn.addEventListener("click", async () => {
    hideAlert();

    if (!verifiedCode) {
      showAlert("Please verify your invitation code first.");
      goToStep(1);
      return;
    }

    setLoading(submitRequestBtn, true, "Request Access");

    try {
      const response = await fetch(API_ROUTES.joinCompany, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invitationCode: verifiedCode }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.status) {
        showAlert(result.message || "Couldn't submit your request. Please try again.");
        return;
      }

      goToStep("success");
    } catch (err) {
      showAlert("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(submitRequestBtn, false, "Request Access");
    }
  });
});