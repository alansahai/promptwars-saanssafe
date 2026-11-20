/**
 * SaansSafe — app.js
 * Main application logic (ES modules; CSP-compliant; no inline scripts).
 * Uses textContent / DOM builders — NEVER innerHTML for user/AI text (XSS-safe).
 */

import { applyTranslations, getLang, setLang, t } from "./i18n.js";

// ===== CONSTANTS =====
const API = {
  health: "/api/health",
  geocode: "/api/geocode",
  assess: "/api/assess",
  simulate: "/api/simulate",
  chat: "/api/chat",
};

const DELHI_DEMO = {
  location: { lat: 28.61, lon: 77.21, city_name: "New Delhi" },
  profile: {
    infants_children: 1,
    adults: 2,
    elderly: 1,
    pregnant: false,
    has_asthma_copd: false,
    has_heart_condition: false,
    has_purifier: false,
    windows_type: "single",
    cooking_fuel: "lpg",
    uses_ac_or_cooler: false,
    commute_mode: "two_wheeler",
    commute_distance_km: 12,
    commute_days_per_week: 5,
    school_run: true,
    morning_walker_jogger: false,
    budget: "medium",
    language: getLang(),
  },
};

const SIM_ACTIONS = [
  { id: "add_air_purifier", label: "Add air purifier", desc: "Run HEPA purifier indoors" },
  { id: "switch_to_induction", label: "Switch to induction cooking", desc: "Replace LPG/biomass" },
  { id: "switch_commute_to_metro", label: "Switch commute to metro", desc: "From car/two-wheeler" },
  { id: "switch_commute_to_bus", label: "Switch commute to bus", desc: "From car/two-wheeler" },
  { id: "switch_commute_to_cycle", label: "Cycle for short trips", desc: "Under 3 km" },
  { id: "work_from_home_2_days", label: "Work from home 2 days/week", desc: "Skip commute twice" },
];

// ===== STATE =====
let state = {
  location: null,       // {lat, lon, city_name}
  profile: null,        // HouseholdProfile
  assessment: null,     // AssessmentResponse
  chatHistory: [],      // [{role, content}]
  geminiAvailable: false,
};

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== DEBOUNCE =====
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ===== SAFE DOM BUILDER =====
/**
 * Create an element with text content (XSS-safe; never uses innerHTML).
 * @param {string} tag
 * @param {string} [text]
 * @param {Object} [attrs]
 * @returns {HTMLElement}
 */
function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("aria-") || k === "role" || k === "tabindex") e.setAttribute(k, v);
    else e[k] = v;
  }
  return e;
}

// ===== SHOW/HIDE HELPERS =====
function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

// ===== AQI GAUGE (canvas) =====
function drawGauge(aqi) {
  const canvas = $("#aqi-gauge");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h - 10;
  const r = Math.min(cx, cy) - 10;

  // AQI colour bands (angle: π to 2π)
  const bands = [
    { max: 50, color: "#00e400" },
    { max: 100, color: "#ffff00" },
    { max: 150, color: "#ff7e00" },
    { max: 200, color: "#ff0000" },
    { max: 300, color: "#8f3f97" },
    { max: 500, color: "#7e0023" },
  ];
  let prevAngle = Math.PI;
  for (const band of bands) {
    const frac = Math.min(band.max, 500) / 500;
    const endAngle = Math.PI + frac * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, prevAngle, endAngle);
    ctx.lineWidth = 18;
    ctx.strokeStyle = band.color;
    ctx.stroke();
    prevAngle = endAngle;
  }

  // Needle
  const fraction = Math.min(aqi, 500) / 500;
  const needleAngle = Math.PI + fraction * Math.PI;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + (r - 20) * Math.cos(needleAngle),
    cy + (r - 20) * Math.sin(needleAngle)
  );
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1a202c";
  ctx.lineCap = "round";
  ctx.stroke();

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.fillStyle = "#1a202c";
  ctx.fill();
}

