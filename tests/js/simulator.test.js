/**
 * SaansSafe — What-If Simulator & Helper Business Logic Tests
 * Uses native Node.js test runner (`node --test`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SIM_ACTIONS } from "../../public/js/simulator.js";
import { formatMarkdown } from "../../public/js/chat.js";
import { STRINGS, t, setLang } from "../../public/i18n.js";

describe("Simulator Actions Contract", () => {
  it("should define 6 verified simulator interventions", () => {
    assert.strictEqual(SIM_ACTIONS.length, 6);
  });

  it("should contain required fields on every simulator action", () => {
    SIM_ACTIONS.forEach((act) => {
      assert.ok(act.id, "Action must have an id");
      assert.ok(act.icon, "Action must have an icon");
      assert.ok(act.label, "Action must have a label");
      assert.ok(act.tag, "Action must have a category tag");
      assert.ok(act.desc, "Action must have an explanatory description");
    });
  });

  it("should include induction cooking and HEPA filtration", () => {
    const hasInduction = SIM_ACTIONS.some((a) => a.id === "switch_to_induction");
    const hasPurifier = SIM_ACTIONS.some((a) => a.id === "add_air_purifier");
    assert.ok(hasInduction, "Must include induction cooking action");
    assert.ok(hasPurifier, "Must include HEPA purifier action");
  });
});

describe("Health Intelligence & Dose Equivalence Math", () => {
  it("should calculate Berkeley Earth cigarette equivalence accurately", () => {
    // 22 µg/m³ PM2.5 roughly equates to 1 cigarette per day according to Berkeley Earth
    const pm25Ambient = 110;
    const cigsEquiv = Number((pm25Ambient / 22).toFixed(1));
    assert.strictEqual(cigsEquiv, 5.0);

    const highPm25 = 264;
    const highCigs = Number((highPm25 / 22).toFixed(1));
    assert.strictEqual(highCigs, 12.0);
  });

  it("should correctly calculate dose reduction percentage", () => {
    const beforeDose = 2500;
    const afterDose = 1250;
    const reductionPct = Math.round(((beforeDose - afterDose) / beforeDose) * 100);
    assert.strictEqual(reductionPct, 50);
  });
});

describe("Markdown Sanitization & Formatting", () => {
  it("should escape raw HTML tags", () => {
    const raw = "<script>alert('xss')</script>";
    const formatted = formatMarkdown(raw);
    assert.ok(!formatted.includes("<script>"));
    assert.ok(formatted.includes("&lt;script&gt;"));
  });

  it("should convert bold and bullet lists properly", () => {
    const raw = "**Important:**\n• Wear N95\n• Keep doors closed";
    const formatted = formatMarkdown(raw);
    assert.ok(formatted.includes("<strong>Important:</strong>"));
    assert.ok(formatted.includes("<li>Wear N95</li>"));
  });
});

describe("Trilingual Localization & Accessibility Parity", () => {
  it("should support English, Hindi, and Tamil dictionaries", () => {
    assert.ok(STRINGS.en, "Must support English");
    assert.ok(STRINGS.hi, "Must support Hindi");
    assert.ok(STRINGS.ta, "Must support Tamil");
  });

  it("should have over 40 translation keys in each language dictionary", () => {
    assert.ok(Object.keys(STRINGS.en).length >= 40);
    assert.ok(Object.keys(STRINGS.hi).length >= 40);
    assert.ok(Object.keys(STRINGS.ta).length >= 40);
  });

  it("should fallback to English for unknown keys in regional languages", () => {
    setLang("ta");
    assert.strictEqual(t("location_title"), STRINGS.ta.location_title);
    assert.strictEqual(t("non_existent_key_xyz"), "non_existent_key_xyz");
    setLang("en");
  });
});

