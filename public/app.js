/**
 * SaansSafe — app.js (Orchestrator Module)
 * Core application controller tying together UI modules, state, and API services.
 * Fully modular ES architecture, CSP-compliant, zero inline scripts.
 */

import { applyTranslations, getLang, setLang, t } from "./i18n.js?v=20261122_v4_ultracard";
import { $, $$, el, show, hide, animateValue, debounce } from "./js/dom.js?v=20261122_v4_ultracard";
import { animateGauge, drawGauge, initAmbientCanvas } from "./js/charts.js?v=20261122_v4_ultracard";
import {
  renderHeatStrip,
  renderTimeline,
  renderHacks,
  renderAlternatives,
  renderRiskBadge,
  renderReasons,
  renderTips,
} from "./js/components.js?v=20261122_v4_ultracard";
import { renderSimActions, runSimulation } from "./js/simulator.js?v=20261122_v4_ultracard";
import { initChat, sendChat } from "./js/chat.js?v=20261122_v4_ultracard";

// ===== CONSTANTS =====
const BERKELEY_EARTH_PM25_FACTOR = 22.0;

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

// ===== STATE =====
const state = {
  location: null,       // {lat: number, lon: number, city_name: string}
  profile: null,        // HouseholdProfile
  assessment: null,     // AssessmentResponse
  chatHistory: [],      // Array<{role: string, content: string}>
  geminiAvailable: false,
};

/**
 * Accessor for child modules to read application state.
 * @returns {{location: any, profile: any, assessment: any, chatHistory: any[], lang: string}}
 */
function getAppState() {
  return {
    ...state,
    lang: getLang(),
  };
}

