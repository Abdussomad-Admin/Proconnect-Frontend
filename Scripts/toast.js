/* ==========================================================================
   Toast notifications. Include this file (plus Styles/toast.css) on any
   page, then call showToast("message", "success" | "error" | "info").
   Creates its own container div on first use — no markup needed in HTML.
   ========================================================================== */

(function () {
  function ensureContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: "ti-circle-check",
    error: "ti-circle-x",
    info: "ti-info-circle",
  };

  window.showToast = function (message, type = "info", durationMs = 3500) {
    const container = ensureContainer();

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i class="ti ${ICONS[type] || ICONS.info} toast__icon" aria-hidden="true"></i>
      <span class="toast__message"></span>
      <button type="button" class="toast__close" aria-label="Dismiss"><i class="ti ti-x" aria-hidden="true"></i></button>
    `;
    toast.querySelector(".toast__message").textContent = message;

    const remove = () => {
      toast.classList.add("toast--leaving");
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector(".toast__close").addEventListener("click", remove);
    container.appendChild(toast);

    // Two-step so the enter transition actually plays (adding the class in
    // the same frame the element is created skips the transition).
    requestAnimationFrame(() => toast.classList.add("toast--visible"));

    setTimeout(remove, durationMs);
  };
})();