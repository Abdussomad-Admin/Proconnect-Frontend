(function () {
  "use strict";

  var ACTIONS = {
    restrict: { verb: "Restrict", tone: "default" },
    suspend: { verb: "Suspend", tone: "danger" },
    restore: { verb: "Restore", tone: "default" },
    ban: { verb: "Ban", tone: "danger" },
    verify: { verb: "Verify", tone: "default" },
    approve: { verb: "Activate", tone: "default" },
    close: { verb: "Close", tone: "danger" },
    remove: { verb: "Remove", tone: "danger" },
    resolve: { verb: "Resolve", tone: "default" },
    dismiss: { verb: "Dismiss", tone: "default" },
    escalate: { verb: "Escalate", tone: "danger" },
    publish: { verb: "Publish", tone: "default" },
    cancel: { verb: "Cancel", tone: "danger" }
  };

  var ICONS = { default: "ti-info-circle", danger: "ti-alert-triangle", success: "ti-circle-check", error: "ti-alert-triangle" };
  var ICON_TONE = { default: "", danger: "is-danger", success: "is-success", error: "is-danger" };

  var CSS = [
    ".ad-modal-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(11,16,48,.55)}",
    ".ad-modal{width:100%;max-width:440px;background:var(--ad-surface,#fff);border-radius:var(--ad-radius-lg,16px);padding:1.5rem;box-shadow:0 24px 60px -20px rgba(11,16,48,.5);font-family:var(--ad-font,inherit)}",
    ".ad-modal__icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:12px;background:var(--ad-purple-light,#EFEBFC);color:var(--ad-purple,#5B3FE0)}",
    ".ad-modal__icon.is-danger{background:#FCEDED;color:#D64545}",
    ".ad-modal__icon.is-success{background:#E9F7EF;color:#1F9254}",
    ".ad-modal h2{margin:0 0 6px;font-size:17px;color:var(--ad-heading,#1B1B5E)}",
    ".ad-modal__message{margin:0;font-size:13px;line-height:1.55;color:var(--ad-text-2,#6B6B80)}",
    ".ad-modal__field{margin-top:14px}",
    ".ad-modal__field label{display:block;font-size:12px;font-weight:600;color:var(--ad-text,#1A1A2E);margin-bottom:5px}",
    ".ad-modal__field textarea{width:100%;min-height:84px;padding:10px 12px;border:1px solid var(--ad-border,#E4E3EF);border-radius:var(--ad-radius,10px);font:400 13px var(--ad-font,inherit);color:var(--ad-text,#1A1A2E);resize:vertical;box-sizing:border-box}",
    ".ad-modal__field textarea:focus{outline:none;border-color:var(--ad-purple,#5B3FE0);box-shadow:0 0 0 3px var(--ad-purple-light,#EFEBFC)}",
    ".ad-modal__error{margin:12px 0 0;padding:9px 12px;border-radius:var(--ad-radius,10px);background:#FCEDED;color:#D64545;font-size:12.5px}",
    ".ad-modal__actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}",
    ".ad-modal__btn{height:38px;padding:0 18px;border-radius:var(--ad-radius,10px);border:1px solid var(--ad-border,#E4E3EF);background:var(--ad-surface,#fff);color:var(--ad-text,#1A1A2E);font:600 13px var(--ad-font,inherit);cursor:pointer}",
    ".ad-modal__btn:hover{background:var(--ad-page,#F5F4FB)}",
    ".ad-modal__btn--primary{background:var(--ad-purple,#5B3FE0);border-color:var(--ad-purple,#5B3FE0);color:#fff}",
    ".ad-modal__btn--primary:hover{background:var(--ad-purple,#5B3FE0);opacity:.92}",
    ".ad-modal__btn--danger{background:#D64545;border-color:#D64545;color:#fff}",
    ".ad-modal__btn--danger:hover{background:#D64545;opacity:.92}",
    ".ad-modal__btn:disabled{opacity:.55;cursor:not-allowed}",
    "body.ad-modal-open{overflow:hidden}",
    "@media (prefers-reduced-motion:no-preference){.ad-modal-overlay{animation:ad-modal-fade .15s ease}.ad-modal{animation:ad-modal-pop .18s ease}}",
    "@keyframes ad-modal-fade{from{opacity:0}to{opacity:1}}",
    "@keyframes ad-modal-pop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}"
  ].join("");

  var isOpen = false;

  function injectStyles() {
    if (document.getElementById("ad-modal-style")) return;
    var style = document.createElement("style");
    style.id = "ad-modal-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function capitalize(text) {
    text = String(text || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function openDialog(o) {
    return new Promise(function (resolve) {
      if (isOpen) {
        resolve({ confirmed: false, reason: null });
        return;
      }

      isOpen = true;
      injectStyles();

      var previouslyFocused = document.activeElement;
      var tone = o.tone || "default";

      var overlay = document.createElement("div");
      overlay.className = "ad-modal-overlay";
      overlay.innerHTML =
        '<div class="ad-modal" role="dialog" aria-modal="true" aria-labelledby="ad-modal-title" aria-describedby="ad-modal-message">' +
          '<div class="ad-modal__icon ' + (ICON_TONE[tone] || "") + '"><i class="ti ' + (ICONS[tone] || ICONS["default"]) + '" aria-hidden="true"></i></div>' +
          '<h2 id="ad-modal-title"></h2>' +
          '<p class="ad-modal__message" id="ad-modal-message"></p>' +
          (o.askReason
            ? '<div class="ad-modal__field"><label for="ad-modal-reason">Reason (optional)</label><textarea id="ad-modal-reason" rows="3"></textarea></div>'
            : "") +
          '<p class="ad-modal__error" id="ad-modal-error" role="alert" hidden></p>' +
          '<div class="ad-modal__actions">' +
            (o.showDismiss === false ? "" : '<button type="button" class="ad-modal__btn" data-role="dismiss"></button>') +
            '<button type="button" class="ad-modal__btn ad-modal__btn--' + (tone === "danger" ? "danger" : "primary") + '" data-role="confirm"></button>' +
          "</div>" +
        "</div>";

      var dialog = overlay.querySelector(".ad-modal");
      var confirmBtn = overlay.querySelector('[data-role="confirm"]');
      var dismissBtn = overlay.querySelector('[data-role="dismiss"]');
      var reasonEl = overlay.querySelector("#ad-modal-reason");
      var errorEl = overlay.querySelector("#ad-modal-error");

      overlay.querySelector("#ad-modal-title").textContent = o.title || "";
      overlay.querySelector("#ad-modal-message").textContent = o.message || "";
      confirmBtn.textContent = o.confirmLabel || "OK";
      if (dismissBtn) dismissBtn.textContent = o.dismissLabel || "Go back";

      var busy = false;
      var downOnOverlay = false;

      function setBusy(on) {
        busy = on;
        confirmBtn.disabled = on;
        if (dismissBtn) dismissBtn.disabled = on;
        if (reasonEl) reasonEl.disabled = on;
        confirmBtn.textContent = on ? "Working..." : (o.confirmLabel || "OK");
      }

      function close(result) {
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.remove();
        document.body.classList.remove("ad-modal-open");
        isOpen = false;
        if (previouslyFocused && typeof previouslyFocused.focus === "function") previouslyFocused.focus();
        resolve(result);
      }

      function onKeyDown(e) {
        if (e.key === "Escape") {
          if (!busy) {
            e.preventDefault();
            close({ confirmed: false, reason: null });
          }
          return;
        }

        if (e.key === "Tab") {
          var items = dialog.querySelectorAll("textarea:not(:disabled), button:not(:disabled)");
          if (!items.length) {
            e.preventDefault();
            return;
          }
          var first = items[0];
          var last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      function submit() {
        if (busy) return;
        errorEl.hidden = true;

        var reason = reasonEl ? (reasonEl.value.trim() || null) : null;

        if (typeof o.onSubmit !== "function") {
          close({ confirmed: true, reason: reason });
          return;
        }

        setBusy(true);

        Promise.resolve()
          .then(function () { return o.onSubmit(reason); })
          .then(function () { close({ confirmed: true, reason: reason }); })
          .catch(function (err) {
            setBusy(false);
            errorEl.textContent = (err && err.message) || "Something went wrong. Please try again.";
            errorEl.hidden = false;
            confirmBtn.focus();
          });
      }

      confirmBtn.addEventListener("click", submit);

      if (dismissBtn) {
        dismissBtn.addEventListener("click", function () {
          if (!busy) close({ confirmed: false, reason: null });
        });
      }

      overlay.addEventListener("mousedown", function (e) {
        downOnOverlay = e.target === overlay;
      });

      overlay.addEventListener("click", function (e) {
        if (downOnOverlay && e.target === overlay && !busy) close({ confirmed: false, reason: null });
        downOnOverlay = false;
      });

      document.body.appendChild(overlay);
      document.body.classList.add("ad-modal-open");
      document.addEventListener("keydown", onKeyDown, true);

      (reasonEl || confirmBtn).focus();
    });
  }

  function runAction(o) {
    var meta = ACTIONS[o.action] || { verb: capitalize(o.action), tone: "default" };
    var entity = o.entity || "item";

    return openDialog({
      title: o.title || meta.verb + " this " + entity + "?",
      message: o.message || "You can add a reason below. It will be saved in the activity log.",
      confirmLabel: o.confirmLabel || meta.verb + " " + entity,
      tone: o.tone || meta.tone,
      askReason: o.askReason !== false,
      onSubmit: o.request
    }).then(function (result) {
      return result.confirmed;
    });
  }

  function confirm(o) {
    return openDialog({
      title: o.title,
      message: o.message,
      confirmLabel: o.confirmLabel || "Confirm",
      dismissLabel: o.dismissLabel,
      tone: o.tone,
      askReason: !!o.askReason
    });
  }

  function notify(o) {
    return openDialog({
      title: o.title,
      message: o.message,
      confirmLabel: o.confirmLabel || "OK",
      tone: o.tone || "default",
      showDismiss: false
    }).then(function () {});
  }

  window.AdminModal = { runAction: runAction, confirm: confirm, notify: notify };
})();