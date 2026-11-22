/**
 * SaansSafe — What-If Impact Simulator (ES Module)
 * Interactive physical dose calculation, presets, and toggleable intervention scenarios.
 */

import { $, $$, el, show } from "./dom.js";
import { drawSimChart } from "./charts.js";

export const SIM_ACTIONS = [
  { id: "add_air_purifier", icon: "🏠", label: "Add HEPA Air Purifier", tag: "Indoor Shield", desc: "Run true HEPA filtration in bedrooms & living areas (-50% infiltration)" },
  { id: "switch_to_induction", icon: "🍳", label: "Switch to Induction Cooking", tag: "Clean Kitchen", desc: "Replace LPG / biomass with soot-free electric cooktop" },
  { id: "switch_commute_to_metro", icon: "🚇", label: "Switch Commute to Metro", tag: "Rapid Transit", desc: "Trade road congestion for filtered AC carriages (-40% transit smog)" },
  { id: "switch_commute_to_bus", icon: "🚌", label: "Switch Commute to Electric Bus", tag: "Shared Transit", desc: "Reduce personal tailpipe inhalation and local road vehicle count" },
  { id: "switch_commute_to_cycle", icon: "🚲", label: "Cycle / Walk for Trips <3 km", tag: "Zero Tailpipe", desc: "Avoid cold-start petrol engine emissions for quick neighbourhood errands" },
  { id: "work_from_home_2_days", icon: "💻", label: "Work From Home 2 Days/Week", tag: "Avoid Peak Smog", desc: "Completely eliminate travel exposure on 2 heaviest smog weekdays" },
];

/**
 * Render simulator action toggles.
 * @param {() => {location: any, profile: any, assessment: any, lang: string}} getState
 * @param {string} apiEndpoint
 */
export function renderSimActions(getState, apiEndpoint = "/api/simulate") {
  const container = $("#sim-actions");
  if (!container) return;
  container.textContent = "";

  SIM_ACTIONS.forEach((action, idx) => {
    const item = el("label", null, { class: "sim-action-item" });

    const leftWrap = el("div", null, { class: "sim-item-left" });
    leftWrap.appendChild(el("span", action.icon || "⚡", { class: "sim-item-icon" }));

    const textWrap = el("div", null, { class: "sim-item-text" });
    const titleRow = el("div", null, { class: "sim-title-row" });
    titleRow.appendChild(el("span", action.label, { class: "sim-action-label" }));
    if (action.tag) {
      titleRow.appendChild(el("span", action.tag, { class: "sim-action-tag" }));
    }
    textWrap.appendChild(titleRow);
    textWrap.appendChild(el("div", action.desc, { class: "sim-action-desc" }));
    leftWrap.appendChild(textWrap);
    item.appendChild(leftWrap);

    // Toggle switch
    const toggleWrap = el("div", null, { class: "sim-switch-wrap" });
    const cb = el("input", null, { type: "checkbox", class: "sim-switch-input" });
    cb.name = action.id;
    // Default check induction and metro for instant high-impact demo
    if (idx === 1 || idx === 2) {
      cb.checked = true;
      item.classList.add("active");
    }

    const updateItemActive = () => {
      if (cb.checked) item.classList.add("active");
      else item.classList.remove("active");
    };

    cb.addEventListener("change", () => {
      updateItemActive();
      runSimulation(getState, apiEndpoint);
    });

    const slider = el("span", null, { class: "sim-switch-slider", "aria-hidden": "true" });
    toggleWrap.appendChild(cb);
    toggleWrap.appendChild(slider);
    item.appendChild(toggleWrap);

    container.appendChild(item);
  });

  initPresets(getState, apiEndpoint);
  runSimulation(getState, apiEndpoint);
}

/**
 * Set checkbox check state by action name.
 * @param {string} name Action name ID
 * @param {boolean} val Checkbox checked state
 */
export function setCheck(name, val) {
  const cb = document.querySelector(`#sim-actions input[name="${name}"]`);
  if (cb) cb.checked = val;
}