// ===== GEOCODE & LOCATION =====
const debouncedGeocode = debounce(async (query) => {
  if (query.length < 2) return;
  try {
    const res = await fetch(`${API.geocode}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderSuggestions(data.results || []);
  } catch (e) {
    /* silent network catch */
  }
}, 350);

function renderSuggestions(results) {
  const list = $("#city-suggestions");
  if (!list) return;
  list.textContent = "";
  if (results.length === 0) {
    hide(list);
    return;
  }
  results.forEach((r) => {
    const li = el("li", `${r.name}, ${r.country}`, { role: "option", tabindex: "0" });
    li.addEventListener("click", () => selectLocation(r));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter") selectLocation(r);
    });
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
  if (disp && txt) {
    txt.textContent = name;
    show(disp);
  }
}

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

// ===== ASSESSMENT CONTROLLER =====
function _extractProfileFromForm(fd) {
  return {
    infants_children: parseInt(fd.get("infants_children"), 10) || 0,
    adults: parseInt(fd.get("adults"), 10) || 1,
    elderly: parseInt(fd.get("elderly"), 10) || 0,
    pregnant: fd.get("pregnant") === "on",
    has_asthma_copd: fd.get("has_asthma_copd") === "on",
    has_heart_condition: fd.get("has_heart_condition") === "on",
    has_purifier: fd.get("has_purifier") === "on",
    windows_type: fd.get("windows_type") || "unknown",
    cooking_fuel: fd.get("cooking_fuel") || "lpg",
    uses_ac_or_cooler: fd.get("uses_ac_or_cooler") === "on",
    commute_mode: fd.get("commute_mode") || "car",
    commute_distance_km: parseFloat(fd.get("commute_distance_km")) || 0,
    commute_days_per_week: parseInt(fd.get("commute_days_per_week"), 10) || 0,
    school_run: fd.get("school_run") === "on",
    morning_walker_jogger: fd.get("morning_walker_jogger") === "on",
    budget: fd.get("budget") || "medium",
    language: getLang(),
  };
}

function _resetAssessmentUI() {
  const resultsSection = $("#results-section");
  show(resultsSection);
  show($("#loading-skeleton"));
  hide($("#hero-card"));
  hide($("#tabs-wrap"));
  hide($("#error-banner"));
  hide($("#ai-badge"));
  hide($("#print-actions"));
  resultsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function _startProgressTracker() {
  const fill = $("#assess-progress-fill");
  const s1 = $("#stage-1"), s2 = $("#stage-2"), s3 = $("#stage-3");
  if (fill) fill.style.width = "20%";
  if (s1) s1.className = "stage-step active";
  if (s2) s2.className = "stage-step";
  if (s3) s3.className = "stage-step";

  const t1 = setTimeout(() => {
    if (fill) fill.style.width = "55%";
    if (s1) s1.className = "stage-step done";
    if (s2) s2.className = "stage-step active";
  }, 650);

  const t2 = setTimeout(() => {
    if (fill) fill.style.width = "88%";
    if (s2) s2.className = "stage-step done";
    if (s3) s3.className = "stage-step active";
  }, 1450);

  return {
    finish: () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (fill) fill.style.width = "100%";
      if (s1) s1.className = "stage-step done";
      if (s2) s2.className = "stage-step done";
      if (s3) s3.className = "stage-step done";
    },
  };
}

async function runAssessment() {
  if (!state.location) {
    alert("Please select a location first.");
    return;
  }
  const form = $("#profile-form");
  if (!form) return;

  const profile = _extractProfileFromForm(new FormData(form));
  state.profile = profile;
  _resetAssessmentUI();
  const tracker = _startProgressTracker();

  try {
    const res = await fetch(API.assess, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: state.location, profile }),
    });

    tracker.finish();
    await new Promise((r) => setTimeout(r, 200));
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
    tracker.finish();
    hide($("#loading-skeleton"));
    showError(e.name === "TypeError" ? "Network error — please check your connection." : "Something went wrong. Please try again.");
    console.error("Assessment error:", e);
  }
}

function _renderAiBadge(data) {
  const aiBadge = $("#ai-badge");
  if (!aiBadge) return;
  const txtEl = aiBadge.querySelector("#ai-badge-text");
  if (txtEl) {
    txtEl.textContent = data.ai_generated ? t("ai_powered") : "Rule-based guidance (AI unavailable)";
  }
  show(aiBadge);
}

function _renderHeroCard(data, aqi) {
  let glowColor = "rgba(16, 185, 129, 0.4)";
  if (aqi > 300) glowColor = "rgba(185, 28, 28, 0.6)";
  else if (aqi > 200) glowColor = "rgba(168, 85, 247, 0.55)";
  else if (aqi > 150) glowColor = "rgba(239, 68, 68, 0.55)";
  else if (aqi > 100) glowColor = "rgba(249, 115, 22, 0.5)";
  else if (aqi > 50) glowColor = "rgba(234, 179, 8, 0.45)";

  const gaugeWrap = $(".gauge-wrap");
  if (gaugeWrap) gaugeWrap.style.setProperty("--hazard-glow", glowColor);

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
}

function _renderPollutantsCard(data) {
  const pm25 = data.current_pm25 ?? 0;
  const pm10 = data.current_pm10 ?? 0;
  const cigs = (pm25 / BERKELEY_EARTH_PM25_FACTOR).toFixed(1);
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
}

function _renderTabsAndActions(data) {
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
  renderAlternatives(data.sustainable_alternatives || [], (actionId) => {
    const tabBtn = $("#tab-btn-simulator");
    if (tabBtn) tabBtn.click();
    const cb = document.querySelector(`#sim-actions input[name="${actionId}"]`);
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    }
    $("#tab-simulator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const tabsWrap = $("#tabs-wrap");
  if (tabsWrap) {
    tabsWrap.classList.remove("fade-in-up", "stagger-3");
    void tabsWrap.offsetWidth;
    tabsWrap.classList.add("fade-in-up", "stagger-3");
    show(tabsWrap);
  }
  show($("#print-actions"));
  renderSimActions(getAppState, API.simulate);
}

function renderAssessment(data) {
  const aqi = data.current_aqi || 0;
  _renderAiBadge(data);
  _renderHeroCard(data, aqi);
  _renderPollutantsCard(data);
  updateActivityDirectives(data);
  $("#print-date").textContent = new Date().toLocaleDateString(getLang());
  _renderTabsAndActions(data);
}

function _updateWalkAndPlayDirectives(aqi) {
  const actWalk = $("#act-walk-status");
  const actPlay = $("#act-play-status");

  if (actWalk) {
    if (aqi > 200) {
      actWalk.textContent = "🚫 Avoid Running"; actWalk.className = "act-status status-danger";
    } else if (aqi > 100) {
      actWalk.textContent = "⚠️ Mild Walk Only"; actWalk.className = "act-status status-warning";
    } else {
      actWalk.textContent = "✅ Safe for Jogging"; actWalk.className = "act-status status-safe";
    }
  }

  if (actPlay) {
    if (aqi > 150) {
      actPlay.textContent = "🚫 Keep Indoors"; actPlay.className = "act-status status-danger";
    } else if (aqi > 75) {
      actPlay.textContent = "⚠️ Limit Duration"; actPlay.className = "act-status status-warning";
    } else {
      actPlay.textContent = "✅ Safe Outdoor Play"; actPlay.className = "act-status status-safe";
    }
  }
}

function _updateVentAndMaskDirectives(aqi, inversion_flag) {
  const actVent = $("#act-vent-status");
  const actMask = $("#act-mask-status");

  if (actVent) {
    if (inversion_flag || aqi > 200) {
      actVent.textContent = "⚠️ 12 PM - 2 PM Only"; actVent.className = "act-status status-warning";
    } else if (aqi > 100) {
      actVent.textContent = "⚠️ Afternoon Airing"; actVent.className = "act-status status-warning";
    } else {
      actVent.textContent = "✅ Open Freely"; actVent.className = "act-status status-safe";
    }
  }

  if (actMask) {
    if (aqi > 200) {
      actMask.textContent = "😷 N95 Mandatory"; actMask.className = "act-status status-danger";
    } else if (aqi > 100) {
      actMask.textContent = "😷 N95 for Commute"; actMask.className = "act-status status-warning";
    } else {
      actMask.textContent = "✅ Mask Optional"; actMask.className = "act-status status-safe";
    }
  }
}

function updateActivityDirectives(data) {
  const aqi = data.current_aqi || 0;
  _updateWalkAndPlayDirectives(aqi);
  _updateVentAndMaskDirectives(aqi, data.inversion_flag);
}

function showError(msg) {
  const banner = $("#error-banner");
  const msgEl = $("#error-message");
  if (banner && msgEl) {
    msgEl.textContent = msg;
    show(banner);
  }
}

// ===== ACCESSIBILITY & TABS =====
function initTabs() {
  const tabs = $$(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const panelId = tab.getAttribute("aria-controls");
      $$(".tab-panel").forEach((p) => hide(p));
      const panel = document.getElementById(panelId);
      if (panel) {
        show(panel);
        if (panelId === "tab-simulator") {
          runSimulation(getAppState, API.simulate);
        }
      }
    });

    tab.addEventListener("keydown", (e) => {
      const tabList = Array.from(tabs);
      const idx = tabList.indexOf(e.target);
      if (e.key === "ArrowRight") tabList[(idx + 1) % tabList.length]?.focus();
      if (e.key === "ArrowLeft") tabList[(idx - 1 + tabList.length) % tabList.length]?.focus();
    });
  });
}

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

