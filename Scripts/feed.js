document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const username = localStorage.getItem("pc_username") || "You";
  const myUserId = localStorage.getItem("pc_user_id") || "";
  const userInitials = username.charAt(0).toUpperCase();

  const PAGE_SIZE = 10;
  let currentTab = "ForYou";
  let currentPageSize = PAGE_SIZE;

  const REACTIONS = {
    Like: { emoji: "👍", label: "Like" },
    Love: { emoji: "❤️", label: "Love" },
    Celebrate: { emoji: "🎉", label: "Celebrate" },
    Support: { emoji: "🤝", label: "Support" },
    Insightful: { emoji: "💡", label: "Insightful" },
    Funny: { emoji: "😄", label: "Funny" },
  };

  // ---------------- Generic helpers ----------------

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function initials(firstName, lastName) {
    const a = (firstName || "").charAt(0);
    const b = (lastName || "").charAt(0);
    return (a + b).toUpperCase() || "?";
  }

  function avatarHtml(profilePictureUrl, firstName, lastName, sizeClass) {
    if (profilePictureUrl) {
      return `<img class="${sizeClass}" src="${escapeHtml(profilePictureUrl)}" alt="" />`;
    }
    return `<span class="${sizeClass}">${initials(firstName, lastName)}</span>`;
  }

  function timeAgo(dateString) {
    const then = new Date(dateString).getTime();
    if (Number.isNaN(then)) return "";

    const diffMs = Date.now() - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;

    return `${Math.floor(months / 12)}y`;
  }

  function showToast(message, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;

    const icon = type === "success" ? "ti-circle-check" : type === "error" ? "ti-alert-circle" : "ti-info-circle";

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  }

  // ASP.NET's [ApiController] returns a ProblemDetails body on model
  // validation failures — shape: { errors: { FieldName: ["message", ...] } }
  // — which is different from our own Result<T> shape ({ status, message }).
  // If result.message isn't present, fall back to reading these field
  // errors so the person sees what actually went wrong instead of a
  // generic "Something went wrong."
  function extractErrorMessage(result) {
    if (result?.message) return result.message;

    if (result?.errors && typeof result.errors === "object") {
      const messages = Object.values(result.errors).flat();
      if (messages.length > 0) return messages.join(" ");
    }

    return "Something went wrong. Please try again.";
  }

  async function apiGet(url) {
    const response = await fetch(url, { method: "GET", headers: authHeaders });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new Error(extractErrorMessage(result));
    }
    return result.data;
  }

  async function apiPost(url, body, isForm) {
    const headers = isForm ? authHeaders : { ...authHeaders, "Content-Type": "application/json" };
    const response = await fetch(url, { method: "POST", headers, body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new Error(extractErrorMessage(result));
    }
    return result;
  }

  // ---------------- Topbar user info ----------------

  function initTopbarUser() {
    const avatarUrl = localStorage.getItem("pc_avatar_url") || "";
    const nameEl = document.getElementById("topbar-name");
    const avatarEl = document.getElementById("topbar-avatar");

    if (nameEl) nameEl.textContent = username;
    if (avatarEl) {
      if (avatarUrl) {
        avatarEl.src = avatarUrl;
      } else {
        avatarEl.style.display = "none";
      }
    }

    const toggle = document.getElementById("topbar-user-toggle");
    const dropdown = document.getElementById("topbar-dropdown");
    if (toggle && dropdown) {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("is-open");
      });
      document.addEventListener("click", () => dropdown.classList.remove("is-open"));
    }

    const logoutBtn = document.getElementById("topbar-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "login.html";
      });
    }

    const composerAvatarImg = document.getElementById("composer-avatar");
    const composerAvatarFallback = document.getElementById("composer-avatar-fallback");
    if (avatarUrl) {
      if (composerAvatarImg) {
        composerAvatarImg.src = avatarUrl;
        composerAvatarImg.hidden = false;
      }
    } else {
      if (composerAvatarFallback) {
        composerAvatarFallback.textContent = userInitials;
        composerAvatarFallback.hidden = false;
      }
    }
  }

  initTopbarUser();

  // ---------------- Composer ----------------

  const composerTextarea = document.getElementById("composer-textarea");
  const composerPostBtn = document.getElementById("composer-post-btn");
  const composerFileInput = document.getElementById("composer-file-input");
  const composerFilePreview = document.getElementById("composer-file-preview");
  const composerVisibility = document.getElementById("composer-visibility");

  let selectedFiles = [];

  function updatePostButtonState() {
    const hasContent = composerTextarea.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    composerPostBtn.disabled = !(hasContent || hasFiles);
  }

  composerTextarea.addEventListener("input", updatePostButtonState);

  document.getElementById("composer-photo-btn").addEventListener("click", () => {
    composerFileInput.accept = "image/*";
    composerFileInput.click();
  });

  document.getElementById("composer-video-btn").addEventListener("click", () => {
    composerFileInput.accept = "video/*";
    composerFileInput.click();
  });

  composerFileInput.addEventListener("change", () => {
    selectedFiles = selectedFiles.concat(Array.from(composerFileInput.files));
    renderFilePreview();
    updatePostButtonState();
    composerFileInput.value = "";
  });

  function renderFilePreview() {
    composerFilePreview.innerHTML = selectedFiles
      .map(
        (f, i) => `
      <span class="composer-file-chip">
        <i class="ti ${f.type.startsWith("video") ? "ti-video" : "ti-photo"}" aria-hidden="true"></i>
        ${escapeHtml(f.name)}
        <button type="button" data-remove-index="${i}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>`
      )
      .join("");

    composerFilePreview.querySelectorAll("[data-remove-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedFiles.splice(Number(btn.dataset.removeIndex), 1);
        renderFilePreview();
        updatePostButtonState();
      });
    });
  }

  composerPostBtn.addEventListener("click", async () => {
    composerPostBtn.disabled = true;
    composerPostBtn.textContent = "Posting...";

    try {
      const formData = new FormData();
      formData.append("Content", composerTextarea.value.trim());
      formData.append("Visibility", composerVisibility.value);
      selectedFiles.forEach((f) => formData.append("Attachments", f));

      await apiPost(API_ROUTES.createPost, formData, true);

      composerTextarea.value = "";
      selectedFiles = [];
      renderFilePreview();
      showToast("Post published", "success");

      currentPageSize = PAGE_SIZE;
      loadFeed();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      composerPostBtn.textContent = "Post";
      updatePostButtonState();
    }
  });

  // ---------------- Feed tabs ----------------

  document.querySelectorAll(".feed-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.classList.contains("is-active")) return;

      document.querySelectorAll(".feed-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      currentTab = tab.dataset.tab;
      currentPageSize = PAGE_SIZE;

      document.getElementById("feed-list").innerHTML = '<p class="app-loading-inline">Loading feed...</p>';
      loadFeed();
    });
  });

  // ---------------- Feed loading + rendering ----------------

  async function loadFeed() {
    const list = document.getElementById("feed-list");
    const emptyNote = document.getElementById("feed-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-feed");

    try {
      const page = await apiGet(
        `${API_ROUTES.getFeed}?tab=${currentTab}&pageNumber=1&pageSize=${currentPageSize}&usePaging=true`
      );
      const items = page?.items || [];

      if (items.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        loadMoreBtn.hidden = true;
        return;
      }

      emptyNote.hidden = true;
      list.innerHTML = items.map(renderPostCard).join("");
      wirePostCardActions(list);

      loadMoreBtn.hidden = items.length >= (page?.totalCount ?? 0);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  document.getElementById("btn-load-more-feed").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    currentPageSize += PAGE_SIZE;
    loadFeed().finally(() => {
      btn.disabled = false;
      btn.textContent = "Load more";
    });
  });

  // Feed = the visitor's existing network/connections presence, so every
  // link into post-detail.html from here is tagged "network" — distinct
  // from "search" (job-search.html) and "other" (algorithmic suggestions).
  function postDetailHref(postId) {
    return `post-detail.html?postId=${postId}&ref=network`;
  }

  function renderMediaGrid(urls, cssClass, linkPostId) {
    if (!urls || urls.length === 0) return "";

    const items = urls
      .slice(0, 4)
      .map((url) => {
        const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
        if (isVideo) {
          return `<video src="${escapeHtml(url)}" controls></video>`;
        }
        const img = `<img src="${escapeHtml(url)}" alt="" />`;
        return linkPostId ? `<a href="${postDetailHref(linkPostId)}">${img}</a>` : img;
      })
      .join("");

    return `<div class="${cssClass}" data-count="${Math.min(urls.length, 4)}">${items}</div>`;
  }

  function renderSharedPost(shared) {
    if (!shared) return "";

    return `
      <div class="shared-post">
        <div class="shared-post__header">
          ${avatarHtml(shared.authorProfilePictureUrl, shared.authorFirstName, shared.authorLastName, "shared-post__avatar")}
          <div>
            <p class="shared-post__name">${escapeHtml(shared.authorFirstName)} ${escapeHtml(shared.authorLastName)}</p>
            <span class="shared-post__meta">${timeAgo(shared.dateCreated)} ago</span>
          </div>
        </div>
        ${shared.content ? `<p class="shared-post__content">${escapeHtml(shared.content)}</p>` : ""}
        ${renderMediaGrid(shared.attachmentUrls, "shared-post__media")}
      </div>`;
  }

  function renderReactionSummary(post) {
    const topReactions = Object.entries(post.reactionCounts || {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topReactions.length === 0) {
      return '<span class="post-card__reaction-summary"></span>';
    }

    const icons = topReactions.map(([type]) => `<span>${REACTIONS[type]?.emoji || "👍"}</span>`).join("");

    return `
      <span class="post-card__reaction-summary">
        <span class="post-card__reaction-icons">${icons}</span>
        ${post.totalReactions}
      </span>`;
  }

  function renderPostCard(post) {
    const myReaction = post.myReaction;
    const reactionBtnLabel = myReaction ? REACTIONS[myReaction]?.label || "Like" : "Like";
    const reactionBtnEmoji = myReaction ? REACTIONS[myReaction]?.emoji || "👍" : "";

    const pickerButtons = Object.entries(REACTIONS)
      .map(([key, r]) => `<button type="button" data-reaction="${key}" title="${r.label}">${r.emoji}</button>`)
      .join("");

    return `
      <article class="card post-card" data-post-id="${post.id}" data-post-content="${encodeURIComponent(post.content || "")}" data-post-visibility="${post.visibility}">
        <div class="post-card__header">
          ${avatarHtml(post.authorProfilePictureUrl, post.authorFirstName, post.authorLastName, "post-card__avatar")}
          <div class="post-card__author">
            <p class="post-card__name">${escapeHtml(post.authorFirstName)} ${escapeHtml(post.authorLastName)}</p>
            <span class="post-card__meta">${timeAgo(post.dateCreated)} ago · <i class="ti ${post.visibility === "Connections" ? "ti-users" : "ti-world"}" aria-hidden="true"></i></span>
          </div>
          ${post.authorId === myUserId ? `
          <div class="post-card__menu-wrap">
            <button type="button" class="post-card__menu-btn" data-action="toggle-post-menu"><i class="ti ti-dots" aria-hidden="true"></i></button>
            <div class="post-card__menu">
              <button type="button" class="post-card__menu-item" data-action="edit-post">
                <i class="ti ti-pencil" aria-hidden="true"></i> Edit post
              </button>
              <button type="button" class="post-card__menu-item post-card__menu-item--danger" data-action="delete-post">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete post
              </button>
            </div>
          </div>` : ""}
        </div>

        <div class="post-edit-form" data-post-edit-form hidden>
          <textarea rows="3" data-post-edit-textarea></textarea>
          <select data-post-edit-visibility>
            <option value="Public">🌐 Public</option>
            <option value="Connections">👥 Connections only</option>
          </select>
          <div class="post-edit-form__actions">
            <button type="button" class="btn-outline-sm" data-action="cancel-edit-post">Cancel</button>
            <button type="button" class="btn-primary-sm" data-action="save-edit-post">Save changes</button>
          </div>
        </div>

        <div data-post-view-content>
        ${post.content ? `<p class="post-card__content"><a href="${postDetailHref(post.id)}" class="post-card__content-link">${escapeHtml(post.content)}</a></p>` : ""}
        ${renderMediaGrid(post.attachmentUrls, "post-card__media", post.id)}
        ${renderSharedPost(post.sharedPost)}
        </div>

        <div class="post-card__stats">
          ${renderReactionSummary(post)}
          <div class="post-card__stats-right">
            <a href="${postDetailHref(post.id)}" data-action="stats-comments-link">${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}</a>
            <span>${post.sharesCount} share${post.sharesCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div class="post-card__action-row">
          <div class="post-card__action-wrap">
            <button type="button" class="post-card__action-btn${myReaction ? " is-reacted" : ""}" data-action="quick-react">
              <span data-reaction-emoji>${reactionBtnEmoji || '<i class="ti ti-thumb-up" aria-hidden="true"></i>'}</span>
              <span data-reaction-label>${reactionBtnLabel}</span>
            </button>
            <div class="reaction-picker">${pickerButtons}</div>
          </div>
          <button type="button" class="post-card__action-btn" data-action="toggle-comments">
            <i class="ti ti-message-circle" aria-hidden="true"></i> Comment
          </button>
          ${(post.sharedPost ? post.sharedPost.authorId : post.authorId) !== myUserId ? `
          <button type="button" class="post-card__action-btn" data-action="toggle-share">
            <i class="ti ti-repeat" aria-hidden="true"></i> Share
          </button>` : ""}
        </div>

        <div class="share-composer">
          <textarea rows="2" placeholder="Add your thoughts (optional)..." data-share-text></textarea>
          <div class="share-composer__actions">
            <button type="button" class="btn-outline-sm" data-action="cancel-share">Cancel</button>
            <button type="button" class="btn-primary-sm" data-action="confirm-share">Share now</button>
          </div>
        </div>

        <div class="post-card__comments">
          <div class="comment-composer">
            <input type="text" placeholder="Write a comment..." data-comment-input />
            <button type="button" data-action="submit-comment"><i class="ti ti-send" aria-hidden="true"></i></button>
          </div>
          <div class="comment-list" data-comment-list></div>
        </div>
      </article>`;
  }

  // ---------------- Post card interactions ----------------

  function wirePostCardActions(container) {
    container.querySelectorAll(".post-card").forEach(wireSinglePostCard);
  }

  function wireSinglePostCard(card) {
    const postId = card.dataset.postId;

    // --- post menu (edit / delete) — only rendered for the post's author ---
    const menuBtn = card.querySelector('[data-action="toggle-post-menu"]');
    const menu = card.querySelector(".post-card__menu");

    if (menuBtn && menu) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllPostMenus();
        menu.classList.toggle("is-open");
      });

      card.querySelector('[data-action="delete-post"]').addEventListener("click", () => handleDeletePost(card, postId));
      card.querySelector('[data-action="edit-post"]').addEventListener("click", () => handleStartEditPost(card));
      card.querySelector('[data-action="cancel-edit-post"]').addEventListener("click", () => handleCancelEditPost(card));
      card.querySelector('[data-action="save-edit-post"]').addEventListener("click", () => handleSaveEditPost(card, postId));
    }

    // --- reaction quick button + picker ---
    const reactionWrap = card.querySelector(".post-card__action-wrap");
    const quickReactBtn = card.querySelector('[data-action="quick-react"]');
    const picker = card.querySelector(".reaction-picker");

    let pickerTimer = null;

    reactionWrap.addEventListener("mouseenter", () => {
      clearTimeout(pickerTimer);
      picker.classList.add("is-open");
    });
    reactionWrap.addEventListener("mouseleave", () => {
      pickerTimer = setTimeout(() => picker.classList.remove("is-open"), 300);
    });

    quickReactBtn.addEventListener("click", () => handleQuickReact(card, postId));

    picker.querySelectorAll("[data-reaction]").forEach((btn) => {
      btn.addEventListener("click", () => {
        picker.classList.remove("is-open");
        handleReact(card, postId, btn.dataset.reaction);
      });
    });

    // --- comments toggle + submit ---
    card.querySelectorAll('[data-action="toggle-comments"]').forEach((btn) => {
      btn.addEventListener("click", () => handleToggleComments(card, postId));
    });

    const commentInput = card.querySelector("[data-comment-input]");
    card.querySelector('[data-action="submit-comment"]').addEventListener("click", () => handleSubmitComment(card, postId, commentInput));
    commentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSubmitComment(card, postId, commentInput);
    });

    // --- share (button hidden entirely on your own posts) ---
    const shareComposer = card.querySelector(".share-composer");
    const shareToggleBtn = card.querySelector('[data-action="toggle-share"]');
    if (shareToggleBtn) {
      shareToggleBtn.addEventListener("click", () => {
        shareComposer.classList.toggle("is-open");
      });
    }
    card.querySelector('[data-action="cancel-share"]').addEventListener("click", () => {
      shareComposer.classList.remove("is-open");
    });
    card.querySelector('[data-action="confirm-share"]').addEventListener("click", () => handleShare(card, postId, shareComposer));
  }

  function closeAllPostMenus() {
    document.querySelectorAll(".post-card__menu.is-open").forEach((m) => m.classList.remove("is-open"));
  }
  document.addEventListener("click", closeAllPostMenus);

  async function handleDeletePost(card, postId) {
    closeAllPostMenus();

    try {
      const result = await apiPost(`${API_ROUTES.deletePost}?postId=${postId}`);
      showToast(result.message || "Post deleted", "success");
      card.remove();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function handleStartEditPost(card) {
    closeAllPostMenus();

    const editForm = card.querySelector("[data-post-edit-form]");
    const viewContent = card.querySelector("[data-post-view-content]");
    const textarea = card.querySelector("[data-post-edit-textarea]");
    const visibilitySelect = card.querySelector("[data-post-edit-visibility]");

    textarea.value = decodeURIComponent(card.dataset.postContent || "");
    visibilitySelect.value = card.dataset.postVisibility;

    editForm.hidden = false;
    viewContent.hidden = true;
    textarea.focus();
  }

  function handleCancelEditPost(card) {
    card.querySelector("[data-post-edit-form]").hidden = true;
    card.querySelector("[data-post-view-content]").hidden = false;
  }

  async function handleSaveEditPost(card, postId) {
    const saveBtn = card.querySelector('[data-action="save-edit-post"]');
    const textarea = card.querySelector("[data-post-edit-textarea]");
    const visibilitySelect = card.querySelector("[data-post-edit-visibility]");

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      await apiPost(
        API_ROUTES.updatePost,
        JSON.stringify({
          postId,
          content: textarea.value.trim(),
          visibility: visibilitySelect.value,
        })
      );

      showToast("Post updated", "success");
      handleCancelEditPost(card);

      currentPageSize = PAGE_SIZE;
      loadFeed();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save changes";
    }
  }

  async function handleQuickReact(card, postId) {
    const btn = card.querySelector('[data-action="quick-react"]');
    const isReacted = btn.classList.contains("is-reacted");

    try {
      if (isReacted) {
        await apiPost(`${API_ROUTES.removeReaction}?postId=${postId}`);
        btn.classList.remove("is-reacted");
        btn.querySelector("[data-reaction-emoji]").innerHTML = '<i class="ti ti-thumb-up" aria-hidden="true"></i>';
        btn.querySelector("[data-reaction-label]").textContent = "Like";
      } else {
        await apiPost(`${API_ROUTES.reactToPost}?postId=${postId}&reactionType=Like`);
        btn.classList.add("is-reacted");
        btn.querySelector("[data-reaction-emoji]").textContent = "👍";
        btn.querySelector("[data-reaction-label]").textContent = "Like";
      }
      refreshReactionSummary(card, postId);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleReact(card, postId, reactionType) {
    const btn = card.querySelector('[data-action="quick-react"]');

    try {
      await apiPost(`${API_ROUTES.reactToPost}?postId=${postId}&reactionType=${reactionType}`);
      btn.classList.add("is-reacted");
      btn.querySelector("[data-reaction-emoji]").textContent = REACTIONS[reactionType]?.emoji || "👍";
      btn.querySelector("[data-reaction-label]").textContent = REACTIONS[reactionType]?.label || "Like";
      refreshReactionSummary(card, postId);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function refreshReactionSummary(card, postId) {
    try {
      const post = await apiGet(`${API_ROUTES.getPostById}/${postId}`);
      const statsBar = card.querySelector(".post-card__stats");
      statsBar.innerHTML = `
        ${renderReactionSummary(post)}
        <div class="post-card__stats-right">
          <a href="${postDetailHref(postId)}" data-action="stats-comments-link">${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}</a>
          <span>${post.sharesCount} share${post.sharesCount === 1 ? "" : "s"}</span>
        </div>`;
      // No re-wiring needed here — the "N comments" element is now a plain
      // link to the detail page, not a button with a click handler.
    } catch {
      // Non-critical — the reaction itself already succeeded, just skip the count refresh.
    }
  }

  let loadedComments = new Set();

  async function handleToggleComments(card, postId) {
    const panel = card.querySelector(".post-card__comments");
    panel.classList.toggle("is-open");

    if (panel.classList.contains("is-open") && !loadedComments.has(postId)) {
      await loadComments(card, postId);
      loadedComments.add(postId);
    }
  }

  async function loadComments(card, postId) {
    const list = card.querySelector("[data-comment-list]");
    list.innerHTML = '<p class="app-loading-inline">Loading comments...</p>';

    try {
      const page = await apiGet(`${API_ROUTES.getComments}?postId=${postId}&pageNumber=1&pageSize=20&usePaging=true`);
      const items = page?.items || [];

      if (items.length === 0) {
        list.innerHTML = '<p class="app-loading-inline">No comments yet. Be the first to comment.</p>';
        return;
      }

      list.innerHTML = items.map(renderCommentRow).join("");
      wireCommentRowActions(card, list, postId);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderCommentRow(comment) {
    const isMine = comment.authorId === myUserId;

    return `
      <div class="comment-row" data-comment-id="${comment.id}">
        ${avatarHtml(comment.authorProfilePictureUrl, comment.authorFirstName, comment.authorLastName, "comment-row__avatar")}
        <div class="comment-row__bubble">
          <p class="comment-row__name">${escapeHtml(comment.authorFirstName)} ${escapeHtml(comment.authorLastName)}<span class="comment-row__time">${timeAgo(comment.dateCreated)} ago${comment.dateUpdated && comment.dateUpdated !== comment.dateCreated ? " · edited" : ""}</span></p>
          <p class="comment-row__text" data-comment-text>${escapeHtml(comment.content)}</p>
          <div class="comment-row__edit-form" data-comment-edit-form hidden>
            <input type="text" data-comment-edit-input value="${escapeHtml(comment.content)}" />
            <button type="button" class="btn-outline-sm" data-action="cancel-edit-comment">Cancel</button>
            <button type="button" class="btn-primary-sm" data-action="save-edit-comment">Save</button>
          </div>
        </div>
        ${isMine ? `
        <div class="comment-row__menu-wrap">
          <button type="button" class="comment-row__menu-btn" data-action="toggle-comment-menu"><i class="ti ti-dots" aria-hidden="true"></i></button>
          <div class="comment-row__menu">
            <button type="button" class="comment-row__menu-item" data-action="edit-comment">
              <i class="ti ti-pencil" aria-hidden="true"></i> Edit
            </button>
            <button type="button" class="comment-row__menu-item comment-row__menu-item--danger" data-action="delete-comment">
              <i class="ti ti-trash" aria-hidden="true"></i> Delete
            </button>
          </div>
        </div>` : ""}
      </div>`;
  }

  function wireCommentRowActions(card, list, postId) {
    list.querySelectorAll(".comment-row").forEach((row) => {
      const menuBtn = row.querySelector('[data-action="toggle-comment-menu"]');
      if (!menuBtn) return; // not my comment — no menu rendered

      const menu = row.querySelector(".comment-row__menu");
      const commentId = row.dataset.commentId;

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllCommentMenus();
        menu.classList.toggle("is-open");
      });

      row.querySelector('[data-action="delete-comment"]').addEventListener("click", () => handleDeleteComment(card, row, commentId, postId));
      row.querySelector('[data-action="edit-comment"]').addEventListener("click", () => handleStartEditComment(row));
      row.querySelector('[data-action="cancel-edit-comment"]').addEventListener("click", () => handleCancelEditComment(row));
      row.querySelector('[data-action="save-edit-comment"]').addEventListener("click", () => handleSaveEditComment(row, commentId));
    });
  }

  function closeAllCommentMenus() {
    document.querySelectorAll(".comment-row__menu.is-open").forEach((m) => m.classList.remove("is-open"));
  }
  document.addEventListener("click", closeAllCommentMenus);

  function handleStartEditComment(row) {
    closeAllCommentMenus();
    row.querySelector("[data-comment-text]").hidden = true;
    row.querySelector("[data-comment-edit-form]").hidden = false;
    row.querySelector("[data-comment-edit-input]").focus();
  }

  function handleCancelEditComment(row) {
    row.querySelector("[data-comment-text]").hidden = false;
    row.querySelector("[data-comment-edit-form]").hidden = true;
  }

  async function handleSaveEditComment(row, commentId) {
    const input = row.querySelector("[data-comment-edit-input]");
    const content = input.value.trim();
    if (!content) return;

    try {
      await apiPost(API_ROUTES.updateComment, JSON.stringify({ commentId, content }));
      row.querySelector("[data-comment-text]").textContent = content;
      handleCancelEditComment(row);
      showToast("Comment updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleDeleteComment(card, row, commentId, postId) {
    closeAllCommentMenus();

    try {
      const result = await apiPost(`${API_ROUTES.deleteComment}?commentId=${commentId}`);
      showToast(result.message || "Comment deleted", "success");
      row.remove();
      refreshReactionSummary(card, postId);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleSubmitComment(card, postId, input) {
    const content = input.value.trim();
    if (!content) return;

    input.disabled = true;

    try {
      await apiPost(`${API_ROUTES.addComment}?postId=${postId}&content=${encodeURIComponent(content)}`);
      input.value = "";
      loadedComments.delete(postId);
      await loadComments(card, postId);
      loadedComments.add(postId);
      refreshReactionSummary(card, postId);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  async function handleShare(card, postId, shareComposer) {
    const textarea = shareComposer.querySelector("[data-share-text]");
    const content = textarea.value.trim();
    const confirmBtn = shareComposer.querySelector('[data-action="confirm-share"]');

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Sharing...";

    try {
      const contentParam = content ? `&content=${encodeURIComponent(content)}` : "";
      const result = await apiPost(`${API_ROUTES.sharePost}?postId=${postId}${contentParam}`);
      showToast(result.message || "Post shared", "success");
      textarea.value = "";
      shareComposer.classList.remove("is-open");

      currentPageSize = PAGE_SIZE;
      loadFeed();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Share now";
    }
  }

  // ---------------- Init ----------------

  loadFeed();
});