document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("pc_token") || sessionStorage.getItem("pc_token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const myUserId = localStorage.getItem("pc_user_id") || "";
  const username = localStorage.getItem("pc_username") || "You";

  // Hub is mapped at the API root (e.g. https://localhost:7059/chatHub),
  // not under /api like every REST route — strip the trailing /api.
  const HUB_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "");

  // Below this width (phone-sized, not tablet/narrow-desktop), opening a
  // conversation hides the list pane and shows only the chat pane, with
  // a back button to return. Matches the @media (max-width: 640px) rule
  // in messages.css.
  const MOBILE_CHAT_BREAKPOINT = 640;

  let activeConversationId = null;
  let allConversations = [];
  let oldestLoadedMessagePage = 1;
  const MESSAGES_PAGE_SIZE = 30;

  // conversationId -> array of { userId, firstName, lastName, profilePictureUrl }
  const participantsCache = {};

  // conversationId -> Set of userIds currently typing in that conversation
  const typingUsersByConversation = {};

  // userIds currently known to be online (from GetOnlineStatus snapshot +
  // live UserOnline/UserOffline events)
  const onlineUserIds = new Set();

  let stopTypingTimer = null;
  let lastTypingInvokeAt = 0;

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

  function avatarHtml(url, firstName, lastName, cssClass) {
    if (url) {
      return `<img class="${cssClass}" src="${escapeHtml(url)}" alt="" />`;
    }
    return `<span class="${cssClass}">${initials(firstName, lastName)}</span>`;
  }

  function timeAgo(dateString) {
    const then = new Date(dateString).getTime();
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatClockTime(dateString) {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  // NOTE: showToast is the global one from Scripts/toast.js (loaded via a
  // <script> tag on this page) — no local duplicate here.

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
    if (!response.ok || result.status === false) throw new Error(extractErrorMessage(result));
    return result.data;
  }

  async function apiPost(url, body, isForm) {
    const headers = isForm ? authHeaders : { ...authHeaders, "Content-Type": "application/json" };
    const response = await fetch(url, { method: "POST", headers, body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status === false) throw new Error(extractErrorMessage(result));
    return result;
  }

  // Topbar name/avatar/dropdown/logout are handled centrally by
  // sidebar.js's renderTopbarUserInfo() — no per-page duplicate needed here.

  // ---------------- Mobile list/chat pane toggle ----------------
  // On phone-sized screens, opening a conversation hides the list and
  // shows only the chat pane (with a back button). Above the breakpoint
  // this is a no-op — both panes always show side by side via CSS.

  function openMobileChatView() {
    if (window.innerWidth > MOBILE_CHAT_BREAKPOINT) return;
    const shell = document.getElementById("messages-shell");
    if (shell) shell.classList.add("is-mobile-chat-open");
  }

  function closeMobileChatView() {
    const shell = document.getElementById("messages-shell");
    if (shell) shell.classList.remove("is-mobile-chat-open");
  }

  const chatBackBtn = document.getElementById("chat-back-btn");
  if (chatBackBtn) {
    chatBackBtn.addEventListener("click", closeMobileChatView);
  }

  // ==========================================================================
  // SignalR connection
  // ==========================================================================

  let connection = null;

  async function initSignalR() {
    connection = new signalR.HubConnectionBuilder()
      .withUrl(`${HUB_BASE_URL}/chatHub?access_token=${encodeURIComponent(token)}`)
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveMessage", handleIncomingMessage);
    connection.on("UserTyping", handleUserTyping);
    connection.on("UserStoppedTyping", handleUserStoppedTyping);
    connection.on("UserOnline", (userId) => setUserPresence(userId, true));
    connection.on("UserOffline", (userId) => setUserPresence(userId, false));

    try {
      await connection.start();
      await refreshOnlineSnapshot();
    } catch (err) {
      console.error("SignalR connection failed:", err);
      // Real-time features (live delivery, typing, presence) won't work,
      // but the page still works via REST — not a hard failure.
    }
  }

  // Asks the hub which of our conversation partners are online RIGHT NOW.
  // Without this, presence would only update after a future connect/
  // disconnect event — this gives an accurate starting snapshot.
  async function refreshOnlineSnapshot() {
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) return;

    const relevantUserIds = new Set();
    allConversations.forEach((c) => {
      if (!c.isGroup && c.otherUserId) relevantUserIds.add(c.otherUserId);
    });

    if (relevantUserIds.size === 0) return;

    try {
      const online = await connection.invoke("GetOnlineStatus", Array.from(relevantUserIds));
      online.forEach((userId) => setUserPresence(userId, true));
    } catch (err) {
      console.error("Couldn't fetch online status:", err);
    }
  }

  function setUserPresence(userId, isOnline) {
    if (isOnline) onlineUserIds.add(userId);
    else onlineUserIds.delete(userId);

    // Update any matching conversation-list row's presence dot.
    document.querySelectorAll(`.conversation-row[data-other-user-id="${userId}"] .conversation-row__presence-dot`).forEach((dot) => {
      dot.classList.toggle("is-online", isOnline);
    });

    // Update the active chat header, if it's a 1:1 with this exact person.
    const activeConv = allConversations.find((c) => c.id === activeConversationId);
    if (activeConv && !activeConv.isGroup && activeConv.otherUserId === userId) {
      const statusEl = document.getElementById("chat-header-status");
      statusEl.textContent = isOnline ? "Online" : "Offline";
      statusEl.classList.toggle("is-online", isOnline);

      const headerDot = document.getElementById("chat-header-presence-dot");
      if (headerDot) headerDot.classList.toggle("is-online", isOnline);
    }
  }

  function handleIncomingMessage(payload) {
    // Always refresh the list (updates last-message preview, unread count,
    // reorders by activity) regardless of which conversation is open.
    loadConversations();

    if (payload.conversationId !== activeConversationId) return;

    const container = document.getElementById("chat-messages");
    const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;

    const activeConv = allConversations.find((c) => c.id === activeConversationId);
    container.insertAdjacentHTML("beforeend", renderMessageBubble(payload, activeConv?.isGroup));

    if (wasNearBottom) container.scrollTop = container.scrollHeight;

    // Mark read immediately since the conversation is actively open.
    apiPost(`${API_ROUTES.markConversationRead}?conversationId=${activeConversationId}`).catch(() => {});
  }

  function handleUserTyping(conversationId, userId) {
    if (userId === myUserId) return;

    if (!typingUsersByConversation[conversationId]) {
      typingUsersByConversation[conversationId] = new Set();
    }
    typingUsersByConversation[conversationId].add(userId);

    updateConversationRowTypingState(conversationId);

    if (conversationId === activeConversationId) {
      showTypingIndicator(conversationId);
    }
  }

  function handleUserStoppedTyping(conversationId, userId) {
    const set = typingUsersByConversation[conversationId];
    if (set) {
      set.delete(userId);
      if (set.size === 0) delete typingUsersByConversation[conversationId];
    }

    updateConversationRowTypingState(conversationId);

    if (conversationId === activeConversationId && (!set || set.size === 0)) {
      hideTypingIndicator();
    }
  }

  function updateConversationRowTypingState(conversationId) {
    const row = document.querySelector(`.conversation-row[data-conversation-id="${conversationId}"] .conversation-row__preview`);
    if (!row) return;

    const isTyping = (typingUsersByConversation[conversationId]?.size || 0) > 0;

    if (isTyping) {
      row.textContent = "typing...";
      row.classList.add("is-typing-preview");
    } else {
      row.classList.remove("is-typing-preview");
      const conv = allConversations.find((c) => c.id === conversationId);
      if (conv) {
        row.textContent = `${conv.lastMessageSenderFirstName === username ? "You: " : ""}${conv.lastMessagePreview || "No messages yet"}`;
      }
    }
  }

  function showTypingIndicator(conversationId) {
    const indicator = document.getElementById("chat-typing-indicator");
    const textEl = document.getElementById("typing-indicator-text");

    const typingIds = Array.from(typingUsersByConversation[conversationId] || []);
    const names = typingIds.map((id) => {
      const p = (participantsCache[conversationId] || []).find((p) => p.userId === id);
      return p ? p.firstName : "Someone";
    });

    textEl.textContent = names.length > 1 ? `${names.join(", ")} are typing...` : `${names[0] || "Someone"} is typing...`;
    indicator.hidden = false;
  }

  function hideTypingIndicator() {
    document.getElementById("chat-typing-indicator").hidden = true;
  }

  // ---------------- Topbar (nav icons) ----------------
  // Rendered by sidebar.js; nothing page-specific needed here.

  // ---------------- Conversation list ----------------

  async function loadConversations() {
    const listEl = document.getElementById("conversation-list");
    const pinnedSection = document.getElementById("pinned-section");
    const pinnedList = document.getElementById("pinned-list");
    const emptyNote = document.getElementById("conversations-empty");

    try {
      const page = await apiGet(`${API_ROUTES.getMyConversations}?pageNumber=1&pageSize=50&usePaging=true`);
      allConversations = page?.items || [];

      if (allConversations.length === 0) {
        listEl.innerHTML = "";
        pinnedSection.hidden = true;
        emptyNote.hidden = false;
        return;
      }

      emptyNote.hidden = true;

      const pinned = allConversations.filter((c) => c.isPinned);
      const rest = allConversations.filter((c) => !c.isPinned);

      if (pinned.length > 0) {
        pinnedSection.hidden = false;
        pinnedList.innerHTML = pinned.map(renderConversationRow).join("");
      } else {
        pinnedSection.hidden = true;
      }

      listEl.innerHTML = rest.map(renderConversationRow).join("");
      wireConversationRows();
      applyKnownPresenceToRows();

      const totalUnread = allConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      if (window.ProConnectShell) {
        window.ProConnectShell.setBadgeCounts({ messages: totalUnread });
      }

      refreshOnlineSnapshot();
    } catch (err) {
      listEl.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function applyKnownPresenceToRows() {
    onlineUserIds.forEach((userId) => {
      document.querySelectorAll(`.conversation-row[data-other-user-id="${userId}"] .conversation-row__presence-dot`).forEach((dot) => {
        dot.classList.add("is-online");
      });
    });
  }

  function renderConversationRow(c) {
    const hasUnread = c.unreadCount > 0;
    const isTyping = (typingUsersByConversation[c.id]?.size || 0) > 0;
    const previewText = isTyping
      ? "typing..."
      : `${c.lastMessageSenderFirstName === username ? "You: " : ""}${escapeHtml(c.lastMessagePreview || "No messages yet")}`;

    return `
      <div class="conversation-row${hasUnread ? " has-unread" : ""}${c.id === activeConversationId ? " is-active" : ""}" data-conversation-id="${c.id}"${c.otherUserId ? ` data-other-user-id="${c.otherUserId}"` : ""}>
        <div class="conversation-row__avatar-wrap">
          ${avatarHtml(c.photoUrl, c.title, "", "conversation-row__avatar")}
          <span class="conversation-row__presence-dot"></span>
        </div>
        <div class="conversation-row__body">
          <div class="conversation-row__top">
            <p class="conversation-row__name">
              ${c.isMuted ? '<i class="ti ti-bell-off conversation-row__mute-icon" aria-hidden="true"></i> ' : ""}
              ${escapeHtml(c.title || "Conversation")}
            </p>
            <span class="conversation-row__time">${timeAgo(c.lastActivityAt)}</span>
          </div>
          <p class="conversation-row__preview${isTyping ? " is-typing-preview" : ""}">${previewText}</p>
        </div>
        ${c.isPinned ? '<i class="ti ti-pin-filled conversation-row__pin-icon" aria-hidden="true"></i>' : ""}
        ${hasUnread ? `<span class="conversation-row__badge">${c.unreadCount}</span>` : ""}
      </div>`;
  }

  function wireConversationRows() {
    document.querySelectorAll(".conversation-row").forEach((row) => {
      row.addEventListener("click", () => openConversation(row.dataset.conversationId));
    });
  }

  document.getElementById("conversation-search-input").addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    const filtered = query
      ? allConversations.filter((c) => (c.title || "").toLowerCase().includes(query))
      : allConversations;

    const pinned = filtered.filter((c) => c.isPinned);
    const rest = filtered.filter((c) => !c.isPinned);

    document.getElementById("pinned-list").innerHTML = pinned.map(renderConversationRow).join("");
    document.getElementById("pinned-section").hidden = pinned.length === 0;
    document.getElementById("conversation-list").innerHTML = rest.map(renderConversationRow).join("");
    wireConversationRows();
    applyKnownPresenceToRows();
  });

  // ---------------- Open a conversation ----------------

  async function openConversation(conversationId) {
    // Leave the previously-open room so we stop receiving its typing/
    // presence chatter, and join the new one.
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      if (activeConversationId && activeConversationId !== conversationId) {
        connection.invoke("LeaveConversation", activeConversationId).catch(() => {});
      }
      connection.invoke("JoinConversation", conversationId).catch(() => {});
    }

    activeConversationId = conversationId;
    hideTypingIndicator();

    document.getElementById("chat-empty-state").hidden = true;
    document.getElementById("chat-thread").hidden = false;
    document.querySelectorAll(".conversation-row").forEach((r) => {
      r.classList.toggle("is-active", r.dataset.conversationId === conversationId);
    });

    // On phone-sized screens, swap to the chat-only view with a back
    // button. No-op above the breakpoint (both panes already visible).
    openMobileChatView();

    const conversation = allConversations.find((c) => c.id === conversationId);
    if (conversation) {
      renderChatHeader(conversation);
    }

    await loadParticipants(conversationId);

    oldestLoadedMessagePage = 1;
    document.getElementById("chat-messages").innerHTML = '<p class="app-loading-inline">Loading messages...</p>';
    await loadMessages(conversationId, 1, true);

    try {
      await apiPost(`${API_ROUTES.markConversationRead}?conversationId=${conversationId}`);
      if (conversation) conversation.unreadCount = 0;
      const row = document.querySelector(`.conversation-row[data-conversation-id="${conversationId}"]`);
      if (row) row.classList.remove("has-unread");
      loadConversations();
    } catch {
      // Non-critical — read state will just stay unset until a future open.
    }
  }

  async function loadParticipants(conversationId) {
    try {
      const participants = await apiGet(`${API_ROUTES.getConversationParticipants}?conversationId=${conversationId}`);
      participantsCache[conversationId] = participants || [];
    } catch {
      participantsCache[conversationId] = [];
    }
  }

  function renderChatHeader(c) {
    const avatarWrap = document.getElementById("chat-header-avatar");
    const showPresenceDot = !c.isGroup && !!c.otherUserId;
    const isOnlineNow = showPresenceDot && onlineUserIds.has(c.otherUserId);

    avatarWrap.innerHTML = showPresenceDot
      ? `<div class="chat-thread__header-avatar-wrap">${avatarHtml(c.photoUrl, c.title, "", "")}<span class="chat-header-presence-dot${isOnlineNow ? " is-online" : ""}" id="chat-header-presence-dot"></span></div>`
      : avatarHtml(c.photoUrl, c.title, "", "");

    document.getElementById("chat-header-name").textContent = c.title || "Conversation";

    const statusEl = document.getElementById("chat-header-status");
    if (showPresenceDot) {
      statusEl.textContent = isOnlineNow ? "Online" : "Offline";
      statusEl.classList.toggle("is-online", isOnlineNow);
    } else {
      // Presence isn't meaningful for a whole group — leave blank.
      statusEl.textContent = "";
      statusEl.classList.remove("is-online");
    }

    document.querySelector('[data-action="pin"]').hidden = !!c.isPinned;
    document.querySelector('[data-action="unpin"]').hidden = !c.isPinned;
    document.querySelector('[data-action="mute"]').hidden = !!c.isMuted;
    document.querySelector('[data-action="unmute"]').hidden = !c.isMuted;
    document.querySelector('[data-action="view-participants"]').hidden = !c.isGroup;
    document.querySelector('[data-action="add-people"]').hidden = !c.isGroup;
  }

  // ---------------- Messages ----------------

  async function loadMessages(conversationId, pageNumber, replaceAll) {
    const container = document.getElementById("chat-messages");
    const conversation = allConversations.find((c) => c.id === conversationId);

    try {
      const page = await apiGet(
        `${API_ROUTES.getConversationMessages}?conversationId=${conversationId}&pageNumber=${pageNumber}&pageSize=${MESSAGES_PAGE_SIZE}&usePaging=true`
      );
      const items = (page?.items || []).slice().reverse(); // API returns newest-first; display oldest-first

      const html = items.map((m) => renderMessageBubble(m, conversation?.isGroup)).join("");
      const hasMore = items.length >= MESSAGES_PAGE_SIZE;

      if (replaceAll) {
        // Rebuilding the button as part of this string every time — relying
        // on a single persistent DOM node across innerHTML wipes is fragile
        // (it gets destroyed the moment anything clears this container,
        // including the "Loading messages..." placeholder set just before
        // this runs, which previously caused appendChild(null) to crash).
        container.innerHTML = `
          <button type="button" class="btn-load-more" id="btn-load-older" ${hasMore ? "" : "hidden"}>Load older messages</button>
          ${html || '<p class="app-loading-inline">No messages yet. Say hello!</p>'}
        `;
        container.scrollTop = container.scrollHeight;
      } else {
        // Insert the newly-fetched older batch right after the button,
        // pushing it further up — not "after itself" repeatedly, which
        // would scramble ordering across multiple "Load older" clicks.
        const loadOlderBtn = document.getElementById("btn-load-older");
        const scrollHeightBefore = container.scrollHeight;
        loadOlderBtn.insertAdjacentHTML("afterend", html);
        loadOlderBtn.hidden = !hasMore;
        container.scrollTop = container.scrollHeight - scrollHeightBefore;
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function renderMessageBubble(m, isGroup) {
    const senderId = m.senderId ?? m.userId;
    const isOwn = senderId === myUserId;
    const senderFirstName = m.senderFirstName ?? m.firstName;
    const senderLastName = m.senderLastName ?? m.lastName;
    const senderProfilePictureUrl = m.senderProfilePictureUrl ?? m.profilePictureUrl;

    const attachmentsHtml = (m.attachmentUrls || [])
      .map((url) => {
        const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
        return isImage
          ? `<img src="${escapeHtml(url)}" alt="" onclick="window.open('${escapeHtml(url)}', '_blank')" />`
          : `<a class="file-chip" href="${escapeHtml(url)}" target="_blank"><i class="ti ti-file" aria-hidden="true"></i> File</a>`;
      })
      .join("");

    const showSenderName = isGroup && !isOwn;

    // Single checkmark = sent. A true double-tick "read" indicator would
    // need comparing this message's dateCreated against the recipient's
    // ConversationParticipant.LastReadAt (tracked on the backend already,
    // just not yet exposed per-message in the API response) — flagging
    // this as the exact spot to wire that in later, rather than faking it.
    const timeHtml = `
      <span class="message-bubble__time">
        ${formatClockTime(m.dateCreated)}
        ${isOwn ? '<i class="ti ti-check" aria-hidden="true"></i>' : ""}
      </span>`;

    return `
      <div class="message-bubble-row${isOwn ? " is-own" : ""}">
        ${!isOwn ? avatarHtml(senderProfilePictureUrl, senderFirstName, senderLastName, "message-bubble-row__avatar") : ""}
        <div>
          ${showSenderName ? `<p class="message-bubble__sender-name">${escapeHtml(senderFirstName)} ${escapeHtml(senderLastName)}</p>` : ""}
          <div class="message-bubble">
            ${m.content ? `<span class="message-bubble__text">${escapeHtml(m.content)}</span>` : ""}
            ${attachmentsHtml ? `<div class="message-bubble__attachments">${attachmentsHtml}</div>` : ""}
            ${timeHtml}
          </div>
        </div>
      </div>`;
  }

  document.getElementById("chat-messages").addEventListener("click", (e) => {
    const btn = e.target.closest("#btn-load-older");
    if (!btn || !activeConversationId) return;

    btn.disabled = true;
    btn.textContent = "Loading...";
    oldestLoadedMessagePage += 1;
    loadMessages(activeConversationId, oldestLoadedMessagePage, false).finally(() => {
      btn.disabled = false;
      btn.textContent = "Load older messages";
    });
  });

  // ---------------- Composer ----------------

  const composerTextarea = document.getElementById("composer-textarea");
  const composerSendBtn = document.getElementById("composer-send-btn");
  const composerFileInput = document.getElementById("composer-file-input");
  const composerFilePreview = document.getElementById("composer-attachment-preview");

  let selectedFiles = [];

  function updateSendButtonState() {
    composerSendBtn.disabled = !(composerTextarea.value.trim().length > 0 || selectedFiles.length > 0);
  }

  composerTextarea.addEventListener("input", () => {
    updateSendButtonState();
    composerTextarea.style.height = "auto";
    composerTextarea.style.height = `${Math.min(composerTextarea.scrollHeight, 120)}px`;
    notifyTyping();
  });

  composerTextarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!composerSendBtn.disabled) sendMessage();
    }
  });

  // Throttled: only actually invoke "Typing" on the hub at most once every
  // 2 seconds while the person keeps typing, and auto-fires "StopTyping"
  // 2.5s after they stop, so we're not spamming an event per keystroke.
  function notifyTyping() {
    if (!activeConversationId || !connection || connection.state !== signalR.HubConnectionState.Connected) return;

    const now = Date.now();
    if (now - lastTypingInvokeAt > 2000) {
      lastTypingInvokeAt = now;
      connection.invoke("Typing", activeConversationId).catch(() => {});
    }

    clearTimeout(stopTypingTimer);
    stopTypingTimer = setTimeout(() => {
      if (activeConversationId && connection && connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke("StopTyping", activeConversationId).catch(() => {});
      }
    }, 2500);
  }

  document.getElementById("composer-attach-btn").addEventListener("click", () => composerFileInput.click());

  composerFileInput.addEventListener("change", () => {
    selectedFiles = selectedFiles.concat(Array.from(composerFileInput.files));
    renderFilePreview();
    updateSendButtonState();
    composerFileInput.value = "";
  });

  function renderFilePreview() {
    composerFilePreview.innerHTML = selectedFiles
      .map(
        (f, i) => `
      <span class="composer-file-chip">
        <i class="ti ${f.type.startsWith("image") ? "ti-photo" : "ti-file"}" aria-hidden="true"></i>
        ${escapeHtml(f.name)}
        <button type="button" data-remove-index="${i}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>`
      )
      .join("");

    composerFilePreview.querySelectorAll("[data-remove-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedFiles.splice(Number(btn.dataset.removeIndex), 1);
        renderFilePreview();
        updateSendButtonState();
      });
    });
  }

  composerSendBtn.addEventListener("click", sendMessage);

  async function sendMessage() {
    if (!activeConversationId) return;

    composerSendBtn.disabled = true;
    clearTimeout(stopTypingTimer);
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      connection.invoke("StopTyping", activeConversationId).catch(() => {});
    }

    try {
      const formData = new FormData();
      formData.append("ConversationId", activeConversationId);
      formData.append("Content", composerTextarea.value.trim());
      selectedFiles.forEach((f) => formData.append("Attachments", f));

      const result = await apiPost(API_ROUTES.sendMessage, formData, true);

      composerTextarea.value = "";
      composerTextarea.style.height = "auto";
      selectedFiles = [];
      renderFilePreview();

      // Persist happens via REST above. Now tell the hub to broadcast the
      // saved message to everyone else in the room — it re-fetches from
      // the DB by ID rather than trusting anything we send it here.
      if (connection && connection.state === signalR.HubConnectionState.Connected && result?.data?.id) {
        connection.invoke("NotifyNewMessage", activeConversationId, result.data.id).catch(() => {});
      }

      await loadMessages(activeConversationId, 1, true);
      loadConversations();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      updateSendButtonState();
    }
  }

  // ---------------- Chat menu: pin / mute / hide / leave / group actions ----------------

  document.getElementById("chat-menu-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("chat-menu").classList.toggle("is-open");
  });
  document.addEventListener("click", () => document.getElementById("chat-menu").classList.remove("is-open"));

  document.querySelectorAll(".chat-menu__item").forEach((btn) => {
    btn.addEventListener("click", () => handleChatMenuAction(btn.dataset.action));
  });

  async function handleChatMenuAction(action) {
    document.getElementById("chat-menu").classList.remove("is-open");
    if (!activeConversationId) return;

    if (action === "view-participants") {
      openGroupInfoModal(false);
      return;
    }
    if (action === "add-people") {
      openGroupInfoModal(true);
      return;
    }

    const routeMap = {
      pin: API_ROUTES.pinConversation,
      unpin: API_ROUTES.unpinConversation,
      mute: API_ROUTES.muteConversation,
      unmute: API_ROUTES.unmuteConversation,
      hide: API_ROUTES.hideConversation,
      leave: API_ROUTES.leaveConversation,
    };

    const route = routeMap[action];
    if (!route) return;

    try {
      const result = await apiPost(`${route}?conversationId=${activeConversationId}`);
      showToast(result.message || "Done", "success");

      if (action === "hide" || action === "leave") {
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
          connection.invoke("LeaveConversation", activeConversationId).catch(() => {});
        }
        document.getElementById("chat-thread").hidden = true;
        document.getElementById("chat-empty-state").hidden = false;
        activeConversationId = null;
        // Back to the conversation list on phone-sized screens too.
        closeMobileChatView();
      }

      loadConversations();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ---------------- Group info modal (view participants + add people) ----------------

  const groupInfoModal = document.getElementById("group-info-modal");
  let groupModalConnectionsCache = null;

  function openGroupInfoModal(focusAddPeople) {
    groupInfoModal.hidden = false;
    renderGroupParticipantsList();
    loadConnectionsForAddPeople();

    if (focusAddPeople) {
      setTimeout(() => document.getElementById("add-people-search-input").focus(), 50);
    }
  }

  document.getElementById("close-group-info-modal").addEventListener("click", () => {
    groupInfoModal.hidden = true;
  });
  groupInfoModal.addEventListener("click", (e) => {
    if (e.target === groupInfoModal) groupInfoModal.hidden = true;
  });

  function renderGroupParticipantsList() {
    const list = document.getElementById("group-participants-list");
    const participants = participantsCache[activeConversationId] || [];

    if (participants.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">No participants found.</p>';
      return;
    }

    list.innerHTML = participants
      .map(
        (p) => `
      <div class="connection-picker-row" style="cursor:default;">
        ${avatarHtml(p.profilePictureUrl, p.firstName, p.lastName, "connection-picker-row__avatar")}
        <span class="connection-picker-row__name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}${p.userId === myUserId ? " (you)" : ""}</span>
      </div>`
      )
      .join("");
  }

  async function loadConnectionsForAddPeople() {
    const list = document.getElementById("add-people-list");

    try {
      const page = await apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=200&usePaging=true`);
      groupModalConnectionsCache = page?.items || [];
      renderAddPeopleList(groupModalConnectionsCache);
    } catch (err) {
      list.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderAddPeopleList(connections) {
    const list = document.getElementById("add-people-list");
    const existingIds = new Set((participantsCache[activeConversationId] || []).map((p) => p.userId));
    const eligible = connections.filter((c) => !existingIds.has(c.userId));

    if (eligible.length === 0) {
      list.innerHTML = '<p class="app-loading-inline">Everyone in your connections is already in this group.</p>';
      return;
    }

    list.innerHTML = eligible
      .map(
        (c) => `
      <div class="connection-picker-row" data-user-id="${c.userId}">
        ${avatarHtml(c.profilePictureUrl, c.firstName, c.lastName, "connection-picker-row__avatar")}
        <span class="connection-picker-row__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</span>
      </div>`
      )
      .join("");

    list.querySelectorAll(".connection-picker-row").forEach((row) => {
      row.addEventListener("click", () => handleAddParticipant(row.dataset.userId));
    });
  }

  async function handleAddParticipant(userId) {
    try {
      const result = await apiPost(`${API_ROUTES.addParticipant}?conversationId=${activeConversationId}&newParticipantId=${userId}`);
      showToast(result.message || "Added to the group", "success");

      await loadParticipants(activeConversationId);
      renderGroupParticipantsList();
      renderAddPeopleList(groupModalConnectionsCache || []);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  document.getElementById("add-people-search-input").addEventListener("input", (e) => {
    if (!groupModalConnectionsCache) return;
    const query = e.target.value.trim().toLowerCase();
    const filtered = query
      ? groupModalConnectionsCache.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(query))
      : groupModalConnectionsCache;
    renderAddPeopleList(filtered);
  });

  // ---------------- Call buttons (not built yet) ----------------

  document.querySelectorAll('[data-action="call-video"], [data-action="call-voice"]').forEach((btn) => {
    btn.addEventListener("click", () => showToast("Calling isn't available yet — coming in a future update.", "info"));
  });

  // ---------------- New conversation / group modal ----------------

  const modal = document.getElementById("new-conversation-modal");
  let myConnectionsCache = null;

  function openModal() {
    modal.hidden = false;
    if (!myConnectionsCache) loadConnectionsForModal();
  }

  function closeModal() {
    modal.hidden = true;
  }

  document.getElementById("btn-new-conversation").addEventListener("click", openModal);
  document.getElementById("btn-new-conversation-empty").addEventListener("click", openModal);
  document.getElementById("close-new-conversation-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.querySelectorAll(".modal-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const target = tab.dataset.modalTab;
      document.getElementById("modal-panel-direct").hidden = target !== "direct";
      document.getElementById("modal-panel-group").hidden = target !== "group";
    });
  });

  async function loadConnectionsForModal() {
    const directList = document.getElementById("direct-connection-list");
    const groupList = document.getElementById("group-connection-list");

    try {
      const page = await apiGet(`${API_ROUTES.getMyConnections}?pageNumber=1&pageSize=200&usePaging=true`);
      myConnectionsCache = page?.items || [];

      if (myConnectionsCache.length === 0) {
        const msg = '<p class="app-loading-inline">You need connections before you can message someone. Visit Discover People first.</p>';
        directList.innerHTML = msg;
        groupList.innerHTML = msg;
        return;
      }

      renderDirectList(myConnectionsCache);
      renderGroupList(myConnectionsCache);
    } catch (err) {
      directList.innerHTML = "";
      groupList.innerHTML = "";
      showToast(err.message, "error");
    }
  }

  function renderDirectList(connections) {
    const list = document.getElementById("direct-connection-list");
    list.innerHTML = connections
      .map(
        (c) => `
      <div class="connection-picker-row" data-user-id="${c.userId}">
        ${avatarHtml(c.profilePictureUrl, c.firstName, c.lastName, "connection-picker-row__avatar")}
        <span class="connection-picker-row__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</span>
      </div>`
      )
      .join("");

    list.querySelectorAll(".connection-picker-row").forEach((row) => {
      row.addEventListener("click", () => handleStartDirectConversation(row.dataset.userId));
    });
  }

  async function handleStartDirectConversation(recipientId) {
    try {
      const result = await apiPost(`${API_ROUTES.startConversation}?recipientId=${recipientId}`);
      closeModal();
      await loadConversations();
      if (result?.data?.id) openConversation(result.data.id);
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  const selectedGroupUserIds = new Set();

  function renderGroupList(connections) {
    const list = document.getElementById("group-connection-list");
    list.innerHTML = connections
      .map(
        (c) => `
      <div class="connection-picker-row" data-user-id="${c.userId}">
        <div style="display:flex; align-items:center; gap:10px;">
          ${avatarHtml(c.profilePictureUrl, c.firstName, c.lastName, "connection-picker-row__avatar")}
          <span class="connection-picker-row__name">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</span>
        </div>
        <span class="connection-picker-row__check"><i class="ti ti-check" aria-hidden="true"></i></span>
      </div>`
      )
      .join("");

    list.querySelectorAll(".connection-picker-row").forEach((row) => {
      row.addEventListener("click", () => {
        const userId = row.dataset.userId;
        if (selectedGroupUserIds.has(userId)) {
          selectedGroupUserIds.delete(userId);
          row.classList.remove("is-selected");
        } else {
          selectedGroupUserIds.add(userId);
          row.classList.add("is-selected");
        }
      });
    });
  }

  document.getElementById("btn-create-group").addEventListener("click", async () => {
    const title = document.getElementById("group-name-input").value.trim();

    if (!title) {
      showToast("Enter a group name", "error");
      return;
    }
    if (selectedGroupUserIds.size === 0) {
      showToast("Select at least one person to add", "error");
      return;
    }

    const btn = document.getElementById("btn-create-group");
    btn.disabled = true;
    btn.textContent = "Creating...";

    try {
      const result = await apiPost(
        API_ROUTES.createGroupConversation,
        JSON.stringify({ title, participantIds: Array.from(selectedGroupUserIds) })
      );
      showToast(result.message || "Group created", "success");
      closeModal();
      document.getElementById("group-name-input").value = "";
      selectedGroupUserIds.clear();
      await loadConversations();
      if (result?.data?.id) openConversation(result.data.id);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create group";
    }
  });

  document.getElementById("direct-search-input").addEventListener("input", (e) => {
    if (!myConnectionsCache) return;
    const query = e.target.value.trim().toLowerCase();
    const filtered = query
      ? myConnectionsCache.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(query))
      : myConnectionsCache;
    renderDirectList(filtered);
  });

  document.getElementById("group-search-input").addEventListener("input", (e) => {
    if (!myConnectionsCache) return;
    const query = e.target.value.trim().toLowerCase();
    const filtered = query
      ? myConnectionsCache.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(query))
      : myConnectionsCache;
    renderGroupList(filtered);
    filtered.forEach((c) => {
      if (selectedGroupUserIds.has(c.userId)) {
        const row = document.querySelector(`#group-connection-list [data-user-id="${c.userId}"]`);
        if (row) row.classList.add("is-selected");
      }
    });
  });

  // ---------------- Init ----------------

  loadConversations().then(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedConversationId = params.get("conversationId");
    if (linkedConversationId) {
      openConversation(linkedConversationId);
    }
  });
  initSignalR();
});