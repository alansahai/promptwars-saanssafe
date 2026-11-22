/**
 * SaansSafe — Grounded Gemini Chat Controller (ES Module)
 * Conversational air quality assistant grounded strictly in local meteorology and user profile.
 * Sanitizes markdown safely with whitelist DOM constructs.
 */

import { $, el } from "./dom.js";

/**
 * Format markdown into safe sanitized HTML for assistant responses.
 * @param {string} text Raw text with markdown formatting
 * @returns {string} Sanitized HTML
 */
export function formatMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^• (.*?)$/gm, "<li>$1</li>")
    .replace(/^- (.*?)$/gm, "<li>$1</li>");

  html = html.replace(/(<li>.*?<\/li>)/gs, "<ul class='chat-list'>$1</ul>");
  html = html.replace(/\n\n/g, "<p></p>").replace(/\n/g, "<br>");
  return html;
}

/**
 * Initialize welcome message in chat container.
 */
export function initChat() {
  const container = $("#chat-messages");
  if (!container || container.children.length > 0) return;
  appendAssistantMessage(
    `**Namaste! I am your SaansSafe Intelligence Assistant.** 🌿\n\nI am grounded in live local air quality readings and your household profile. How can I help protect your family today?\n\n• **Kids & Elders:** Is it safe to go out right now?\n• **Mask Guidance:** N95 vs cloth vs surgical masks\n• **Ventilation:** Best hours to air out your home\n• **Air Purifiers:** Placement, DIY filters, and maintenance`
  );
}

/**
 * Append user message bubble to chat container.
 * @param {string} text User query text
 */
export function appendUserMessage(text) {
  const container = $("#chat-messages");
  if (!container) return;
  const bubble = el("div", null, { class: "chat-bubble user" });

  const header = el("div", null, { class: "bubble-header" });
  header.appendChild(el("span", "👤", { class: "bubble-avatar" }));
  header.appendChild(el("span", "You", { class: "bubble-sender" }));
  bubble.appendChild(header);

  const content = el("div", text, { class: "bubble-content" });
  bubble.appendChild(content);

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

/**
 * Append assistant message bubble with formatted text.
 * @param {string} text Assistant markdown response
 */
export function appendAssistantMessage(text) {
  const container = $("#chat-messages");
  if (!container) return;
  const bubble = el("div", null, { class: "chat-bubble assistant" });

  const header = el("div", null, { class: "bubble-header" });
  header.appendChild(el("span", "🌱", { class: "bubble-avatar" }));
  header.appendChild(el("span", "SaansSafe Assistant", { class: "bubble-sender" }));
  header.appendChild(el("span", "Grounded AI", { class: "bubble-badge" }));
  bubble.appendChild(header);

  const content = el("div", null, { class: "bubble-content" });
  content.innerHTML = formatMarkdown(text);
  bubble.appendChild(content);

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

/**
 * Send chat message to Gemini endpoint with grounded context.
 * @param {() => {location: any, profile: any, assessment: any, chatHistory: any[], lang: string}} getState
 * @param {string} [apiEndpoint="/api/chat"]
 */
export async function sendChat(getState, apiEndpoint = "/api/chat") {
  const input = $("#chat-input");
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  const state = getState();
  appendUserMessage(msg);
  input.value = "";
  state.chatHistory.push({ role: "user", content: msg });

  const typingBubble = el("div", null, { class: "chat-bubble assistant typing-bubble" });
  typingBubble.innerHTML = `
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;
  const container = $("#chat-messages");
  if (container) {
    container.appendChild(typingBubble);
    container.scrollTop = container.scrollHeight;
  }

  try {
    const res = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: state.location,
        profile: { ...state.profile, language: state.lang },
        history: state.chatHistory.slice(-6),
        message: msg,
        assessment_context: state.assessment || {},
      }),
    });
    typingBubble.remove();

    if (!res.ok) {
      appendAssistantMessage("⚠️ I could not process that request right now. Please try again.");
      return;
    }
    const data = await res.json();
    appendAssistantMessage(data.reply);
    state.chatHistory.push({ role: "assistant", content: data.reply });
  } catch (e) {
    typingBubble.remove();
    appendAssistantMessage("⚠️ Network communication error. Please check your connection.");
  }
}
