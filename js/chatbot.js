/* ============================================================
   chatbot.js   —   ClassCare Assistant  (floating AI chat widget)
   ------------------------------------------------------------
   A self-contained chat widget that can be dropped onto the
   Student and Teacher portals.  It:

     • Shows a floating launcher button (bottom-left)
     • Opens a holographic chat panel
     • Answers ClassCare questions using the on-device knowledge
       base (js/ai-knowledge.js)
     • Optionally calls the Google Gemini API (free tier) for
       free-form questions if a key is configured in js/config.js
     • Falls back gracefully to the knowledge base / a friendly
       message if Gemini is unavailable
     • Provides quick-suggestion chips for one-tap questions

   Drop it in with a single <script> tag on any portal page.
   ============================================================ */

(function () {
  "use strict";

  const CFG = (window.CLASSCARE_CONFIG && window.CLASSCARE_CONFIG.ai) || {};
  const ASSISTANT_NAME = CFG.assistantName || "ClassCare Assistant";
  const PERSONA = CFG.persona || "You are the friendly ClassCare Assistant.";
  const MODEL = CFG.geminiModel || "gemini-2.0-flash";
  const API_KEY = (CFG.geminiApiKey || "").trim();

  // Don't double-instantiate.
  if (window.__ClassCareChatbot) return;
  window.__ClassCareChatbot = true;

  /* ---------- tiny escape helper (for user text only) ---------- */
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  }

  /* ---------- optional markdown-lite: **bold**, `code`, line breaks ---------- */
  function fmt(text) {
    let s = String(text || "");
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\n/g, "<br/>");
    return s;
  }

  /* ============================================================
     BUILD THE WIDGET DOM (idempotent, injected once)
     ============================================================ */
  function buildDom() {
    const wrap = document.createElement("div");
    wrap.id = "classcare-chatbot";
    wrap.innerHTML = `
      <button id="cc-launcher" class="cc-launcher" aria-label="Open ClassCare Assistant">
        <span class="cc-launcher-holo"></span>
        <svg xmlns="http://www.w3.org/2000/svg" class="cc-icon cc-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.4-4 8-9 8a9.9 9.9 0 0 1-4.3-.9L3 21l1.9-4A8.4 8.4 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" class="cc-icon cc-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 18L18 6M6 6l12 12"/>
        </svg>
        <span class="cc-dot"></span>
      </button>

      <div id="cc-panel" class="cc-panel" role="dialog" aria-label="ClassCare Assistant chat">
        <div class="cc-header">
          <div class="cc-avatar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
              <path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>
            </svg>
            <span class="cc-avatar-ring"></span>
          </div>
          <div class="cc-header-text">
            <div class="cc-name">${esc(ASSISTANT_NAME)}</div>
            <div class="cc-status"><span class="cc-status-dot"></span><span id="cc-status-text">Online · AI</span></div>
          </div>
          <button id="cc-close" class="cc-close" aria-label="Close chat">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div id="cc-messages" class="cc-messages">
          <div class="cc-msg cc-bot">
            <div class="cc-bubble">
              Hi! I'm <strong>${esc(ASSISTANT_NAME)}</strong> — Your ClassCare helper.
              I can answer questions about attendance, IDs, schedules, the help desk, and more.
            </div>
          </div>
        </div>

        <div id="cc-chips" class="cc-chips"></div>

        <form id="cc-form" class="cc-input-row" autocomplete="off">
          <input id="cc-input" class="cc-input" type="text" placeholder="Ask me anything…" maxlength="500" aria-label="Chat message" />
          <button id="cc-send" class="cc-send" type="submit" aria-label="Send">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ---------- default quick chips ---------- */
  const DEFAULT_CHIPS = [
    "How do I check attendance?",
    "What does Late mean?",
    "How do I get my QR ID?",
    "How does the help desk work?",
    "How do parents get alerts?"
  ];

  let root, launcher, panel, messages, chips, form, input, sendBtn;
  let open = false;
  let busiest = false;   // simple typing lock
  let ctx = { role: "student" };

  /* ============================================================
     SETUP
     ============================================================ */
  function init(opts = {}) {
    ctx = { ...ctx, ...opts };
    root = buildDom();
    launcher = root.querySelector("#cc-launcher");
    panel = root.querySelector("#cc-panel");
    messages = root.querySelector("#cc-messages");
    chips = root.querySelector("#cc-chips");
    form = root.querySelector("#cc-form");
    input = root.querySelector("#cc-input");
    sendBtn = root.querySelector("#cc-send");

    launcher.addEventListener("click", () => (open ? closePanel() : openPanel()));
    root.querySelector("#cc-close").addEventListener("click", closePanel);
    form.addEventListener("submit", (e) => { e.preventDefault(); onSend(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } });

    renderChips(DEFAULT_CHIPS);
  }

  function renderChips(list) {
    chips.innerHTML = (list || []).map(c => `<button type="button" class="cc-chip">${esc(c)}</button>`).join("");
    chips.querySelectorAll(".cc-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        input.value = btn.textContent;
        onSend();
        // focus back on input
        setTimeout(() => input.focus(), 10);
      });
    });
  }

  function openPanel() {
    open = true;
    panel.classList.add("open");
    launcher.classList.add("active");
    document.body.classList.add("cc-open");
    // Scroll to bottom
    setTimeout(() => { messages.scrollTop = messages.scrollHeight; input.focus(); }, 60);
  }
  function closePanel() {
    open = false;
    panel.classList.remove("open");
    launcher.classList.remove("active");
    document.body.classList.remove("cc-open");
  }

  /* ---------- message append helpers ---------- */
  function addUser(text) {
    const el = document.createElement("div");
    el.className = "cc-msg cc-user";
    el.innerHTML = `<div class="cc-bubble">${fmt(text)}</div>`;
    messages.appendChild(el);
    scrollBottom();
  }
  function addBot(text) {
    const el = document.createElement("div");
    el.className = "cc-msg cc-bot";
    el.innerHTML = `<div class="cc-bubble">${fmt(text)}</div>`;
    messages.appendChild(el);
    scrollBottom();
  }
  function addTyping() {
    const el = document.createElement("div");
    el.className = "cc-msg cc-bot cc-typing";
    el.id = "cc-typing";
    el.innerHTML = `<div class="cc-bubble"><span class="cc-dot-typing"></span><span class="cc-dot-typing"></span><span class="cc-dot-typing"></span></div>`;
    messages.appendChild(el);
    scrollBottom();
    return el;
  }
  function removeTyping() {
    const t = document.getElementById("cc-typing");
    if (t) t.remove();
  }
  function scrollBottom() {
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  /* ============================================================
     AI BRAIN — local knowledge first, Gemini for free-form
     ============================================================ */
  async function getAnswer(question) {
    // 1) Strong local intent match → answer locally (fast, reliable, school-specific).
    if (window.ClassCareKnowledge) {
      const local = window.ClassCareKnowledge.answerFor(question, ctx);
      if (local && local.intent !== "unknown") {
        return { text: local.answer, chips: local.chips || DEFAULT_CHIPS, source: "local" };
      }
    }

    // 2) No key → fall back to knowledge base's "unknown" guidance (or generic).
    if (!API_KEY || API_KEY.startsWith("YOUR_")) {
      const fallback = window.ClassCareKnowledge
        ? window.ClassCareKnowledge.answerFor(question, ctx)
        : null;
      return {
        text: fallback ? fallback.answer : "🤔 I'm still learning! Try asking about attendance, IDs, schedules, or the help desk.",
        chips: DEFAULT_CHIPS,
        source: "fallback"
      };
    }

    // 3) Gemini free-form.
    try {
      const text = await callGemini(question);
      return { text, chips: DEFAULT_CHIPS, source: "gemini" };
    } catch (err) {
      console.warn("[chatbot] Gemini failed, using knowledge base:", err);
      const fallback = window.ClassCareKnowledge
        ? window.ClassCareKnowledge.answerFor(question, ctx)
        : null;
    return {
        text: fallback ? fallback.answer : "Sorry, I couldn't reach the assistant right now. Try asking about attendance, IDs, schedules, or the help desk.",
        chips: DEFAULT_CHIPS,
        source: "fallback"
      };
    }
  }

  async function callGemini(question) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: `${PERSONA}\n\nQuestion: ${question}` }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500,
        topP: 0.9
      }
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      let detail = "";
      try {
        const j = await resp.json();
        detail = j?.error?.message || resp.statusText;
      } catch (_) { detail = resp.statusText; }
      throw new Error(`Gemini ${resp.status}: ${detail}`);
    }
    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Gemini returned empty response");
    return text.trim();
  }

  /* ============================================================
     SEND FLOW
     ============================================================ */
  async function onSend() {
    const question = input.value.trim();
    if (!question || busiest) return;
    input.value = "";
    addUser(question);
    busiest = true;
    sendBtn.disabled = true;
    sendBtn.classList.add("busy");
    setStatus("Thinking…");

    const typing = addTyping();
    const a = await getAnswer(question);

    removeTyping();
    // Small delay so typing dots are visible even for instant local answers
    await new Promise(r => setTimeout(r, 250));
    addBot(a.text);
    renderChips(a.chips || DEFAULT_CHIPS);

    busiest = false;
    sendBtn.disabled = false;
    sendBtn.classList.remove("busy");
    setStatus("Ready");
    scrollBottom();
  }

  function setStatus(text) {
    const el = document.getElementById("cc-status-text");
    if (el) el.textContent = text;
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.ClassCareChatbot = {
    init,
    open: openPanel,
    close: closePanel,
    ask: async (q) => {
      if (open) { input.value = q; onSend(); }
      else { openPanel(); setTimeout(() => { input.value = q; onSend(); }, 120); }
    }
  };

  /* Auto-init on DOMContentLoaded with default role "student" —
     pages pass their role via data attributes on <body> or a global. */
  document.addEventListener("DOMContentLoaded", () => {
    const role = document.body.dataset.role || document.body.closest?.("[data-role]")?.dataset?.role || "student";
    init({ role });
  });
})();
