// Scroll engine and drawing helpers for the "Inside the models" chapter.
// Each explainer is a sticky stage with step cards scrolling over it. Its progress p runs
// from -0.5 (first card arriving) to n - 0.5 (last card leaving) and equals i when card i
// is centered, so every animation is scrubbed by scroll and plays backwards on the way up.
import { reducedMotion } from "../scroll/story.js";

export const C = {
  ink: "#ecebe8", ink2: "#a9acb4", ink3: "#858a94",
  yes: "#e5383b", no: "#3f7fd1", noLight: "#5b93dc", missed: "#c98500", ember: "#d95926",
};
export const MONO = "500 11px ui-monospace, SFMono-Regular, Consolas, monospace";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; // same as --font-body
export const BODY = (size = 12, weight = 500) => `${weight} ${size}px ${FONT}`;

// --- math -----------------------------------------------------------------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (p, a, b) => clamp((p - a) / (b - a)); // where p sits between a and b, 0..1
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function rng(seed = 1) { // mulberry32: small, fast, reproducible
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- color ----------------------------------------------------------------
function hexRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const rgba = (hex, a) => `rgba(${hexRgb(hex).join(",")},${a})`;
export function mixRgb(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
}
export const mix = (a, b, t, alpha = 1) => { const [r, g, bl] = mixRgb(a, b, t); return `rgba(${r | 0},${g | 0},${bl | 0},${alpha})`; };

// --- explainers -------------------------------------------------------------
const explainers = [];

export function explainer(section, impl) {
  const stage = section.querySelector(".xp-stage");
  const steps = [...section.querySelectorAll(".xp-step")];
  const x = { section, stage, steps, impl, n: steps.length, p: -0.5, target: -0.5, active: -1,
    scrolly: section.querySelector(".xp-scrolly"), visible: false, ready: false, started: false };
  steps.forEach((s, i) => {
    const k = s.querySelector(".k");
    if (k) k.textContent = `${String(i + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
  });
  stage.insertAdjacentHTML("beforeend", '<div class="xp-fade" aria-hidden="true"></div>');
  relayout(x);
  explainers.push(x);
  if (explainers.length === 1) {
    addEventListener("resize", () => explainers.forEach(relayout));
    requestAnimationFrame(tick);
  }
}

// the area of the stage not covered by the step cards (cards sit left on wide screens and on phones
// held sideways, below on narrow ones; must match the phone media query in explainers.css)
function plotRect(stage) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (W >= 900 || (W >= 600 && W >= H * 1.4)) {
    const gutter = clamp(W * 0.04, 16, 56);
    const cardW = Math.min(27 * 16, W * 0.34);
    const x = gutter + cardW + Math.max(40, W * 0.035);
    const right = W >= 1100 ? 160 : gutter; // leave room for the chapter rail and its label
    return { x, y: 70, w: W - right - x, h: H - 70 - 50, mobile: false };
  }
  return { x: 14, y: 54, w: W - 28, h: Math.max(220, H * 0.52 - 54), mobile: true };
}

function relayout(x) {
  const W = x.stage.clientWidth, H = x.stage.clientHeight;
  if (W === x.W && H === x.H) return; // e.g. Safari's toolbar moving: the 100svh stage keeps its size
  x.W = W; x.H = H;
  x.plot = plotRect(x.stage);
  for (const k of ["x", "y", "w", "h"]) x.stage.style.setProperty(`--plot-${k}`, `${x.plot[k]}px`);
  if (x.ready) x.impl.resize?.(x);
}

// an explainer builds itself (canvas, WebGL, data prep) once it comes within 60% of a screen
function checkVisible(x) {
  const r = x.scrolly.getBoundingClientRect(), m = innerHeight * 0.6;
  x.visible = r.bottom > -m && r.top < innerHeight + m;
  if (x.visible && !x.started) {
    x.started = true;
    x.initPromise = Promise.resolve(x.impl.init?.(x))
      .then(() => { x.ready = true; })
      .catch((err) => {
        console.error(err);
        x.stage.insertAdjacentHTML("beforeend", '<p class="xp-error">This animation could not start in your browser.</p>');
      });
  }
}

function measure(x) {
  const mid = innerHeight / 2;
  let sum = 0;
  for (const s of x.steps) {
    const r = s.getBoundingClientRect();
    sum += clamp((mid - r.top) / r.height);
  }
  return sum - 0.5;
}

let last = performance.now();
function step(now) {
  const dt = Math.min(0.05, Math.max(0, now - last) / 1000);
  last = now;
  for (const x of explainers) {
    checkVisible(x);
    if (!x.visible || !x.ready) continue;
    x.target = measure(x);
    x.p = reducedMotion ? x.target : x.p + (x.target - x.p) * (1 - Math.exp(-dt * 7));
    const a = clamp(Math.round(x.target), 0, x.n - 1);
    if (a !== x.active) {
      x.active = a;
      x.steps.forEach((s, i) => s.classList.toggle("active", i === a));
      x.impl.step?.(a, x);
    }
    x.impl.frame(x.p, dt, now / 1000, x);
  }
}
function tick(now) {
  step(now);
  requestAnimationFrame(tick);
}

if (import.meta.env.DEV) {
  // review helpers for a hidden browser tab, where animation frames pause:
  // await __xp("xp-knn", 2.5); await __frames(120)
  window.__xp = async (id, p) => {
    const steps = [...document.querySelectorAll(`#${id} .xp-step`)];
    const i = clamp(Math.floor(p), 0, steps.length - 1);
    const r = steps[i].getBoundingClientRect();
    const y = scrollY + r.top + r.height * (0.5 + p - i) - innerHeight / 2;
    window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y);
  };
  window.__frames = async (n = 90) => {
    step(performance.now());
    await Promise.all(explainers.map((x) => x.initPromise).filter(Boolean));
    let t = performance.now();
    for (let i = 0; i < n; i++) step((t += 1000 / 60));
  };
}

// --- drawing ----------------------------------------------------------------
// a 2D canvas that fills its stage, sharp on hi-dpi screens
export function layer(stage) {
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  stage.prepend(cv);
  const ctx = cv.getContext("2d");
  const L = { cv, ctx, W: 0, H: 0, dpr: 1 };
  L.fit = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = stage.clientWidth, H = stage.clientHeight;
    if (W === L.W && H === L.H && dpr === L.dpr) return;
    Object.assign(L, { W, H, dpr });
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  L.clear = () => ctx.clearRect(0, 0, L.W, L.H);
  L.fit();
  return L;
}

// soft glow sprite, drawn with drawImage (much cheaper than shadowBlur on hundreds of dots)
const sprites = new Map();
export function glow(color) {
  if (sprites.has(color)) return sprites.get(color);
  const s = 64, c = s / 2;
  const cv = Object.assign(document.createElement("canvas"), { width: s, height: s });
  const g = cv.getContext("2d");
  const [r, gr, b] = hexRgb(color);
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.09, `rgba(${r},${gr},${b},1)`);
  grad.addColorStop(0.18, `rgba(${r},${gr},${b},0.55)`);
  grad.addColorStop(0.45, `rgba(${r},${gr},${b},0.12)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  sprites.set(color, cv);
  return cv;
}
export function drawGlow(ctx, color, x, y, r) { ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2); }

// a rounded label drawn on the canvas
export function pill(ctx, x, y, text, { font = BODY(12), pad = 9, h = 24, fill = "rgba(21,24,33,0.95)",
  stroke = "rgba(255,255,255,0.14)", color = C.ink, alpha = 1 } = {}) {
  ctx.font = font;
  const w = ctx.measureText(text).width + pad * 2;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.globalAlpha = 1;
}

// x and y in the same units (circles stay circles), centered in a box
export function equalScale(domainX, domainY, box, pad = 0) {
  const dx = domainX[1] - domainX[0], dy = domainY[1] - domainY[0];
  const s = Math.min((box.w - pad * 2) / dx, (box.h - pad * 2) / dy);
  const ox = box.x + (box.w - dx * s) / 2, oy = box.y + (box.h - dy * s) / 2;
  return { s, x: (v) => ox + (v - domainX[0]) * s, y: (v) => oy + (domainY[1] - v) * s, box: { x: ox, y: oy, w: dx * s, h: dy * s } };
}