// ===== BEFORE/AFTER BAR CHART (canvas) =====
function drawSimChart(before, after) {
  const canvas = $("#sim-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const maxVal = Math.max(before, after, 1);
  const barW = 100, gap = 60, startX = 80;
  const maxH = h - 50;

  const drawBar = (x, val, color, label) => {
    const bh = (val / maxVal) * maxH;
    const y = h - 30 - bh;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, bh);
    ctx.fillStyle = "#1a202c";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(val.toFixed(1), x + barW / 2, y - 8);
    ctx.font = "12px system-ui";
    ctx.fillText(label, x + barW / 2, h - 10);
  };

  drawBar(startX, before, "#ef4444", "Before");
  drawBar(startX + barW + gap, after, "#16a34a", "After");

  // Y-axis label
  ctx.save();
  ctx.translate(20, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "11px system-ui";
  ctx.fillStyle = "#64748b";
  ctx.fillText("PM2.5 µg/day", 0, 0);
  ctx.restore();
}

// ===== HEAT STRIP =====
function renderHeatStrip(hourly) {
  const strip = $("#heat-strip");
  if (!strip) return;
  strip.textContent = "";
  const tagColor = { safe: "#00e400", caution: "#ff7e00", avoid: "#ff0000" };
  hourly.forEach((h) => {
    const cell = el("div", null, { class: "heat-cell" });
    cell.style.background = tagColor[h.tag] || "#ccc";
    cell.setAttribute("data-hour", h.hour);
    cell.setAttribute("title", `${h.hour}:00 — AQI ${h.aqi.toFixed(0)} (${h.tag})`);
    cell.setAttribute("aria-label", `${h.hour}:00 AQI ${h.aqi.toFixed(0)}, ${h.tag}`);
    strip.appendChild(cell);
  });
}

// ===== TIMELINE =====
function renderTimeline(tasks) {
  const list = $("#timeline-list");
  if (!list) return;
  list.textContent = "";
  tasks.forEach((task) => {
    const li = el("li", null, { class: "timeline-item" });
    li.appendChild(el("span", task.time, { class: "timeline-time" }));
    li.appendChild(el("span", task.icon, { class: "timeline-icon", "aria-hidden": "true" }));
    const content = el("div", null, { class: "timeline-content" });
    content.appendChild(el("p", task.task, { class: "timeline-task" }));
    content.appendChild(el("p", task.reason, { class: "timeline-reason" }));
    li.appendChild(content);
    list.appendChild(li);
  });
}

// ===== INDOOR HACKS =====
function renderHacks(hacks) {
  const grid = $("#hacks-grid");
  if (!grid) return;
  grid.textContent = "";
  hacks.forEach((h) => {
    const card = el("div", null, { class: "measure-card", role: "listitem" });
    card.appendChild(el("h3", h.title, { class: "card-title" }));
    card.appendChild(el("p", h.description, { class: "card-desc" }));

    if (h.effect_pct > 0) {
      const barWrap = el("div", null, { class: "effect-bar-wrap" });
      barWrap.appendChild(el("div", `Estimated PM2.5 reduction: ~${h.effect_pct}%`, { class: "effect-bar-label" }));
      const bar = el("div", null, { class: "effect-bar" });
      const fill = el("div", null, { class: "effect-fill" });
      fill.style.width = `${Math.min(100, h.effect_pct)}%`;
      bar.appendChild(fill);
      barWrap.appendChild(bar);
      card.appendChild(barWrap);
    }

    const tags = el("div", null, { class: "card-tags" });
    tags.appendChild(el("span", h.cost_tier, { class: `tag tag-${h.cost_tier}` }));
    tags.appendChild(el("span", h.effort, { class: "tag" }));
    card.appendChild(tags);

    if (h.myth_bust) {
      card.appendChild(el("p", h.myth_bust, { class: "myth-bust" }));
    }

    grid.appendChild(card);
  });
}

// ===== ALTERNATIVES =====
function renderAlternatives(alts) {
  const grid = $("#alternatives-grid");
  if (!grid) return;
  grid.textContent = "";
  alts.forEach((a) => {
    const card = el("div", null, { class: "alt-card", role: "listitem" });
    card.appendChild(el("h3", a.title, { class: "card-title" }));
    card.appendChild(el("p", a.description, { class: "card-desc" }));
    if (a.community_note) {
      const note = el("p", `🌍 ${a.community_note}`, { class: "card-desc" });
      note.style.fontSize = "0.8rem";
      card.appendChild(note);
    }
    const tags = el("div", null, { class: "card-tags" });
    if (a.exposure_change_pct < 0) {
      tags.appendChild(el("span", `Exposure ${a.exposure_change_pct}%`, { class: "tag tag-free" }));
    }
    if (a.emission_change_gco2e_per_km < 0) {
      tags.appendChild(el("span", `${a.emission_change_gco2e_per_km.toFixed(0)} gCO₂e/km`, { class: "tag tag-free" }));
    }
    tags.appendChild(el("span", a.effort, { class: "tag" }));
    card.appendChild(tags);
    grid.appendChild(card);
  });
}

// ===== RISK BADGE =====
function renderRiskBadge(result) {
  const badge = $("#risk-badge");
  if (!badge) return;
  badge.style.background = result.risk_color + "22";
  badge.style.border = `2px solid ${result.risk_color}`;
  badge.style.color = result.risk_color;
  $("#risk-icon").textContent = result.risk_icon;
  $("#risk-level-text").textContent = result.risk_level;
  $("#risk-score-text").textContent = `(${result.risk_score}/100)`;
}

// ===== RISK REASONS =====
function renderReasons(reasons) {
  const list = $("#risk-reasons-list");
  if (!list) return;
  list.textContent = "";
  reasons.forEach((r) => {
    const li = el("li", null, {});
    li.appendChild(el("span", r.description, {}));
    list.appendChild(li);
  });
}

// ===== TIPS =====
function renderTips(familyTips, kidsTips) {
  const fl = $("#family-tips-list");
  if (fl) {
    fl.textContent = "";
    familyTips.forEach((tip) => fl.appendChild(el("li", tip)));
  }
  const kl = $("#kids-tips-list");
  if (kl) {
    kl.textContent = "";
    kidsTips.forEach((tip) => kl.appendChild(el("li", tip)));
  }
}

// ===== SIMULATOR =====
function renderSimActions() {
  const container = $("#sim-actions");
  if (!container) return;
  container.textContent = "";
  SIM_ACTIONS.forEach((action) => {
    const item = el("label", null, { class: "sim-action-item" });
    const cb = el("input", null, { type: "checkbox" });
    cb.name = action.id;
    cb.addEventListener("change", debounce(runSimulation, 400));
    item.appendChild(cb);
    const textWrap = el("div");
    textWrap.appendChild(el("div", action.label, { class: "sim-action-label" }));
    textWrap.appendChild(el("div", action.desc, { class: "sim-action-desc" }));
    item.appendChild(textWrap);
    container.appendChild(item);
  });
}

async function runSimulation() {
  if (!state.location || !state.profile) return;

  const checked = $$('#sim-actions input[type=checkbox]:checked');
  const actions = Array.from(checked).map((cb) => ({
    action_id: cb.name,
    enabled: true,
  }));

  try {
    const res = await fetch(API.simulate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: state.location,
        profile: { ...state.profile, language: getLang() },
        actions,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();

    show($("#sim-results"));
    $("#sim-before-dose").textContent = data.before_pm25_dose_ug.toFixed(1);
    $("#sim-after-dose").textContent = data.after_pm25_dose_ug.toFixed(1);
    $("#sim-co2-saved").textContent = data.co2e_saved_per_year_kg.toFixed(1);
    $("#sim-equiv-km").textContent = data.equivalent_km_not_driven.toFixed(0);

    drawSimChart(data.before_pm25_dose_ug, data.after_pm25_dose_ug);

    const formulaEl = $("#sim-formula");
    if (formulaEl) formulaEl.textContent = data.formula;

    const assumptionsList = $("#sim-assumptions");
    if (assumptionsList) {
      assumptionsList.textContent = "";
      data.assumptions.forEach((a) => assumptionsList.appendChild(el("li", a)));
    }
  } catch (e) {
    console.error("Simulation error:", e);
  }
}

// ===== CHAT =====
function appendChatBubble(role, text) {
  const container = $("#chat-messages");
  if (!container) return;
  const bubble = el("div", text, { class: `chat-bubble ${role}` });
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function sendChat() {
  const input = $("#chat-input");
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  appendChatBubble("user", msg);
  input.value = "";
  state.chatHistory.push({ role: "user", content: msg });

  const typingBubble = el("div", "…", { class: "chat-bubble assistant" });
  $("#chat-messages")?.appendChild(typingBubble);

  try {
    const res = await fetch(API.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: state.location,
        profile: { ...state.profile, language: getLang() },
        history: state.chatHistory.slice(-6),
        message: msg,
        assessment_context: state.assessment || {},
      }),
    });
    typingBubble.remove();

    if (!res.ok) {
      appendChatBubble("assistant error", "⚠️ Could not get a response. Please try again.");
      return;
    }
    const data = await res.json();
    appendChatBubble("assistant", data.reply);
    state.chatHistory.push({ role: "assistant", content: data.reply });
  } catch (e) {
    typingBubble.remove();
    appendChatBubble("assistant error", "⚠️ Network error. Please check your connection.");
  }
}