/**
 * Initialize one-click scenario preset chips.
 * @param {() => {location: any, profile: any, assessment: any, lang: string}} getState
 * @param {string} apiEndpoint
 */
export function initPresets(getState, apiEndpoint) {
  const chips = $$(".preset-chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const preset = chip.getAttribute("data-preset");

      const cbs = $$('#sim-actions input[type="checkbox"]');
      cbs.forEach((cb) => { cb.checked = false; });

      if (preset === "balanced") {
        setCheck("switch_to_induction", true);
        setCheck("switch_commute_to_metro", true);
      } else if (preset === "zero_cost") {
        setCheck("switch_commute_to_cycle", true);
        setCheck("work_from_home_2_days", true);
      } else if (preset === "max_protection") {
        setCheck("add_air_purifier", true);
        setCheck("switch_to_induction", true);
        setCheck("switch_commute_to_metro", true);
      } else if (preset === "eco_commute") {
        setCheck("switch_commute_to_metro", true);
        setCheck("switch_commute_to_cycle", true);
        setCheck("work_from_home_2_days", true);
      } else if (preset === "reset") {
        // all unchecked
      }

      // Update .active class on all action cards
      $$(".sim-action-item").forEach((item) => {
        const input = item.querySelector('input[type="checkbox"]');
        if (input && input.checked) item.classList.add("active");
        else item.classList.remove("active");
      });

      runSimulation(getState, apiEndpoint);
    });
  });
}

/**
 * Run simulation request and update results card, chart, and metrics.
 * @param {() => {location: any, profile: any, assessment: any, lang: string}} getState
 * @param {string} apiEndpoint
 */
export async function runSimulation(getState, apiEndpoint = "/api/simulate") {
  const state = getState();
  if (!state.location || !state.profile) return;

  const checked = $$('#sim-actions input[type=checkbox]:checked');
  const actions = Array.from(checked).map((cb) => ({
    action_id: cb.name,
    enabled: true,
  }));

  try {
    const outdoorPm25 = Number(state.assessment?.current_pm25 ?? 120.0);
    const res = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outdoor_pm25: outdoorPm25,
        location: state.location,
        profile: { ...state.profile, language: state.lang },
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

    // Comparison Hero Update
    const compBeforeVal = $("#comp-before-val");
    if (compBeforeVal) compBeforeVal.textContent = String(Math.round(beforeDose));
    const compBeforeCigs = $("#comp-before-cigs");
    if (compBeforeCigs) compBeforeCigs.textContent = `≈ ${(beforeDose / 22).toFixed(1)} cigs/day equiv`;

    const compAfterVal = $("#comp-after-val");
    if (compAfterVal) compAfterVal.textContent = String(Math.round(afterDose));
    const compAfterCigs = $("#comp-after-cigs");
    if (compAfterCigs) compAfterCigs.textContent = `≈ ${(afterDose / 22).toFixed(1)} cigs/day equiv`;

    const reductionPct = beforeDose > 0 ? Math.max(0, Math.round(((beforeDose - afterDose) / beforeDose) * 100)) : 0;
    const reductionVal = $("#sim-reduction-pct");
    if (reductionVal) reductionVal.textContent = `${reductionPct}%`;

    const compBarAfter = $("#comp-bar-after");
    if (compBarAfter) {
      const pctWidth = beforeDose > 0 ? Math.max(12, Math.min(100, Math.round((afterDose / beforeDose) * 100))) : 40;
      compBarAfter.style.width = `${pctWidth}%`;
    }

    // 4 Metrics Grid Update
    const bDoseEl = $("#sim-before-dose");
    if (bDoseEl) bDoseEl.textContent = beforeDose.toFixed(1);
    const aDoseEl = $("#sim-after-dose");
    if (aDoseEl) aDoseEl.textContent = afterDose.toFixed(1);
    const co2El = $("#sim-co2-saved");
    if (co2El) co2El.textContent = co2Saved.toFixed(1);
    const kmEl = $("#sim-equiv-km");
    if (kmEl) kmEl.textContent = equivKm.toFixed(0);

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
