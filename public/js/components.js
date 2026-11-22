/**
 * SaansSafe — UI Component Renderers (ES Module)
 * Renders heat strips, hour-by-hour timelines, indoor hacks, and sustainable alternatives with cards.
 * Uses safe DOM builders (never innerHTML for text/data).
 */

import { $, $$, el } from "./dom.js";

let _allAlternatives = [];

/**
 * Render 24-hour heat strip cells indicating safe/caution/avoid hours.
 * @param {Array<{hour: number, aqi: number, tag: string}>} hourly
 */
export function renderHeatStrip(hourly) {
  const strip = $("#heat-strip");
  if (!strip) return;
  strip.textContent = "";
  const tagColor = { safe: "#00e400", caution: "#ff7e00", avoid: "#ff0000" };
  hourly.forEach((h) => {
    const cell = el("div", null, { class: "heat-cell" });
    cell.style.background = tagColor[h.tag] || "#ccc";
    cell.setAttribute("data-hour", String(h.hour));
    cell.setAttribute("title", `${h.hour}:00 — AQI ${h.aqi.toFixed(0)} (${h.tag})`);
    cell.setAttribute("aria-label", `${h.hour}:00 AQI ${h.aqi.toFixed(0)}, ${h.tag}`);
    strip.appendChild(cell);
  });
}

/**
 * Render daily timeline schedule items.
 * @param {Array<{time: string, icon: string, task: string, reason: string}>} tasks
 */