// ===== GEOCODE =====
const debouncedGeocode = debounce(async (query) => {
  if (query.length < 2) return;
  try {
    const res = await fetch(`${API.geocode}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderSuggestions(data.results || []);
  } catch (e) { /* silent */ }
}, 350);

function renderSuggestions(results) {
  const list = $("#city-suggestions");
  if (!list) return;
  list.textContent = "";
  if (results.length === 0) { hide(list); return; }
  results.forEach((r) => {
    const li = el("li", `${r.name}, ${r.country}`, { role: "option", tabindex: "0" });
    li.addEventListener("click", () => selectLocation(r));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") selectLocation(r); });
    list.appendChild(li);
  });
  show(list);
}

function selectLocation(r) {
  state.location = { lat: r.lat, lon: r.lon, city_name: r.name };
  const input = $("#city-search");
  if (input) input.value = `${r.name}, ${r.country}`;
  hide($("#city-suggestions"));
  showLocationBanner(r.name);
}

function showLocationBanner(name) {
  const disp = $("#location-display");
  const txt = $("#location-text");
  if (disp && txt) { txt.textContent = name; show(disp); }
}

// ===== ASSESSMENT =====
async function runAssessment() {
  if (!state.location) {
    alert("Please select a location first.");
    return;
  }

  const form = $("#profile-form");
  if (!form) return;

  const fd = new FormData(form);
  const profile = {
    infants_children: parseInt(fd.get("infants_children")) || 0,
    adults: parseInt(fd.get("adults")) || 1,
    elderly: parseInt(fd.get("elderly")) || 0,
    pregnant: fd.get("pregnant") === "on",
    has_asthma_copd: fd.get("has_asthma_copd") === "on",
    has_heart_condition: fd.get("has_heart_condition") === "on",
    has_purifier: fd.get("has_purifier") === "on",
    windows_type: fd.get("windows_type") || "unknown",
    cooking_fuel: fd.get("cooking_fuel") || "lpg",
    uses_ac_or_cooler: fd.get("uses_ac_or_cooler") === "on",
    commute_mode: fd.get("commute_mode") || "car",
    commute_distance_km: parseFloat(fd.get("commute_distance_km")) || 0,
    commute_days_per_week: parseInt(fd.get("commute_days_per_week")) || 0,
    school_run: fd.get("school_run") === "on",
    morning_walker_jogger: fd.get("morning_walker_jogger") === "on",
    budget: fd.get("budget") || "medium",
    language: getLang(),
  };
  state.profile = profile;

  // Show results section
  const resultsSection = $("#results-section");
  show(resultsSection);
  show($("#loading-skeleton"));
  hide($("#hero-card"));
  hide($("#tabs-wrap"));
  hide($("#error-banner"));
  hide($("#ai-badge"));
  hide($("#print-actions"));

  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const res = await fetch(API.assess, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: state.location, profile }),
    });

    hide($("#loading-skeleton"));

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showError(err.detail || `Error ${res.status}. Please try again.`);
      return;
    }

    const data = await res.json();
    state.assessment = data;
    renderAssessment(data);
  } catch (e) {
    hide($("#loading-skeleton"));
    if (e.name === "TypeError") {
      showError("Network error — please check your connection.");
    } else {
      showError("Something went wrong. Please try again.");
    }
    console.error("Assessment error:", e);
  }
}

function renderAssessment(data) {
  // AI badge
  const aiBadge = $("#ai-badge");
  if (aiBadge) {
    if (data.ai_generated) {
      aiBadge.querySelector("#ai-badge-text").textContent = t("ai_powered");
      show(aiBadge);
    } else {
      aiBadge.querySelector("#ai-badge-text").textContent = "Rule-based guidance (AI unavailable)";
      show(aiBadge);
    }
  }

  // Hero card
  drawGauge(data.current_aqi);
  $("#gauge-aqi-value").textContent = data.current_aqi.toFixed(0);
  renderRiskBadge(data);
  $("#headline-text").textContent = data.headline;
  $("#summary-text").textContent = data.summary;

  if (data.inversion_flag) show($("#inversion-banner"));
  else hide($("#inversion-banner"));

  renderReasons(data.risk_reasons || []);

  show($("#hero-card"));

  // Print date
  $("#print-date").textContent = new Date().toLocaleDateString(getLang());

  // Tabs
  renderHeatStrip(data.hourly_forecast || []);
  renderTimeline(data.timeline_tasks || []);
  renderTips(data.family_tips || [], data.kid_and_elder_notes || []);

  const tipsSection = $("#tips-section");
  if ((data.family_tips?.length || data.kid_and_elder_notes?.length)) show(tipsSection);

  const nudge = $("#motivational-nudge");
  if (nudge && data.motivational_nudge) {
    nudge.textContent = data.motivational_nudge;
    show(nudge);
  }

  renderHacks(data.indoor_hacks || []);
  renderAlternatives(data.sustainable_alternatives || []);

  show($("#tabs-wrap"));
  show($("#print-actions"));

  // Set up simulator
  renderSimActions();
}

function showError(msg) {
  const banner = $("#error-banner");
  const msgEl = $("#error-message");
  if (banner && msgEl) {
    msgEl.textContent = msg;
    show(banner);
  }
}

// ===== TABS =====
function initTabs() {
  const tabs = $$(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const panelId = tab.getAttribute("aria-controls");
      $$(".tab-panel").forEach((p) => hide(p));
      const panel = document.getElementById(panelId);
      if (panel) show(panel);
    });
    // Keyboard navigation
    tab.addEventListener("keydown", (e) => {
      const tabList = Array.from(tabs);
      const idx = tabList.indexOf(e.target);
      if (e.key === "ArrowRight") tabList[(idx + 1) % tabList.length]?.focus();
      if (e.key === "ArrowLeft") tabList[(idx - 1 + tabList.length) % tabList.length]?.focus();
    });
  });
}

// ===== READ ALOUD =====
function readAloud() {
  if (!("speechSynthesis" in window)) {
    alert("Text-to-speech is not supported in your browser.");
    return;
  }
  const text = [
    $("#headline-text")?.textContent,
    $("#summary-text")?.textContent,
    ...($$(".timeline-task") ? Array.from($$(".timeline-task")).map((e) => e.textContent) : []),
  ].filter(Boolean).join(". ");
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = getLang() === "hi" ? "hi-IN" : getLang() === "ta" ? "ta-IN" : "en-IN";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
}

// ===== GEOLOCATION =====
function useGeolocation() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.location = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        city_name: `${pos.coords.latitude.toFixed(2)}°N, ${pos.coords.longitude.toFixed(2)}°E`,
      };
      showLocationBanner(state.location.city_name);
    },
    () => alert("Could not get your location. Please search for your city instead.")
  );
}

// ===== DEMO PROFILE =====
function loadDemo() {
  state.location = { ...DELHI_DEMO.location };
  state.profile = { ...DELHI_DEMO.profile, language: getLang() };
  showLocationBanner("New Delhi");

  // Fill form
  const prof = DELHI_DEMO.profile;
  const setVal = (name, val) => {
    const el = $(`[name="${name}"]`);
    if (el) {
      if (el.type === "checkbox") el.checked = val;
      else if (el.type === "radio") {
        const r = $(`[name="${name}"][value="${val}"]`);
        if (r) r.checked = true;
      } else el.value = val;
    }
  };
  Object.entries(prof).forEach(([k, v]) => setVal(k, v));

  const input = $("#city-search");
  if (input) input.value = "New Delhi, India";
  const disp = $("#location-display");
  if (disp) show(disp);

  // Auto-run
  runAssessment();
}

// ===== ACCESSIBILITY TOGGLES =====
function initA11yToggles() {
  const btnLarge = $("#btn-large-text");
  const btnHC = $("#btn-high-contrast");

  btnLarge?.addEventListener("click", () => {
    const isLarge = document.documentElement.dataset.large === "true";
    document.documentElement.dataset.large = isLarge ? "false" : "true";
    btnLarge.setAttribute("aria-pressed", String(!isLarge));
  });

  btnHC?.addEventListener("click", () => {
    const isHC = document.documentElement.dataset.hc === "true";
    document.documentElement.dataset.hc = isHC ? "false" : "true";
    btnHC.setAttribute("aria-pressed", String(!isHC));
  });

  // Dark mode preference
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.dataset.theme = "dark";
  }
}

// ===== INIT =====
async function init() {
  applyTranslations();
  initTabs();
  initA11yToggles();

  // Language switcher
  $("#lang-select")?.addEventListener("change", (e) => {
    setLang(e.target.value);
    applyTranslations();
    // Update demo profile language
    if (state.profile) state.profile.language = getLang();
  });

  // City search
  $("#city-search")?.addEventListener("input", (e) => debouncedGeocode(e.target.value));
  $("#city-search")?.addEventListener("blur", () => setTimeout(() => hide($("#city-suggestions")), 150));

  // Geolocation button
  $("#btn-geolocate")?.addEventListener("click", useGeolocation);

  // Demo button
  $("#btn-demo")?.addEventListener("click", loadDemo);

  // Profile form submit
  $("#profile-form")?.addEventListener("submit", (e) => { e.preventDefault(); runAssessment(); });

  // Retry
  $("#btn-retry")?.addEventListener("click", runAssessment);

  // Read aloud
  $("#btn-read-aloud")?.addEventListener("click", readAloud);

  // Chat
  $("#btn-chat-send")?.addEventListener("click", sendChat);
  $("#chat-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  // Check Gemini availability
  try {
    const res = await fetch(API.health);
    if (res.ok) {
      const data = await res.json();
      state.geminiAvailable = data.gemini_available;
    }
  } catch { /* silent */ }
}

// Bootstrap
document.addEventListener("DOMContentLoaded", init);
