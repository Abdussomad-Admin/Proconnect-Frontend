document.addEventListener("DOMContentLoaded", () => {
  const professionalCard = document.getElementById("role-professional");
  const recruiterCard = document.getElementById("role-recruiter");

  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || sessionStorage.getItem("pc_pending_email");

  if (!email) {
    window.location.href = "register.html";
    return;
  }

  function setCardLoading(card, isLoading) {
    card.disabled = isLoading;
    card.classList.toggle("is-selected", isLoading);
  }

  async function selectRole(card, role) {
    setCardLoading(card, true);

    try {
      const response = await fetch(API_ROUTES.setupAccount, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accountType: role }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(result.message || "Couldn't save your account type. Please try again.", "error");
        setCardLoading(card, false);
        return;
      }

      // Result<LoginResponse>.Success(response, token) → result.data is the
      // LoginResponse, result.message is the JWT. Store each field under its
      // own key — pc_user_id MUST stay the actual User.Id, since the wizard
      // pages' Update commands take UserId, not ProfileId, and look the
      // profile up from there.
      const setupData = result.data || {};
      const token = result.message;

      if (setupData.id) localStorage.setItem("pc_user_id", setupData.id);
      if (setupData.profileId) localStorage.setItem("pc_profile_id", setupData.profileId);
      if (setupData.role) localStorage.setItem("pc_role", setupData.role);
      if (setupData.userName) localStorage.setItem("pc_username", setupData.userName);
      if (token) localStorage.setItem("pc_token", token);

      const nextPage = role === "Professional"
        ? "professional-profile-setup.html"
        : "company-onboarding.html";

      window.location.href = `${nextPage}?email=${encodeURIComponent(email)}`;

    } catch (err) {
      showToast("Couldn't reach the server. Check your connection and try again.", "error");
      setCardLoading(card, false);
    }
  }

  professionalCard.addEventListener("click", () => selectRole(professionalCard, "Professional"));
  recruiterCard.addEventListener("click", () => selectRole(recruiterCard, "Recruiter"));
});