export function renderTimeline(tasks) {
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

/**
 * Render verified indoor air quality hacks with cost tiers, progress bars, and myth busters.
 * @param {Array<{cost_tier: string, effort?: string, title: string, description: string, effect_pct: number, myth_bust?: string}>} hacks
 */
export function renderHacks(hacks) {
  const grid = $("#hacks-grid");
  if (!grid) return;
  grid.textContent = "";
  hacks.forEach((h) => {
    const card = el("div", null, { class: "measure-card", role: "listitem" });

    // Card Header with category icon & cost badge
    const header = el("div", null, { class: "alt-card-header" });
    const iconWrap = el("div", null, { class: "alt-icon-wrap" });
    const tipIcon = (h.cost_tier === "zero" || h.cost_tier === "free") ? "💡" : h.cost_tier === "low" ? "🧹" : "🏠";
    iconWrap.appendChild(el("span", tipIcon, { class: "alt-icon" }));
    header.appendChild(iconWrap);

    const badgeWrap = el("div", null, { class: "alt-badges-wrap" });
    const costClass = (h.cost_tier === "zero" || h.cost_tier === "free") ? "tag-free" : h.cost_tier === "low" ? "tag-low" : "tag-medium";
    const costLabel = (h.cost_tier === "zero" || h.cost_tier === "free") ? "Zero-Cost" : h.cost_tier === "low" ? "Low-Cost" : "High-Impact";
    badgeWrap.appendChild(el("span", costLabel, { class: `tag ${costClass}` }));
    if (h.effort) badgeWrap.appendChild(el("span", h.effort, { class: "tag" }));
    header.appendChild(badgeWrap);
    card.appendChild(header);

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

    if (h.myth_bust) {
      card.appendChild(el("p", h.myth_bust, { class: "myth-bust" }));
    }

    grid.appendChild(card);
  });
}

/**
 * Render sustainable lifestyle alternatives in a modern card view with metrics grid and filters.
 * @param {Array<any>} alts
 * @param {(actionId: string) => void} [onTestSimulator] Optional callback to trigger What-If simulator
 */
export function renderAlternatives(alts, onTestSimulator) {
  _allAlternatives = alts || [];
  const grid = $("#alternatives-grid");
  if (!grid) return;
  grid.textContent = "";

  _allAlternatives.forEach((a) => {
    const card = el("div", null, {
      class: `alt-card alt-cat-${a.category || "transit"}`,
      role: "listitem",
      "data-category": a.category || "transit",
    });

    // Card Header with category icon, category pill & effort badge
    const header = el("div", null, { class: "alt-card-header" });
    const iconWrap = el("div", null, { class: "alt-icon-wrap" });
    iconWrap.appendChild(el("span", a.icon || "🌱", { class: "alt-icon" }));
    header.appendChild(iconWrap);

    const badgeWrap = el("div", null, { class: "alt-badges-wrap" });
    const categoryName = a.category === "transit" ? "Transit Swap" : a.category === "cooking" ? "Clean Cooking" : "Home & Work";
    badgeWrap.appendChild(el("span", categoryName, { class: "tag tag-category" }));

    const effortLabel = a.effort || "Recommended";
    const effortClass = (effortLabel === "Easy" || effortLabel === "Zero-Cost") ? "tag-free" : effortLabel === "Low-Cost" ? "tag-low" : "tag-medium";
    badgeWrap.appendChild(el("span", effortLabel, { class: `tag ${effortClass}` }));
    header.appendChild(badgeWrap);
    card.appendChild(header);

    // Title & description
    card.appendChild(el("h3", a.title, { class: "card-title" }));
    card.appendChild(el("p", a.description, { class: "card-desc" }));

    // Key Impact Metrics Grid
    const metricsGrid = el("div", null, { class: "alt-metrics-grid" });
    if (a.exposure_change_pct < 0) {
      const m1 = el("div", null, { class: "alt-metric" });
      m1.appendChild(el("span", "Personal Dose Cut", { class: "alt-m-label" }));
      m1.appendChild(el("span", `⬇ ${Math.abs(a.exposure_change_pct)}%`, { class: "alt-m-val text-success" }));
      metricsGrid.appendChild(m1);
    }
    if (a.emission_change_gco2e_per_km < 0) {
      const m2 = el("div", null, { class: "alt-metric" });
      m2.appendChild(el("span", "Carbon Saved", { class: "alt-m-label" }));
      m2.appendChild(el("span", `${a.emission_change_gco2e_per_km.toFixed(0)} g/km`, { class: "alt-m-val text-accent" }));
      metricsGrid.appendChild(m2);
    }
    if (a.monthly_savings_inr) {
      const m3 = el("div", null, { class: "alt-metric" });
      m3.appendChild(el("span", "Est. Fuel Saved", { class: "alt-m-label" }));
      m3.appendChild(el("span", `~₹${a.monthly_savings_inr}/mo`, { class: "alt-m-val text-warning" }));
      metricsGrid.appendChild(m3);
    }
    card.appendChild(metricsGrid);

    // Community note
    if (a.community_note) {
      const note = el("p", `🌍 ${a.community_note}`, { class: "card-desc card-community" });
      card.appendChild(note);
    }

    // Action button: Test in What-If
    if (a.sim_action_id) {
      const btn = el("button", null, { class: "btn btn-outline btn-sm btn-simulate-alt", type: "button" });
      const btnSpan = el("span", "🧪 Test in What-If Simulator");
      const arrowSpan = el("span", " →", { "aria-hidden": "true" });
      btn.appendChild(btnSpan);
      btn.appendChild(arrowSpan);

      btn.addEventListener("click", () => {
        if (onTestSimulator) {
          onTestSimulator(a.sim_action_id);
        } else {
          const tabBtn = $("#tab-btn-simulator");
          if (tabBtn) tabBtn.click();
          const cb = document.querySelector(`#sim-actions input[name="${a.sim_action_id}"]`);
          if (cb) {
            cb.checked = true;
            cb.dispatchEvent(new Event("change"));
          }
          $("#tab-simulator")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      card.appendChild(btn);
    }

    grid.appendChild(card);
  });

  initAltFilters();
}

/**
 * Initialize category filter pill chips on alternatives.
 */
export function initAltFilters() {
  const chips = $$(".alt-filter-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const filter = chip.getAttribute("data-filter");
      const cards = $$(".alt-card");
      cards.forEach((card) => {
        const cat = card.getAttribute("data-category");
        if (filter === "all" || cat === filter) {
          card.style.display = "flex";
        } else {
          card.style.display = "none";
        }
      });
    });
  });
}

/**
 * Render personal risk level badge.
 * @param {{risk_color: string, risk_icon: string, risk_level: string, risk_score: number}} result
 */
export function renderRiskBadge(result) {
  const badge = $("#risk-badge");
  if (!badge) return;
  badge.style.background = result.risk_color + "22";
  badge.style.border = `2px solid ${result.risk_color}`;
  badge.style.color = result.risk_color;
  $("#risk-icon").textContent = result.risk_icon;
  $("#risk-level-text").textContent = result.risk_level;
  $("#risk-score-text").textContent = `(${result.risk_score}/100)`;
}

/**
 * Render itemized risk reasons in the expandable "Why this risk level?" accordion.
 * @param {Array<{factor: string, description: string}>} reasons
 */
export function renderReasons(reasons) {
  const list = $("#risk-reasons-list");
  if (!list) return;
  list.textContent = "";
  reasons.forEach((r) => {
    const li = el("li");
    li.appendChild(el("span", r.description));
    list.appendChild(li);
  });
}

/**
 * Render family and vulnerable group tips.
 * @param {string[]} familyTips
 * @param {string[]} kidsTips
 */
export function renderTips(familyTips, kidsTips) {
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
