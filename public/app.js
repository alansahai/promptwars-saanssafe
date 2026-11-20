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
let currentGaugeVal = 0;
let gaugeAnimFrame = null;

function animateGauge(targetAqi, duration = 850) {
  if (gaugeAnimFrame) cancelAnimationFrame(gaugeAnimFrame);
  const startVal = currentGaugeVal;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const val = startVal + (targetAqi - startVal) * ease;
    drawGauge(val);
    if (progress < 1) {
      gaugeAnimFrame = requestAnimationFrame(step);
    } else {
      currentGaugeVal = targetAqi;
      drawGauge(targetAqi);
    }
  }
  gaugeAnimFrame = requestAnimationFrame(step);
}

function drawGauge(aqi) {
  const canvas = $("#aqi-gauge");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const isDark = document.documentElement.dataset.theme === "dark" || 
                 window.matchMedia("(prefers-color-scheme: dark)").matches;
  const needleColor = isDark ? "#ffffff" : "#0f172a";

  const cx = w / 2, cy = h - 10;
  const r = Math.min(cx, cy) - 10;

  // Background track arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 16;
  ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  ctx.stroke();

  // AQI colour bands (angle: π to 2π)
  const bands = [
    { max: 50, color: "#10b981" },
    { max: 100, color: "#84cc16" },
    { max: 150, color: "#f59e0b" },
    { max: 200, color: "#f97316" },
    { max: 300, color: "#ef4444" },
    { max: 500, color: "#7f1d1d" },
  ];
  let prevAngle = Math.PI;
  for (const band of bands) {
    const frac = Math.min(band.max, 500) / 500;
    const endAngle = Math.PI + frac * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, prevAngle, endAngle);
    ctx.lineWidth = 16;
    ctx.strokeStyle = band.color;
    ctx.stroke();
    prevAngle = endAngle;
  }

  // Needle with glow
  const fraction = Math.min(aqi, 500) / 500;
  const needleAngle = Math.PI + fraction * Math.PI;
  ctx.save();
  ctx.shadowColor = isDark ? "rgba(52, 211, 153, 0.8)" : "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + (r - 18) * Math.cos(needleAngle),
    cy + (r - 18) * Math.sin(needleAngle)
  );
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = needleColor;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Centre dot
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctx.fillStyle = needleColor;
  ctx.fill();
}

// ===== BEFORE/AFTER BAR CHART (canvas) =====
function drawSimChart(before, after) {
  const canvas = $("#sim-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const isDark = document.documentElement.dataset.theme === "dark" || 
                 window.matchMedia("(prefers-color-scheme: dark)").matches;
  const textColor = isDark ? "#f8fafc" : "#0f172a";
  const subtextColor = isDark ? "#94a3b8" : "#64748b";

  const maxVal = Math.max(before, after, 1);
  const barW = 100, gap = 60, startX = 80;
  const maxH = h - 50;

  const drawBar = (x, val, color, label) => {
    const bh = (val / maxVal) * maxH;
    const y = h - 30 - bh;
    
    // Bar gradient
    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + "aa");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, bh, [6, 6, 0, 0]);
    ctx.fill();

    // Value text
    ctx.fillStyle = textColor;
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(val.toFixed(1), x + barW / 2, y - 8);
    ctx.fillStyle = subtextColor;
    ctx.font = "12px system-ui";
    ctx.fillText(label, x + barW / 2, h - 10);
  };

  drawBar(startX, before, "#ef4444", "Before");
  drawBar(startX + barW + gap, after, "#10b981", "After");

  // Y-axis label
  ctx.save();
  ctx.translate(20, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "11px system-ui";
  ctx.fillStyle = subtextColor;
  ctx.fillText("PM2.5 µg/day", 0, 0);
  ctx.restore();
}

