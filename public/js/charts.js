/**
 * SaansSafe — Canvas Graphics & Data Visualizers (ES Module)
 * High-performance HTML5 Canvas gauge, comparative impact bar charts, and ambient particle simulation.
 */

import { $ } from "./dom.js";

let currentGaugeVal = 0;
let gaugeAnimFrame = null;

/**
 * Animate the AQI speedometer arc needle with cubic ease-out.
 * @param {number} targetAqi Target AQI value (0 - 500)
 * @param {number} [duration=850] Animation duration in milliseconds
 */
export function animateGauge(targetAqi, duration = 850) {
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

function _drawGaugeTrack(ctx, cx, cy, r, isDark) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 16;
  ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  ctx.stroke();
}

function _drawGaugeBands(ctx, cx, cy, r) {
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
}

function _drawGaugeNeedle(ctx, cx, cy, r, aqi, needleColor, isDark) {
  const fraction = Math.min(Math.max(aqi, 0), 500) / 500;
  const needleAngle = Math.PI + fraction * Math.PI;
  ctx.save();
  ctx.shadowColor = isDark ? "rgba(52, 211, 153, 0.8)" : "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + (r - 18) * Math.cos(needleAngle), cy + (r - 18) * Math.sin(needleAngle));
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = needleColor;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctx.fillStyle = needleColor;
  ctx.fill();
}

/**
 * Draw the semicircular multi-tier AQI gauge on #aqi-gauge canvas.
 * @param {number} aqi Current AQI numeric value
 */
export function drawGauge(aqi) {
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

  _drawGaugeTrack(ctx, cx, cy, r, isDark);
  _drawGaugeBands(ctx, cx, cy, r);
  _drawGaugeNeedle(ctx, cx, cy, r, aqi, needleColor, isDark);
}

function _drawSingleSimBar(ctx, x, val, maxVal, maxH, h, color, label, textColor, subtextColor) {
  const barW = 100;
  const bh = (val / maxVal) * maxH;
  const y = h - 30 - bh;

  const grad = ctx.createLinearGradient(0, y, 0, y + bh);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + "aa");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, barW, bh, [6, 6, 0, 0]);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(val.toFixed(1), x + barW / 2, y - 8);
  ctx.fillStyle = subtextColor;
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.fillText(label, x + barW / 2, h - 10);
}

/**
 * Draw Before vs After daily inhaled PM2.5 dose comparison bar chart on #sim-chart canvas.
 * @param {number} before Baseline daily dose (µg/day)
 * @param {number} after Post-intervention daily dose (µg/day)
 */
export function drawSimChart(before, after) {
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

  _drawSingleSimBar(ctx, startX, before, maxVal, maxH, h, "#ef4444", "Before", textColor, subtextColor);
  _drawSingleSimBar(ctx, startX + barW + gap, after, maxVal, maxH, h, "#10b981", "After", textColor, subtextColor);

  ctx.save();
  ctx.translate(20, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = subtextColor;
  ctx.fillText("PM2.5 µg/day", 0, 0);
  ctx.restore();
}

function _createAmbientParticles(count, w, h) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 2.2 + 1,
    dx: (Math.random() - 0.5) * 0.4,
    dy: -Math.random() * 0.35 - 0.1,
    alpha: Math.random() * 0.6 + 0.25,
    hue: Math.random() > 0.45 ? 160 : 195,
  }));
}

function _renderParticleConnections(ctx, particles, i, p) {
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

function _updateSingleParticle(p, mouse, w, h) {
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
}

/**
 * Render a single frame of the ambient particle canvas.
 */
function _renderParticleFrame(ctx, particles, mouse, w, h) {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    _updateSingleParticle(p, mouse, w, h);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 85%, 60%, ${p.alpha})`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = `hsla(${p.hue}, 85%, 60%, 0.5)`;
    ctx.fill();
    _renderParticleConnections(ctx, particles, i, p);
  }
}

/**
 * Initialize ambient interactive floating particle canvas in hero background.
 */
export function initAmbientCanvas() {
  const canvas = $("#ambient-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const parent = canvas.parentElement;
  let w = (canvas.width = parent?.offsetWidth || canvas.offsetWidth || 900);
  let h = (canvas.height = parent?.offsetHeight || canvas.offsetHeight || 320);

  const particles = _createAmbientParticles(45, w, h);
  const mouse = { x: -1000, y: -1000 };

  parent?.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  parent?.addEventListener("mouseleave", () => {
    mouse.x = -1000; mouse.y = -1000;
  });

  function animate() {
    _renderParticleFrame(ctx, particles, mouse, w, h);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  window.addEventListener("resize", () => {
    w = canvas.width = parent?.offsetWidth || canvas.offsetWidth || 900;
    h = canvas.height = parent?.offsetHeight || canvas.offsetHeight || 320;
  });
}