function loadDemo() {
  state.location = { ...DELHI_DEMO.location };
  state.profile = { ...DELHI_DEMO.profile, language: getLang() };
  showLocationBanner("New Delhi");

  const prof = DELHI_DEMO.profile;
  const setVal = (name, val) => {
    const field = $(`[name="${name}"]`);
    if (field) {
      if (field.type === "checkbox") field.checked = val;
      else if (field.type === "radio") {
        const r = $(`[name="${name}"][value="${val}"]`);
        if (r) r.checked = true;
      } else field.value = val;
    }
  };
  Object.entries(prof).forEach(([k, v]) => setVal(k, v));

  const input = $("#city-search");
  if (input) input.value = "New Delhi, India";
  showLocationBanner("New Delhi, India (28.61°, 77.21°)");

  runAssessment();
}

function _initThemeToggle(btnTheme) {
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

  _initThemeToggle(btnTheme);
}

// ===== BOOTSTRAP INITIALIZATION =====
function _bindLocationEvents() {
  $("#lang-select")?.addEventListener("change", (e) => {
    setLang(e.target.value);
    applyTranslations();
    if (state.profile) state.profile.language = getLang();
  });

  $("#city-search")?.addEventListener("input", (e) => debouncedGeocode(e.target.value));
  $("#city-search")?.addEventListener("blur", () => setTimeout(() => hide($("#city-suggestions")), 150));

  $$(".city-chip").forEach((chip) => {
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

  $("#btn-geolocate")?.addEventListener("click", useGeolocation);
  $("#btn-demo")?.addEventListener("click", loadDemo);
}

function _bindFormAndRetryEvents() {
  $("#profile-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    runAssessment();
  });
  $("#btn-retry")?.addEventListener("click", runAssessment);
  $("#btn-read-aloud")?.addEventListener("click", readAloud);
}

function _bindChatEvents() {
  initChat();
  $("#btn-clear-chat")?.addEventListener("click", () => {
    const container = $("#chat-messages");
    if (container) container.textContent = "";
    state.chatHistory = [];
    initChat();
  });
  $("#btn-chat-send")?.addEventListener("click", () => sendChat(getAppState, API.chat));
  $("#chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat(getAppState, API.chat);
  });
  $$(".chat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $("#chat-input");
      if (input) {
        input.value = btn.textContent.replace(/^[\p{Emoji}\s]+/u, "").trim();
        sendChat(getAppState, API.chat);
      }
    });
  });
}