// ===== NUMBER ANIMATION HELPER =====
function animateValue(el, start, end, duration = 800) {
  if (!el) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + eased * (end - start));
    el.textContent = current;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.textContent = Math.round(end);
    }
  };
  window.requestAnimationFrame(step);
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
      const note = el("p", `🌍 ${a.community_note}`, { class: "card-desc card-community" });
      card.appendChild(note);
    }
    const tags = el("div", null, { class: "card-tags" });
    if (a.exposure_change_pct < 0) {
      tags.appendChild(el("span", `Exposure ${a.exposure_change_pct}%`, { class: "tag tag-free" }));
    }
    if (a.emission_change_gco2e_per_km < 0) {
      tags.appendChild(el("span", `${a.emission_change_gco2e_per_km.toFixed(0)} gCO₂e/km`, { class: "tag tag-low" }));
    }
    tags.appendChild(el("span", `Effort: ${a.effort}`, { class: "tag tag-medium" }));
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
  SIM_ACTIONS.forEach((action, idx) => {
    const item = el("label", null, { class: "sim-action-item" });
    const cb = el("input", null, { type: "checkbox" });
    cb.name = action.id;
    // Pre-check the induction cooking swap for instant interactive feedback
    if (idx === 1) cb.checked = true;
    cb.addEventListener("change", debounce(runSimulation, 250));
    item.appendChild(cb);
    const textWrap = el("div");
    textWrap.appendChild(el("div", action.label, { class: "sim-action-label" }));
    textWrap.appendChild(el("div", action.desc, { class: "sim-action-desc" }));
    item.appendChild(textWrap);
    container.appendChild(item);
  });

  // Automatically run initial simulation so results and chart render immediately
  runSimulation();
}

