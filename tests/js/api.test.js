/**
 * SaansSafe — Serverless API & Catalog Unit Tests
 * Uses native Node.js test runner (`node --test`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIMELINE_TASKS,
  DEFAULT_INDOOR_HACKS,
  SUSTAINABLE_ALTERNATIVES,
} from "../../api/_lib/catalog.js";
import { getLocalFallbackNarrative } from "../../api/_lib/gemini.js";

describe("Catalog Data Contracts", () => {
  it("should define exactly 6 rich sustainable alternatives", () => {
    assert.strictEqual(SUSTAINABLE_ALTERNATIVES.length, 6);
  });

  it("should have valid fields on every alternative", () => {
    SUSTAINABLE_ALTERNATIVES.forEach((alt) => {
      assert.ok(alt.id, "Alternative must have an id");
      assert.ok(alt.title, "Alternative must have a title");
      assert.ok(alt.description, "Alternative must have a description");
      assert.ok(alt.icon, "Alternative must have an icon");
      assert.ok(typeof alt.exposure_change_pct === "number", "Exposure cut must be numeric");
      assert.ok(alt.exposure_change_pct < 0, "Exposure cut must be negative reduction");
      assert.ok(alt.sim_action_id, "Alternative must link to a simulator action");
    });
  });

  it("should define standard indoor hacks with positive PM2.5 reductions", () => {
    assert.ok(DEFAULT_INDOOR_HACKS.length >= 4);
    DEFAULT_INDOOR_HACKS.forEach((hack) => {
      assert.ok(hack.id);
      assert.ok(hack.title);
      assert.ok(hack.pm25_reduction_pct > 0);
    });
  });

  it("should include morning inversion lockdown in timeline tasks", () => {
    assert.ok(DEFAULT_TIMELINE_TASKS.length >= 5);
    const morningLockdown = DEFAULT_TIMELINE_TASKS.find((t) => t.task.includes("Inversion"));
    assert.ok(morningLockdown, "Must have an atmospheric inversion task");
    assert.strictEqual(morningLockdown.priority, 1);
  });
});

describe("Local Fallback Narrative Synthesis", () => {
  it("should generate English narrative with all required schema keys", () => {
    const res = getLocalFallbackNarrative("Delhi", 220, "High", true, "en");
    assert.ok(res.headline.includes("Delhi"));
    assert.ok(res.summary.length > 20);
    assert.strictEqual(res.family_tips.length, 3);
    assert.strictEqual(res.kid_and_elder_notes.length, 2);
    assert.ok(res.motivational_nudge.length > 10);
  });

  it("should generate Hindi narrative when requested", () => {
    const res = getLocalFallbackNarrative("Lucknow", 280, "Severe", false, "hi");
    assert.ok(res.headline.includes("वायु"));
    assert.ok(res.family_tips[0].includes("खिड़कियां"));
  });

  it("should generate Tamil narrative when requested", () => {
    const res = getLocalFallbackNarrative("Chennai", 95, "Moderate", false, "ta");
    assert.ok(res.headline.includes("காற்று"));
    assert.ok(res.family_tips[0].length > 10);
  });
});
