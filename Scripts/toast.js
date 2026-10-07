/* ==========================================================================
   Toast notifications. Include this file (plus Styles/toast.css) on any
   page, then call:

     showToast("message", "success" | "error" | "info")
     showToast("message", "info", 6000, { title, icon, onClick })

   The 4th argument is optional and only needed for richer toasts (e.g.
   real-time notifications with a bold title and a click-through link):
     title   - bold first line above the message
     icon    - tabler icon class (e.g. "ti-bell"); defaults per type
     onClick - makes the whole toast clickable

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

  window.showToast = function (message, type = "info", durationMs = 3500, options = {}) {
    const container = ensureContainer();
    const { title, icon, onClick } = options || {};

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i class="ti ${icon || ICONS[type] || ICONS.info} toast__icon" aria-hidden="true"></i>
      <span class="toast__message"></span>
      <button type="button" class="toast__close" aria-label="Dismiss"><i class="ti ti-x" aria-hidden="true"></i></button>
    `;

    // textContent / createElement (never innerHTML) for user-supplied text,
    // so notification titles/messages can't inject markup.
    const messageEl = toast.querySelector(".toast__message");
    if (title) {
      const strong = document.createElement("strong");
      strong.textContent = title;
      messageEl.appendChild(strong);
      messageEl.appendChild(document.createElement("br"));
    }
    messageEl.appendChild(document.createTextNode(message));

    const remove = () => {
      toast.classList.add("toast--leaving");
      setTimeout(() => toast.remove(), 200);
    };

    if (typeof onClick === "function") {
      toast.style.cursor = "pointer";
      toast.addEventListener("click", (e) => {
        if (e.target.closest(".toast__close")) return;
        onClick();
      });
    }

    toast.querySelector(".toast__close").addEventListener("click", remove);
    container.appendChild(toast);

    // Two-step so the enter transition actually plays (adding the class in
    // the same frame the element is created skips the transition).
    requestAnimationFrame(() => toast.classList.add("toast--visible"));

    setTimeout(remove, durationMs);
  };
})();