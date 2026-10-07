document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const username = localStorage.getItem("pc_username") || "You";
  const myUserId = localStorage.getItem("pc_user_id") || "";

  const params = new URLSearchParams(window.location.search);
  const postId = params.get("postId");

  if (!postId) {
    window.location.href = "feed.html";
    return;
  }

  const COMMENTS_PAGE_SIZE = 10;
  let currentCommentsPageSize = COMMENTS_PAGE_SIZE;

  const REACTIONS = {
    Like: { emoji: "👍", label: "Like" },
    Love: { emoji: "❤️", label: "Love" },
    Celebrate: { emoji: "🎉", label: "Celebrate" },
    Support: { emoji: "🤝", label: "Support" },
    Insightful: { emoji: "💡", label: "Insightful" },
    Funny: { emoji: "😄", label: "Funny" },
  };

  // ---------------- Helpers ----------------

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

  // NOTE: showToast is now the global one from Scripts/toast.js (loaded via
  // a <script> tag on this page) — the local duplicate that used to live
  // here (rendering into a #toast-stack div) has been removed. Its default
  // type ("info") already matched the global default.

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

  async function apiPost(url) {
    const response = await fetch(url, { method: "POST", headers: authHeaders });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) {
      throw new Error(extractErrorMessage(result));
    }
    return result;
  }

  async function apiPostJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      if (avatarUrl) avatarEl.src = avatarUrl;
      else avatarEl.style.display = "none";
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
  }

  initTopbarUser();

  // ---------------- Post rendering ----------------

  function renderMediaGrid(urls, cssClass) {
    if (!urls || urls.length === 0) return "";

    const items = urls
      .slice(0, 4)
      .map((url) => {
        const isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
        return isVideo
          ? `<video src="${escapeHtml(url)}" controls></video>`
          : `<img src="${escapeHtml(url)}" alt="" />`;
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

  let currentPost = null;

  async function loadPost() {
    const container = document.getElementById("post-detail-container");

    try {
      currentPost = await apiGet(`${API_ROUTES.getPostById}/${postId}`);
      renderPost(currentPost);
      document.getElementById("comments-section").hidden = false;
      document.getElementById("comments-total").textContent = currentPost.commentsCount;
      loadComments();

      loadAuthorCard(currentPost.authorId);
      loadMoreFromAuthor(currentPost.authorId);
      loadPeopleToFollow();
    } catch (err) {
      container.innerHTML = `<p class="empty-note">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------------- About the author ----------------

  async function loadAuthorCard(authorId) {
    const card = document.getElementById("author-card");

    try {
      const summary = await apiGet(`${API_ROUTES.getUserPublicProfile}/${authorId}/public-profile`);

      document.getElementById("author-card-avatar").innerHTML = summary.profilePictureUrl
        ? `<img src="${escapeHtml(summary.profilePictureUrl)}" alt="" />`
        : `<span class="author-avatar-fallback">${initials(summary.firstName, summary.lastName)}</span>`;

      document.getElementById("author-card-name").textContent = `${summary.firstName} ${summary.lastName}`;

      const headlineEl = document.getElementById("author-card-headline");
      headlineEl.textContent = summary.headline || "";
      headlineEl.hidden = !summary.headline;

      const locationEl = document.getElementById("author-card-location");
      if (summary.location) {
        locationEl.querySelector("span").textContent = summary.location;
        locationEl.hidden = false;
      }

      document.getElementById("author-card-followers").textContent =
        `${summary.followerCount} follower${summary.followerCount === 1 ? "" : "s"}`;

      const followBtn = document.getElementById("author-card-follow-btn");
      const isSelf = authorId === localStorage.getItem("pc_user_id");

      if (isSelf) {
        followBtn.hidden = true;
      } else {
        setFollowButtonState(followBtn, summary.isFollowedByMe);
        followBtn.addEventListener("click", () => handleToggleFollow(authorId, followBtn));
      }

      card.hidden = false;
    } catch {
      // Non-critical panel — fail silently rather than blocking the page.
    }
  }

  function setFollowButtonState(btn, isFollowing) {
    btn.textContent = isFollowing ? "Following" : "+ Follow";
    btn.classList.toggle("is-following", isFollowing);
    btn.dataset.following = isFollowing ? "true" : "false";
  }

  async function handleToggleFollow(authorId, btn) {
    const isFollowing = btn.dataset.following === "true";
    btn.disabled = true;

    try {
      if (isFollowing) {
        await apiPost(`${API_ROUTES.unfollowUser}?userId=${authorId}`);
        setFollowButtonState(btn, false);
        showToast("Unfollowed", "success");
      } else {
        await apiPost(`${API_ROUTES.followUser}?userId=${authorId}`);
        setFollowButtonState(btn, true);
        showToast("You are now following this user", "success");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------------- More from this author ----------------

  async function loadMoreFromAuthor(authorId) {
    const card = document.getElementById("more-from-author-card");
    const list = document.getElementById("more-from-author-list");

    try {
      const page = await apiGet(
        `${API_ROUTES.getPostsByUser}/${authorId}?pageNumber=1&pageSize=4&usePaging=true`
      );
      const items = (page?.items || []).filter((p) => p.id !== postId).slice(0, 3);

      if (items.length === 0) return;

      list.innerHTML = items
        .map(
          (p) => `
        <a href="post-detail.html?postId=${p.id}" class="side-post-item">
          <p class="side-post-item__content">${escapeHtml(p.content || "(shared a post)")}</p>
          <span class="side-post-item__meta">${timeAgo(p.dateCreated)} ago · ${p.totalReactions} reaction${p.totalReactions === 1 ? "" : "s"}</span>
        </a>`
        )
        .join("");

      card.hidden = false;
    } catch {
      // Non-critical panel — fail silently.
    }
  }

  // ---------------- People to follow (reuses Discover People's Suggestions) ----------------

  async function loadPeopleToFollow() {
    const card = document.getElementById("people-to-follow-card");
    const list = document.getElementById("people-to-follow-list");

    try {
      const suggestions = await apiGet(`${API_ROUTES.getConnectionSuggestions}?filter=All&maxResults=3`);

      if (!suggestions || suggestions.length === 0) return;

      list.innerHTML = suggestions
        .map(
          (p) => `
        <div class="side-suggestion-row">
          ${avatarHtml(p.profilePictureUrl, p.firstName, p.lastName, "side-suggestion-row__avatar")}
          <div class="side-suggestion-row__body">
            <p class="side-suggestion-row__name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</p>
            <span class="side-suggestion-row__meta">${escapeHtml(p.headline || p.companyName || "")}</span>
          </div>
          <button type="button" class="btn-outline-sm" data-connect-user="${p.userId}">Connect</button>
        </div>`
        )
        .join("");

      list.querySelectorAll("[data-connect-user]").forEach((btn) => {
        btn.addEventListener("click", () => handleConnectSuggestion(btn));
      });

      card.hidden = false;
    } catch {
      // Non-critical panel — fail silently.
    }
  }

  async function handleConnectSuggestion(btn) {
    const userId = btn.dataset.connectUser;
    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const result = await apiPost(`${API_ROUTES.sendConnectionRequest}?receiverId=${userId}`);
      showToast(result.message || "Invitation sent", "success");
      btn.textContent = "Pending";
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  }

  function renderPost(post) {
    const container = document.getElementById("post-detail-container");
    const myReaction = post.myReaction;
    const reactionBtnLabel = myReaction ? REACTIONS[myReaction]?.label || "Like" : "Like";
    const reactionBtnEmoji = myReaction ? REACTIONS[myReaction]?.emoji || "👍" : "";

    const pickerButtons = Object.entries(REACTIONS)
      .map(([key, r]) => `<button type="button" data-reaction="${key}" title="${r.label}">${r.emoji}</button>`)
      .join("");

    container.innerHTML = `
      <article class="card post-card">
        <div class="post-card__header">
          ${avatarHtml(post.authorProfilePictureUrl, post.authorFirstName, post.authorLastName, "post-card__avatar")}
          <div class="post-card__author">
            <p class="post-card__name">${escapeHtml(post.authorFirstName)} ${escapeHtml(post.authorLastName)}</p>
            <span class="post-card__meta">${timeAgo(post.dateCreated)} ago · <i class="ti ${post.visibility === "Connections" ? "ti-users" : "ti-world"}" aria-hidden="true"></i></span>
          </div>
          ${post.authorId === myUserId ? `
          <div class="post-card__menu-wrap">
            <button type="button" class="post-card__menu-btn" id="post-menu-btn"><i class="ti ti-dots" aria-hidden="true"></i></button>
            <div class="post-card__menu" id="post-menu">
              <button type="button" class="post-card__menu-item" id="edit-post-btn">
                <i class="ti ti-pencil" aria-hidden="true"></i> Edit post
              </button>
              <button type="button" class="post-card__menu-item post-card__menu-item--danger" id="delete-post-btn">
                <i class="ti ti-trash" aria-hidden="true"></i> Delete post
              </button>
            </div>
          </div>` : ""}
        </div>

        <div class="post-edit-form" id="post-edit-form" hidden>
          <textarea id="post-edit-textarea" rows="3"></textarea>
          <select id="post-edit-visibility">
            <option value="Public">🌐 Public</option>
            <option value="Connections">👥 Connections only</option>
          </select>
          <div class="post-edit-form__actions">
            <button type="button" class="btn-outline-sm" id="cancel-edit-post-btn">Cancel</button>
            <button type="button" class="btn-primary-sm" id="save-edit-post-btn">Save changes</button>
          </div>
        </div>

        <div id="post-view-content"></div>

        <div class="post-card__stats" id="post-stats-bar">
          ${renderReactionSummary(post)}
          <div class="post-card__stats-right">
            <span>${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}</span>
            <span>${post.sharesCount} share${post.sharesCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div class="post-card__action-row">
          <div class="post-card__action-wrap">
            <button type="button" class="post-card__action-btn${myReaction ? " is-reacted" : ""}" id="quick-react-btn">
              <span id="reaction-emoji">${reactionBtnEmoji || '<i class="ti ti-thumb-up" aria-hidden="true"></i>'}</span>
              <span id="reaction-label">${reactionBtnLabel}</span>
            </button>
            <div class="reaction-picker" id="reaction-picker">${pickerButtons}</div>
          </div>
          <button type="button" class="post-card__action-btn" id="focus-comment-btn">
            <i class="ti ti-message-circle" aria-hidden="true"></i> Comment
          </button>
          ${(post.sharedPost ? post.sharedPost.authorId : post.authorId) !== myUserId ? `
          <button type="button" class="post-card__action-btn" id="toggle-share-btn">
            <i class="ti ti-repeat" aria-hidden="true"></i> Share
          </button>` : ""}
        </div>

        <div class="share-composer" id="share-composer">
          <textarea rows="2" placeholder="Add your thoughts (optional)..." id="share-text"></textarea>
          <div class="share-composer__actions">
            <button type="button" class="btn-outline-sm" id="cancel-share-btn">Cancel</button>
            <button type="button" class="btn-primary-sm" id="confirm-share-btn">Share now</button>
          </div>
        </div>
      </article>`;

    document.getElementById("post-view-content").innerHTML = `
      ${post.content ? `<p class="post-card__content">${escapeHtml(post.content)}</p>` : ""}
      ${renderMediaGrid(post.attachmentUrls, "post-card__media")}
      ${renderSharedPost(post.sharedPost)}`;

    wirePostActions();
    wirePostMenu(post);
  }

  function wirePostMenu(post) {
    const menuBtn = document.getElementById("post-menu-btn");
    if (!menuBtn) return; // not the author — no menu rendered

    const menu = document.getElementById("post-menu");

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("is-open");
    });
    document.addEventListener("click", () => menu.classList.remove("is-open"));

    document.getElementById("delete-post-btn").addEventListener("click", async () => {
      menu.classList.remove("is-open");

      try {
        const result = await apiPost(`${API_ROUTES.deletePost}?postId=${postId}`);
        showToast(result.message || "Post deleted", "success");
        window.location.href = "feed.html";
      } catch (err) {
        showToast(err.message, "error");
      }
    });

    const editForm = document.getElementById("post-edit-form");
    const editTextarea = document.getElementById("post-edit-textarea");
    const editVisibility = document.getElementById("post-edit-visibility");
    const viewContent = document.getElementById("post-view-content");

    document.getElementById("edit-post-btn").addEventListener("click", () => {
      menu.classList.remove("is-open");
      editTextarea.value = post.content || "";
      editVisibility.value = post.visibility;
      editForm.hidden = false;
      viewContent.hidden = true;
      editTextarea.focus();
    });

    document.getElementById("cancel-edit-post-btn").addEventListener("click", () => {
      editForm.hidden = true;
      viewContent.hidden = false;
    });

    document.getElementById("save-edit-post-btn").addEventListener("click", async () => {
      const saveBtn = document.getElementById("save-edit-post-btn");
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      try {
        await apiPostJson(API_ROUTES.updatePost, {
          postId,
          content: editTextarea.value.trim(),
          visibility: editVisibility.value,
        });

        showToast("Post updated", "success");
        editForm.hidden = true;
        viewContent.hidden = false;
        loadPost();
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save changes";
      }
    });
  }

  function wirePostActions() {
    const wrap = document.querySelector(".post-card__action-wrap");
    const picker = document.getElementById("reaction-picker");
    let pickerTimer = null;

    wrap.addEventListener("mouseenter", () => {
      clearTimeout(pickerTimer);
      picker.classList.add("is-open");
    });
    wrap.addEventListener("mouseleave", () => {
      pickerTimer = setTimeout(() => picker.classList.remove("is-open"), 300);
    });

    document.getElementById("quick-react-btn").addEventListener("click", handleQuickReact);

    picker.querySelectorAll("[data-reaction]").forEach((btn) => {
      btn.addEventListener("click", () => {
        picker.classList.remove("is-open");
        handleReact(btn.dataset.reaction);
      });
    });

    document.getElementById("focus-comment-btn").addEventListener("click", () => {
      document.getElementById("detail-comment-input").focus();
      document.getElementById("comments-section").scrollIntoView({ behavior: "smooth" });
    });

    const shareComposer = document.getElementById("share-composer");
    const shareToggleBtn = document.getElementById("toggle-share-btn");
    if (shareToggleBtn) {
      shareToggleBtn.addEventListener("click", () => {
        shareComposer.classList.toggle("is-open");
      });
    }
    document.getElementById("cancel-share-btn").addEventListener("click", () => {
      shareComposer.classList.remove("is-open");
    });
    document.getElementById("confirm-share-btn").addEventListener("click", handleShare);
  }

  async function handleQuickReact() {
    const btn = document.getElementById("quick-react-btn");
    const isReacted = btn.classList.contains("is-reacted");

    try {
      if (isReacted) {
        await apiPost(`${API_ROUTES.removeReaction}?postId=${postId}`);
        btn.classList.remove("is-reacted");
        document.getElementById("reaction-emoji").innerHTML = '<i class="ti ti-thumb-up" aria-hidden="true"></i>';
        document.getElementById("reaction-label").textContent = "Like";
      } else {
        await apiPost(`${API_ROUTES.reactToPost}?postId=${postId}&reactionType=Like`);
        btn.classList.add("is-reacted");
        document.getElementById("reaction-emoji").textContent = "👍";
        document.getElementById("reaction-label").textContent = "Like";
      }
      refreshStats();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleReact(reactionType) {
    const btn = document.getElementById("quick-react-btn");

    try {
      await apiPost(`${API_ROUTES.reactToPost}?postId=${postId}&reactionType=${reactionType}`);
      btn.classList.add("is-reacted");
      document.getElementById("reaction-emoji").textContent = REACTIONS[reactionType]?.emoji || "👍";
      document.getElementById("reaction-label").textContent = REACTIONS[reactionType]?.label || "Like";
      refreshStats();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function refreshStats() {
    try {
      const post = await apiGet(`${API_ROUTES.getPostById}/${postId}`);
      currentPost = post;
      document.getElementById("post-stats-bar").innerHTML = `
        ${renderReactionSummary(post)}
        <div class="post-card__stats-right">
          <span>${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}</span>
          <span>${post.sharesCount} share${post.sharesCount === 1 ? "" : "s"}</span>
        </div>`;
    } catch {
      // Non-critical.
    }
  }

  async function handleShare() {
    const textarea = document.getElementById("share-text");
    const confirmBtn = document.getElementById("confirm-share-btn");
    const content = textarea.value.trim();

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Sharing...";

    try {
      const contentParam = content ? `&content=${encodeURIComponent(content)}` : "";
      const result = await apiPost(`${API_ROUTES.sharePost}?postId=${postId}${contentParam}`);
      showToast(result.message || "Post shared", "success");
      textarea.value = "";
      document.getElementById("share-composer").classList.remove("is-open");
      refreshStats();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Share now";
    }
  }

  // ---------------- Comments ----------------

  async function loadComments() {
    const list = document.getElementById("detail-comment-list");
    const emptyNote = document.getElementById("comments-empty");
    const loadMoreBtn = document.getElementById("btn-load-more-comments");

    try {
      const page = await apiGet(
        `${API_ROUTES.getComments}?postId=${postId}&pageNumber=1&pageSize=${currentCommentsPageSize}&usePaging=true`
      );
      const items = page?.items || [];

      if (items.length === 0) {
        list.innerHTML = "";
        emptyNote.hidden = false;
        loadMoreBtn.hidden = true;
        return;
      }

      emptyNote.hidden = true;
      list.innerHTML = items.map(renderCommentRow).join("");
      wireCommentRowActions(list);
      document.getElementById("comments-total").textContent = page.totalCount;

      loadMoreBtn.hidden = items.length >= (page?.totalCount ?? 0);
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

  function wireCommentRowActions(container) {
    container.querySelectorAll(".comment-row").forEach((row) => {
      const menuBtn = row.querySelector('[data-action="toggle-comment-menu"]');
      if (!menuBtn) return;

      const menu = row.querySelector(".comment-row__menu");
      const commentId = row.dataset.commentId;

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllCommentMenus();
        menu.classList.toggle("is-open");
      });

      row.querySelector('[data-action="delete-comment"]').addEventListener("click", () => handleDeleteComment(row, commentId));
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
      await apiPostJson(API_ROUTES.updateComment, { commentId, content });
      row.querySelector("[data-comment-text]").textContent = content;
      handleCancelEditComment(row);
      showToast("Comment updated", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  async function handleDeleteComment(row, commentId) {
    closeAllCommentMenus();

    try {
      const result = await apiPost(`${API_ROUTES.deleteComment}?commentId=${commentId}`);
      showToast(result.message || "Comment deleted", "success");
      row.remove();

      const totalEl = document.getElementById("comments-total");
      totalEl.textContent = Math.max(0, Number(totalEl.textContent) - 1);
      refreshStats();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  document.getElementById("btn-load-more-comments").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Loading...";
    currentCommentsPageSize += COMMENTS_PAGE_SIZE;
    loadComments().finally(() => {
      btn.disabled = false;
      btn.textContent = "View more comments";
    });
  });

  document.getElementById("detail-comment-submit").addEventListener("click", submitComment);
  document.getElementById("detail-comment-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitComment();
  });

  async function submitComment() {
    const input = document.getElementById("detail-comment-input");
    const content = input.value.trim();
    if (!content) return;

    input.disabled = true;

    try {
      await apiPost(`${API_ROUTES.addComment}?postId=${postId}&content=${encodeURIComponent(content)}`);
      input.value = "";
      currentCommentsPageSize = COMMENTS_PAGE_SIZE;
      await loadComments();
      refreshStats();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // ---------------- Init ----------------

  loadPost();
});