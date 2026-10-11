// Scroll engine: smooth scrolling, text reveals, and the "stops" that drive the heart.
// Each [data-stop] element is a stop. As its top reaches the trigger line, the heart
// finishes blending from the previous stop's state into this one's.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { STATES, NUMERIC } from "../three/states.js";

gsap.registerPlugin(ScrollTrigger, SplitText);
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const TRIGGER = 0.62;   // stop becomes current when its top passes 62% of the viewport height
const BLEND = 0.55;     // blending happens over the last 55% of a viewport before that

const smooth = (t) => t * t * (3 - 2 * t);

export function initStory() {
  let lenis = null;
  if (!reducedMotion) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if (import.meta.env.DEV) window.__lenis = lenis; // lets review helpers jump without a smooth scroll
  }

  const stops = [...document.querySelectorAll("[data-stop]")].map((el) => {
    const state = STATES[el.dataset.stop];
    if (!state) console.warn("no 3D state for stop", el.dataset.stop);
    return { el, name: el.dataset.stop, state, top: 0 };
  });
  const measure = () => stops.forEach((s) => (s.top = s.el.getBoundingClientRect().top + scrollY));
  measure();
  addEventListener("resize", measure);
  ScrollTrigger.addEventListener("refresh", measure);
  // fonts and late layout shift stop positions
  document.fonts?.ready.then(measure);
  addEventListener("load", measure);

  const listeners = [];
  let current = -1;
  const blended = { from: 0, to: 0, mix: 0, quad: [1, 1, 1, 1] };

  function update() {
    const vh = innerHeight;
    const y = scrollY + vh * TRIGGER;
    let i = 0;
    while (i + 1 < stops.length && stops[i + 1].top <= y) i++;
    const a = stops[i].state, next = stops[i + 1];
    let t = 0;
    if (next) t = smooth(Math.min(1, Math.max(0, (y - (next.top - vh * BLEND)) / (vh * BLEND))));
    const b = next ? next.state : a;
    blended.from = a.f;
    blended.to = b.f;
    blended.mix = a.f === b.f ? 0 : t;
    if (a.f === b.f) blended.to = a.f;
    for (const k of NUMERIC) blended[k] = a[k] + (b[k] - a[k]) * t;
    blended.quad = a.quad.map((q, j) => q + (b.quad[j] - q) * t);

    const active = t > 0.5 && next ? i + 1 : i;
    if (active !== current) {
      if (current >= 0) stops[current].el.classList.remove("active");
      current = active;
      stops[current].el.classList.add("active");
      listeners.forEach((fn) => fn(stops[current].name, stops[current].el));
    }
    return blended;
  }

  return {
    update,
    onStop: (fn) => listeners.push(fn),
    refresh: measure,
    scrollTo: (el) => (lenis ? lenis.scrollTo(el, { duration: 1.6 }) : el.scrollIntoView()),
  };
}

export async function initReveals() {
  if (reducedMotion) return;
  await document.fonts?.ready;
  document.querySelectorAll(".reveal-now").forEach((el, i) => {
    SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: (self) =>
      gsap.from(self.lines, { yPercent: 110, opacity: 0, duration: 1.3, ease: "expo.out", stagger: 0.09, delay: 0.3 + i * 0.25 }) });
  });
  document.querySelectorAll(".reveal").forEach((el) => {
    SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: (self) =>
      gsap.from(self.lines, { yPercent: 110, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08,
        scrollTrigger: { trigger: el, start: "top 82%", toggleActions: "play none none reverse" } }) });
  });
  gsap.utils.toArray(".fact").forEach((el, i) => gsap.from(el, {
    opacity: 0, y: 24, duration: 0.9, delay: i * 0.12, ease: "expo.out",
    scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
  }));
}

// Drag to rotate the heart in the hero (mouse only, so touch scrolling is untouched).
export function initDrag() {
  const drag = { value: 0, mx: 0, my: 0 };
  let down = false, lastX = 0;
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || scrollY > innerHeight * 0.5 || e.target.closest("a, button, input")) return;
    down = true; lastX = e.clientX;
  });
  addEventListener("pointerup", () => (down = false));
  addEventListener("pointermove", (e) => {
    drag.mx = (e.clientX / innerWidth) * 2 - 1;
    drag.my = (e.clientY / innerHeight) * 2 - 1;
    if (down) { drag.value += (e.clientX - lastX) * 0.008; lastX = e.clientX; }
  });
  return drag;
}