async function runSimulation() {
  if (!state.location || !state.profile) return;

  const checked = $$('#sim-actions input[type=checkbox]:checked');
  const actions = Array.from(checked).map((cb) => ({
    action_id: cb.name,
    enabled: true,
  }));

  try {
    const outdoorPm25 = Number(state.assessment?.current_pm25 ?? 120.0);
    const res = await fetch(API.simulate, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outdoor_pm25: outdoorPm25,
        location: state.location,
        profile: { ...state.profile, language: getLang() },
        actions,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();

    const beforeDose = Number(data.before_pm25_dose_ug ?? data.baseline_daily_pm25_dose_ug ?? 0);
    const afterDose = Number(data.after_pm25_dose_ug ?? data.intervention_daily_pm25_dose_ug ?? 0);
    const co2Saved = Number(data.co2e_saved_per_year_kg ?? data.annual_co2_kg_saved ?? 0);
    const equivKm = Number(data.equivalent_km_not_driven ?? 0);

    show($("#sim-results"));
    $("#sim-before-dose").textContent = beforeDose.toFixed(1);
    $("#sim-after-dose").textContent = afterDose.toFixed(1);
    $("#sim-co2-saved").textContent = co2Saved.toFixed(1);
    $("#sim-equiv-km").textContent = equivKm.toFixed(0);

    drawSimChart(beforeDose, afterDose);

    const formulaEl = $("#sim-formula");
    if (formulaEl && data.formula) formulaEl.textContent = data.formula;

    const assumptionsList = $("#sim-assumptions");
    if (assumptionsList && Array.isArray(data.assumptions)) {
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

  // Set hazard glow on gauge wrap
  const aqi = data.current_aqi || 0;
  let glowColor = "rgba(16, 185, 129, 0.4)";
  if (aqi > 300) glowColor = "rgba(185, 28, 28, 0.6)";
  else if (aqi > 200) glowColor = "rgba(168, 85, 247, 0.55)";
  else if (aqi > 150) glowColor = "rgba(239, 68, 68, 0.55)";
  else if (aqi > 100) glowColor = "rgba(249, 115, 22, 0.5)";
  else if (aqi > 50) glowColor = "rgba(234, 179, 8, 0.45)";
  const gaugeWrap = $(".gauge-wrap");
  if (gaugeWrap) gaugeWrap.style.setProperty("--hazard-glow", glowColor);

  // Hero card with smooth animated sweep
  animateGauge(aqi, 850);
  animateValue($("#gauge-aqi-value"), 0, aqi, 850);
  renderRiskBadge(data);
  $("#headline-text").textContent = data.headline;
  $("#summary-text").textContent = data.summary;

  if (data.inversion_flag) show($("#inversion-banner"));
  else hide($("#inversion-banner"));

  renderReasons(data.risk_reasons || []);

  const heroCard = $("#hero-card");
  if (heroCard) {
    heroCard.classList.remove("fade-in-up", "stagger-1");
    void heroCard.offsetWidth;
    heroCard.classList.add("fade-in-up", "stagger-1");
    show(heroCard);
  }

  // Pollutants & Health Intelligence Grid
  const pm25 = data.current_pm25 ?? 0;
  const pm10 = data.current_pm10 ?? 0;
  const cigs = (pm25 / 22).toFixed(1);
  const pCard = $("#pollutants-card");
  if (pCard) {
    pCard.classList.remove("fade-in-up", "stagger-2");
    void pCard.offsetWidth;
    pCard.classList.add("fade-in-up", "stagger-2");
    $("#val-pm25").textContent = `${pm25.toFixed(1)} µg/m³`;
    $("#val-pm10").textContent = `${pm10.toFixed(1)} µg/m³`;
    $("#val-cigs").textContent = `≈ ${cigs} / day`;
    $("#val-inversion").textContent = data.inversion_flag ? "High (Trapped)" : "Dispersed";
    show(pCard);
  }

  // Activity safety directives
  const actWalk = $("#act-walk-status");
  const actPlay = $("#act-play-status");
  const actVent = $("#act-vent-status");
  const actMask = $("#act-mask-status");

  if (actWalk) {
    if (data.current_aqi > 200) {
      actWalk.textContent = "🚫 Avoid Running";
      actWalk.className = "act-status status-danger";
    } else if (data.current_aqi > 100) {
      actWalk.textContent = "⚠️ Mild Walk Only";
      actWalk.className = "act-status status-warning";
    } else {
      actWalk.textContent = "✅ Safe for Jogging";
      actWalk.className = "act-status status-safe";
    }
  }

  if (actPlay) {
    if (data.current_aqi > 150) {
      actPlay.textContent = "🚫 Keep Indoors";
      actPlay.className = "act-status status-danger";
    } else if (data.current_aqi > 75) {
      actPlay.textContent = "⚠️ Limit Duration";
      actPlay.className = "act-status status-warning";
    } else {
      actPlay.textContent = "✅ Safe Outdoor Play";
      actPlay.className = "act-status status-safe";
    }
  }

  if (actVent) {
    if (data.inversion_flag || data.current_aqi > 200) {
      actVent.textContent = "⚠️ 12 PM - 2 PM Only";
      actVent.className = "act-status status-warning";
    } else if (data.current_aqi > 100) {
      actVent.textContent = "⚠️ Afternoon Airing";
      actVent.className = "act-status status-warning";
    } else {
      actVent.textContent = "✅ Open Freely";
      actVent.className = "act-status status-safe";
    }
  }

  if (actMask) {
    if (data.current_aqi > 200) {
      actMask.textContent = "😷 N95 Mandatory";
      actMask.className = "act-status status-danger";
    } else if (data.current_aqi > 100) {
      actMask.textContent = "😷 N95 for Commute";
      actMask.className = "act-status status-warning";
    } else {
      actMask.textContent = "✅ Mask Optional";
      actMask.className = "act-status status-safe";
    }
  }

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

  const tabsWrap = $("#tabs-wrap");
  if (tabsWrap) {
    tabsWrap.classList.remove("fade-in-up", "stagger-3");
    void tabsWrap.offsetWidth;
    tabsWrap.classList.add("fade-in-up", "stagger-3");
    show(tabsWrap);
  }
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
      if (panel) {
        show(panel);
        if (panelId === "tab-simulator") {
          runSimulation();
        }
      }
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
  showLocationBanner("New Delhi, India (28.61°, 77.21°)");

  // Auto-run
  runAssessment();
}

// ===== ACCESSIBILITY & THEME CONTROLS =====
function initA11yToggles() {
  const btnLarge = $("#btn-large-text");
  const btnHC = $("#btn-high-contrast");
  const btnTheme = $("#btn-theme-toggle");

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

  const updateThemeUI = (theme) => {
    const icon = btnTheme?.querySelector(".theme-icon");
    if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
    if (btnTheme) {
      btnTheme.setAttribute("aria-pressed", String(theme === "dark"));
      btnTheme.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  };

  const savedTheme = localStorage.getItem("saanssafe_theme");
  const initialTheme = savedTheme || "dark";
  document.documentElement.dataset.theme = initialTheme;
  updateThemeUI(initialTheme);

  btnTheme?.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("saanssafe_theme", next);
    updateThemeUI(next);
    if (state.assessment) {
      drawGauge(state.assessment.current_aqi);
    }
  });
}

// ===== AMBIENT PARTICLES CANVAS =====
function initAmbientCanvas() {
  const canvas = $("#ambient-canvas");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;
  let w = (canvas.width = parent?.offsetWidth || canvas.offsetWidth || 900);
  let h = (canvas.height = parent?.offsetHeight || canvas.offsetHeight || 320);

  const particleCount = 45;
  const particles = Array.from({ length: particleCount }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 2.2 + 1,
    dx: (Math.random() - 0.5) * 0.4,
    dy: -Math.random() * 0.35 - 0.1,
    alpha: Math.random() * 0.6 + 0.25,
    hue: Math.random() > 0.45 ? 160 : 195,
  }));

  let mouse = { x: -1000, y: -1000 };
  parent?.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  parent?.addEventListener("mouseleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  function animate() {
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.dx;
      p.y += p.dy;

      const mdx = p.x - mouse.x;
      const mdy = p.y - mouse.y;
      const mdist = Math.hypot(mdx, mdy);
      if (mdist < 70) {
        p.x += (mdx / mdist) * 1.5;
        p.y += (mdy / mdist) * 1.5;
      }

      if (p.y < -10) p.y = h + 10;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.alpha})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${p.hue}, 85%, 60%, 0.5)`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 65) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `hsla(160, 80%, 65%, ${(1 - dist / 65) * 0.16})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.addEventListener("resize", () => {
    if (!canvas) return;
    w = canvas.width = parent?.offsetWidth || canvas.offsetWidth || 900;
    h = canvas.height = parent?.offsetHeight || canvas.offsetHeight || 320;
  });
}

// ===== INIT =====
async function init() {
  applyTranslations();
  initTabs();
  initA11yToggles();
  initAmbientCanvas();

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

  // Quick city hotspot chips
  document.querySelectorAll(".city-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const city = chip.getAttribute("data-city");
      const lat = parseFloat(chip.getAttribute("data-lat"));
      const lon = parseFloat(chip.getAttribute("data-lon"));
      state.location = { lat, lon, city_name: city };
      const searchInput = $("#city-search");
      if (searchInput) searchInput.value = `${city}, India`;
      const disp = $("#location-display");
      const text = $("#location-text");
      if (disp && text) {
        text.textContent = `${city} (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;
        show(disp);
      }
      runAssessment();
    });
  });

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

  // Chat suggestion chips
  document.querySelectorAll(".chat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $("#chat-input");
      if (input) {
        input.value = btn.textContent.replace(/^[\p{Emoji}\s]+/u, "").trim();
        sendChat();
      }
    });
  });

  // Print plan
  $("#btn-print-plan")?.addEventListener("click", () => window.print());

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