function _bindSummaryAndPrintEvents() {
  $("#btn-print-plan")?.addEventListener("click", () => window.print());

  $("#btn-copy-summary")?.addEventListener("click", () => {
    if (!state.assessment) return;
    const a = state.assessment;
    const city = state.location?.city_name || "Delhi";
    const text = `📋 SaansSafe Family Smog Protocol — ${city}\nDate: ${new Date().toLocaleDateString(getLang())}\nCurrent AQI: ${Math.round(a.current_aqi)} (${a.risk_level} Risk)\nPM2.5: ${Math.round(a.current_pm25)} µg/m³\n\nHeadline: ${a.headline}\nSummary: ${a.summary}\n\nTop Family Actions:\n${(a.family_tips || []).map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nProtect Your Lungs with SaansSafe: https://promptwars-saanssafe.vercel.app/`;

    navigator.clipboard.writeText(text).then(() => {
      const btn = $("#btn-copy-summary");
      if (btn) {
        const origText = btn.textContent;
        btn.textContent = "✅ Protocol Copied!";
        setTimeout(() => { btn.textContent = origText; }, 2200);
      }
    }).catch(() => {
      alert("Protocol copied to clipboard!");
    });
  });
}

async function _checkGeminiHealth() {
  try {
    const res = await fetch(API.health);
    if (res.ok) {
      const data = await res.json();
      state.geminiAvailable = data.gemini_available;
    }
  } catch {
    /* health check optional */
  }
}

async function init() {
  applyTranslations();
  initTabs();
  initA11yToggles();
  initAmbientCanvas();

  _bindLocationEvents();
  _bindFormAndRetryEvents();
  _bindChatEvents();
  _bindSummaryAndPrintEvents();
  await _checkGeminiHealth();
}

// Bootstrap
document.addEventListener("DOMContentLoaded", init);
