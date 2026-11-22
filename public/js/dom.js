/**
 * SaansSafe — DOM Utilities & Helpers (ES Module)
 * Pure, reusable DOM manipulation and animation helpers.
 * Adheres to CSP: zero inline script execution, strict textContent escaping for XSS protection.
 */

/**
 * Query a single DOM element.
 * @param {string} sel CSS selector
 * @param {Element|Document} [parent=document] Parent context
 * @returns {HTMLElement|null}
 */
export const $ = (sel, parent = document) => parent.querySelector(sel);

/**
 * Query multiple DOM elements.
 * @param {string} sel CSS selector
 * @param {Element|Document} [parent=document] Parent context
 * @returns {NodeListOf<HTMLElement>}
 */
export const $$ = (sel, parent = document) => parent.querySelectorAll(sel);

/**
 * Debounce a function call by given milliseconds.
 * @template T
 * @param {(...args: any[]) => any} fn Function to debounce
 * @param {number} ms Millisecond delay
 * @returns {(...args: any[]) => void}
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Create a DOM element safely with text content and attributes (XSS-safe; never innerHTML).
 * @param {string} tag HTML tag name
 * @param {string|number|null} [text] Inner text content
 * @param {Record<string, any>} [attrs={}] HTML attributes and data-* flags
 * @returns {HTMLElement}
 */
export function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) {
    e.textContent = String(text);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") {
      e.className = v;
    } else if (k.startsWith("aria-") || k === "role" || k === "tabindex" || k.startsWith("data-")) {
      e.setAttribute(k, v);
    } else {
      e[k] = v;
    }
  }
  return e;
}

/**
 * Reveal an element by removing hidden attribute.
 * @param {HTMLElement|null} targetElement
 */
export function show(targetElement) {
  if (targetElement) targetElement.hidden = false;
}

/**
 * Hide an element by setting hidden attribute.
 * @param {HTMLElement|null} targetElement
 */
export function hide(targetElement) {
  if (targetElement) targetElement.hidden = true;
}

/**
 * Smoothly animate a numeric value on a DOM element.
 * @param {HTMLElement|null} targetEl Target element whose textContent will update
 * @param {number} start Starting numeric value
 * @param {number} end Ending numeric value
 * @param {number} [duration=800] Animation duration in milliseconds
 */
export function animateValue(targetEl, start, end, duration = 800) {
  if (!targetEl) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + eased * (end - start));
    targetEl.textContent = String(current);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      targetEl.textContent = String(Math.round(end));
    }
  };
  window.requestAnimationFrame(step);
}
