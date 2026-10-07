// Shared code for the three mockups: story markup, smooth scroll, scroll state,
// D3 charts for "the twist", the dev panel, the 3D stage and the heart shape.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import * as d3 from "d3";
import { gsap } from "gsap/index.js";
import { ScrollTrigger } from "gsap/ScrollTrigger.js";
import { SplitText } from "gsap/SplitText.js";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText);

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isMobile = () => innerWidth < 760;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtInt = d3.format(",");

// ---------------------------------------------------------------------------
// Data: real export output when it exists, otherwise the known class counts
// ---------------------------------------------------------------------------
const NAIVE_IDS = ["logreg-22", "rf-22", "knn-22", "adaboost", "mlp-100"];

export async function loadData() {
  const data = { no: 292422, yes: 27373, rows: 319795, real: false, models: [], baseline: 0.9144 };
  try {
    const res = await fetch("../site/public/data/models.json");
    if (res.ok) {
      const { models } = await res.json();
      const byId = Object.fromEntries(models.map((m) => [m.id, m]));
      data.models = NAIVE_IDS.filter((id) => byId[id]).map((id) => ({
        id, label: byId[id].family, acc: byId[id].metrics.acc, rec: byId[id].metrics.rec,
      }));
      data.baseline = byId.dummy.metrics.acc;
      data.real = true;
    }
  } catch { /* fall back below */ }
  if (!data.models.length) {
    // placeholder until analysis/export_results.py has run
    data.models = [
      { id: "logreg-22", label: "Logistic regression", acc: 0.916, rec: 0.10 },
      { id: "rf-22", label: "Random forest", acc: 0.905, rec: 0.12 },
      { id: "knn-22", label: "KNN", acc: 0.907, rec: 0.10 },
      { id: "adaboost", label: "AdaBoost", acc: 0.916, rec: 0.09 },
      { id: "mlp-100", label: "Neural net (MLP)", acc: 0.915, rec: 0.11 },
    ];
  }
  data.first = data.models[0];
  return data;
}

// ---------------------------------------------------------------------------
// Story markup (identical copy in every mockup, so only the heart differs)
// ---------------------------------------------------------------------------
export function renderStory(data, { variant, title }) {
  const caught = Math.round(data.first.rec * 100);
  const others = ["A", "B", "C"].filter((v) => v !== variant);
  const file = { A: "a-particles.html", B: "b-anatomical.html", C: "c-glass.html" };
  document.querySelector("main").innerHTML = `
  <section class="scene hero" id="hero">
    <p class="eyebrow">Machine learning case study</p>
    <h1 class="reveal-now">Can a health survey <em>predict</em> heart disease?</h1>
    <p class="lede reveal-now">${fmtInt(data.rows)} Americans answered a CDC health survey. I trained models to spot who had heart disease, and learned why a 91% accurate model can be almost useless.</p>
    <div class="scroll-cue"><span></span>Scroll</div>
    <svg class="ecg" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 40 H220 l10 -6 l10 6 H300 l8 12 l12 -50 l12 58 l10 -20 H520 l14 -8 l14 8 H760 l8 12 l12 -50 l12 58 l10 -20 H980 l12 -6 l12 6 H1200"/>
    </svg>
  </section>

  <section class="scene topic" id="topic">
    <div class="copy">
      <p class="eyebrow">01 · The question</p>
      <h2 class="reveal">Heart disease is the leading cause of death in the U.S.</h2>
      <span class="todo-cite">Placeholder: add a cited CDC statistic here</span>
      <p class="lede reveal">If a few everyday answers (age, sleep, smoking, how you rate your own health) could flag people at risk, they could be nudged toward screening sooner. So I tried.</p>
      <div class="facts">
        <div class="fact"><b class="num">${fmtInt(data.rows)}</b><small>survey respondents</small></div>
        <div class="fact"><b class="num">17</b><small>health questions</small></div>
        <div class="fact"><b class="num">1</b><small>yes / no answer: heart disease</small></div>
      </div>
    </div>
  </section>

  <section class="scene twist" id="twist">
    <div class="twist-sticky">
      <div class="left">
        <div class="steps">
          <div class="step" data-step="0">
            <p class="eyebrow">02 · First attempt</p>
            <div class="big-number num" data-count="${data.first.acc}">0%</div>
            <h2>My first model was <em>${fmtPct(data.first.acc)}</em> accurate.</h2>
            <p>Logistic regression, random forest, KNN, AdaBoost and a neural net all landed around 91%. Done, right?</p>
          </div>
          <div class="step" data-step="1">
            <p class="eyebrow">03 · Back to the data</p>
            <h2>But <em>${fmtPct(data.no / data.rows)}</em> of people answered No.</h2>
            <p>Only ${fmtInt(data.yes)} of ${fmtInt(data.rows)} respondents (about 1 in 12) reported heart disease.</p>
          </div>
          <div class="step" data-step="2">
            <p class="eyebrow">04 · The catch</p>
            <h2>Always guessing No scores <em>${fmtPct(data.baseline)}</em> too.</h2>
            <p>A model that never flags anyone is as "accurate" as mine. Worse, my first model caught only <b>${caught} of every 100</b> people who actually had heart disease.</p>
          </div>
        </div>
        <div class="progress-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      </div>
      <div class="chart-card" id="twist-card">
        <div class="panel" data-panel="accuracy">
          <h3>Accuracy on ${fmtInt(79949)} held-out people</h3>
          <p class="sub">${data.real ? "From the reproducible re-run" : "Placeholder numbers until the export finishes"}</p>
          <div id="acc-chart"></div>
        </div>
        <div class="panel" data-panel="split" hidden>
          <h3>Who reported heart disease?</h3>
          <p class="sub">All ${fmtInt(data.rows)} survey respondents</p>
          <div id="split-chart"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="scene end" id="end">
    <p class="eyebrow">End of preview</p>
    <h2>Mockup ${variant}: ${title}</h2>
    <p class="lede">Compare all three on the same three scenes. In the panel you can switch accent color and type; in the hero you can drag the heart to rotate it.</p>
    <nav>${others.map((v) => `<a class="btn" href="${file[v]}">Open mockup ${v} →</a>`).join("")}</nav>
  </section>`;
}

// ---------------------------------------------------------------------------
// Dev panel: mockup switcher, accent color, font pairing (remembered per viewer)
// ---------------------------------------------------------------------------
const ACCENTS = { crimson: "#e5383b", ember: "#d95926", rose: "#e0457b" };

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch { return null; }
}

export function accentColor() {
  return new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
}

function buildDevPanel(variant) {
  const root = document.documentElement;
  const accent = store("hd-accent") || "crimson";
  const type = store("hd-type") || "grotesk";
  if (accent !== "crimson") root.dataset.accent = accent;
  if (type === "serif") root.dataset.type = "serif";
  const panel = document.createElement("aside");
  panel.className = "devpanel";
  panel.setAttribute("aria-label", "Mockup controls");
  panel.innerHTML = `
    <div class="row"><span>Mockup</span>
      <a href="a-particles.html" ${variant === "A" ? 'aria-current="page"' : ""}>A · Particles</a>
      <a href="b-anatomical.html" ${variant === "B" ? 'aria-current="page"' : ""}>B · Anatomical</a>
      <a href="c-glass.html" ${variant === "C" ? 'aria-current="page"' : ""}>C · Glass</a></div>
    <div class="row"><span>Accent</span>${Object.entries(ACCENTS).map(([k, v]) =>
      `<button class="dot" data-accent="${k}" style="background:${v}" aria-label="${k}" aria-pressed="${k === accent}"></button>`).join("")}</div>
    <div class="row"><span>Type</span>
      <button data-type="grotesk" aria-pressed="${type === "grotesk"}">Grotesk</button>
      <button data-type="serif" aria-pressed="${type === "serif"}">Serif</button></div>`;
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.accent) {
      b.dataset.accent === "crimson" ? delete root.dataset.accent : (root.dataset.accent = b.dataset.accent);
      store("hd-accent", b.dataset.accent);
      panel.querySelectorAll("[data-accent]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      window.dispatchEvent(new Event("accentchange"));
    }
    if (b.dataset.type) {
      b.dataset.type === "serif" ? (root.dataset.type = "serif") : delete root.dataset.type;
      store("hd-type", b.dataset.type);
      panel.querySelectorAll("[data-type]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      ScrollTrigger.refresh();
    }
  });
  document.body.appendChild(panel);
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
const tip = Object.assign(document.createElement("div"), { className: "tooltip", role: "status" });
document.body.appendChild(tip);
function showTip(e, html) {
  tip.innerHTML = html;
  tip.classList.add("on");
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
const hideTip = () => tip.classList.remove("on");

// ---------------------------------------------------------------------------
// D3: accuracy dot plot (baseline appears in step 2)
// ---------------------------------------------------------------------------
function accuracyChart(el, data) {
  const W = 520, rowH = 34, m = { t: 26, r: 64, b: 30, l: 150 };
  const H = m.t + m.b + rowH * data.models.length;
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img").attr("aria-label", "Accuracy of the first five models compared with always guessing No");
  const accs = data.models.map((d) => d.acc).concat(data.baseline);
  const x = d3.scaleLinear().domain([Math.min(...accs) - 0.01, Math.max(...accs) + 0.008]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(data.models.map((d) => d.id)).range([m.t, H - m.b]).padding(0.4);
  svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(5)).join("line")
    .attr("x1", x).attr("x2", x).attr("y1", m.t - 6).attr("y2", H - m.b);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b + 16})`)
    .selectAll("text").data(x.ticks(5)).join("text").attr("x", x).attr("text-anchor", "middle")
    .text((d) => `${(d * 100).toFixed(0)}%`);
  svg.append("g").selectAll("text").data(data.models).join("text").attr("class", "label")
    .attr("x", m.l - 14).attr("y", (d) => y(d.id) + y.bandwidth() / 2).attr("dy", "0.35em")
    .attr("text-anchor", "end").text((d) => d.label);

  const base = svg.append("g").attr("class", "baseline").style("opacity", 0);
  const bx = x(data.baseline);
  base.append("line").attr("x1", bx).attr("x2", bx).attr("y1", m.t - 14).attr("y2", H - m.b)
    .attr("stroke", "var(--no)").attr("stroke-width", 2).attr("stroke-dasharray", "4 4");
  base.append("text").attr("class", "label").attr("x", bx + 6).attr("y", m.t - 8)
    .text(`Always say No · ${fmtPct(data.baseline)}`);

  const dots = svg.append("g").selectAll("g").data(data.models).join("g")
    .attr("transform", (d) => `translate(${x.range()[0]},${y(d.id) + y.bandwidth() / 2})`);
  dots.append("circle").attr("r", 7).attr("fill", "var(--accent)").attr("stroke", "var(--surface)").attr("stroke-width", 2);
  dots.append("text").attr("class", "label").attr("x", 14).attr("dy", "0.35em").text((d) => fmtPct(d.acc));
  dots.append("rect").attr("x", -16).attr("y", -16).attr("width", 80).attr("height", 32).attr("fill", "transparent")
    .on("pointermove", (e, d) => showTip(e, `<b>${d.label}</b><br>Accuracy ${fmtPct(d.acc)}<br>Caught ${Math.round(d.rec * 100)} of 100 sick people`))
    .on("pointerleave", hideTip);

  return {
    step(n) {
      dots.transition().duration(reducedMotion ? 0 : 900).delay((d, i) => (reducedMotion ? 0 : i * 70))
        .ease(d3.easeCubicOut).attr("transform", (d) => `translate(${x(d.acc)},${y(d.id) + y.bandwidth() / 2})`);
      base.transition().duration(reducedMotion ? 0 : 600).style("opacity", n >= 2 ? 1 : 0);
    },
  };
}

// ---------------------------------------------------------------------------
// D3: class split as a waffle (1 square ≈ 320 people) or a single stacked bar
// ---------------------------------------------------------------------------
function splitChart(el, data, kind) {
  const total = data.no + data.yes;
  const pNo = data.no / total;
  const labels = (svg, yPos, W) => {
    const g = svg.append("g").attr("transform", `translate(0,${yPos})`);
    [[`No · ${fmtInt(data.no)} · ${fmtPct(pNo)}`, "var(--no)", 0],
     [`Yes · ${fmtInt(data.yes)} · ${fmtPct(1 - pNo)}`, "var(--accent)", W * 0.55]].forEach(([t, c, xPos]) => {
      g.append("rect").attr("x", xPos).attr("y", -9).attr("width", 10).attr("height", 10).attr("rx", 3).attr("fill", c);
      g.append("text").attr("class", "label").attr("x", xPos + 16).attr("y", 0).text(t);
    });
  };
  if (kind === "bar") {
    const W = 520, H = 70;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", `${fmtPct(pNo)} answered No, ${fmtPct(1 - pNo)} answered Yes`);
    const x = d3.scaleLinear().domain([0, 1]).range([0, W]);
    const segs = [{ k: "No", v: pNo, x0: 0, c: "var(--no)" }, { k: "Yes", v: 1 - pNo, x0: pNo, c: "var(--accent)" }];
    const bars = svg.selectAll("rect.seg").data(segs).join("rect").attr("class", "seg")
      .attr("y", 0).attr("height", 30).attr("rx", 4).attr("fill", (d) => d.c)
      .attr("x", (d) => x(d.x0) + (d.k === "Yes" ? 2 : 0)).attr("width", 0)
      .on("pointermove", (e, d) => showTip(e, `<b>${d.k}</b> · ${fmtPct(d.v)}`)).on("pointerleave", hideTip);
    labels(svg, 58, W);
    return { step(n) {
      bars.transition().duration(reducedMotion ? 0 : 900).ease(d3.easeCubicOut)
        .attr("width", (d) => (n >= 1 ? Math.max(0, x(d.v) - 2) : 0));
    } };
  }
  const cols = 50, rows = 20, cells = cols * rows, s = 10, gap = 2;
  const nNo = Math.round(pNo * cells);
  const W = cols * (s + gap), H = rows * (s + gap) + 34;
  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
    .attr("aria-label", `Waffle chart: ${nNo} of ${cells} squares answered No`);
  const sq = svg.append("g").selectAll("rect").data(d3.range(cells)).join("rect")
    .attr("x", (i) => Math.floor(i / rows) * (s + gap)).attr("y", (i) => (i % rows) * (s + gap))
    .attr("width", s).attr("height", s).attr("rx", 2).attr("fill", "var(--surface-2)")
    .on("pointermove", (e, i) => showTip(e, `${i < nNo ? "No" : "Yes"} · each square ≈ ${fmtInt(Math.round(total / cells))} people`))
    .on("pointerleave", hideTip);
  labels(svg, H - 6, W);
  return { step(n) {
    sq.transition().duration(reducedMotion ? 0 : 500).delay((i) => (reducedMotion || n < 1 ? 0 : Math.floor(i / rows) * 14))
      .attr("fill", (i) => (n < 1 ? "var(--surface-2)" : i < nNo ? "var(--no)" : "var(--accent)"));
  } };
}

// ---------------------------------------------------------------------------
// Story wiring: smooth scroll, text reveals, scroll state for the 3D heart
// ---------------------------------------------------------------------------
export async function initStory({ variant, title, splitKind = "waffle", hideSplitCard = false, cardInLeft = false }) {
  const data = await loadData();
  renderStory(data, { variant, title });
  buildDevPanel(variant);

  const state = { t1: 0, t2: 0, t3: 0, step: -1, drag: 0, mx: 0, my: 0, data };
  const target = { t1: 0, t2: 0, t3: 0 };

  if (!reducedMotion) {
    const lenis = new Lenis({ autoRaf: false, lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  await document.fonts.ready;
  if (!reducedMotion) {
    document.querySelectorAll(".reveal-now").forEach((el, i) => {
      SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: (self) =>
        gsap.from(self.lines, { yPercent: 110, opacity: 0, duration: 1.3, ease: "expo.out", stagger: 0.09, delay: 0.3 + i * 0.25 }) });
    });
    document.querySelectorAll(".reveal").forEach((el) => {
      SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true, onSplit: (self) =>
        gsap.from(self.lines, { yPercent: 110, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08,
          scrollTrigger: { trigger: el, start: "top 80%", toggleActions: "play none none reverse" } }) });
    });
    gsap.from(".fact", { opacity: 0, y: 24, stagger: 0.12, duration: 0.9, ease: "expo.out",
      scrollTrigger: { trigger: ".facts", start: "top 85%", toggleActions: "play none none reverse" } });
  }

  // charts
  const acc = accuracyChart(document.getElementById("acc-chart"), data);
  const split = splitChart(document.getElementById("split-chart"), data, splitKind);
  const card = document.getElementById("twist-card");
  if (cardInLeft) {
    document.querySelector(".twist .left").appendChild(card);
    card.classList.add("compact");
    document.querySelector(".twist-sticky").classList.add("text-only");
  }
  const panels = card.querySelectorAll(".panel");
  const steps = document.querySelectorAll(".step");
  const pips = document.querySelectorAll(".progress-dots i");
  const counter = document.querySelector("[data-count]");
  const listeners = [];

  function setStep(n) {
    if (n === state.step) return;
    state.step = n;
    steps.forEach((s) => s.classList.toggle("on", +s.dataset.step === n));
    pips.forEach((p, i) => p.classList.toggle("on", i <= n));
    const panel = n === 1 ? "split" : "accuracy";
    panels.forEach((p) => (p.hidden = p.dataset.panel !== panel));
    card.style.visibility = n === 1 && hideSplitCard ? "hidden" : "visible";
    acc.step(n);
    split.step(n);
    if (n === 0 && counter) {
      const to = +counter.dataset.count;
      d3.select(counter).transition().duration(reducedMotion ? 0 : 1400).ease(d3.easeCubicOut)
        .tween("text", () => (t) => (counter.innerHTML = `${(to * 100 * t).toFixed(1)}<small>%</small>`));
    }
    listeners.forEach((fn) => fn(n));
  }

  function measure() {
    const vh = innerHeight;
    const topic = document.getElementById("topic").getBoundingClientRect();
    const twist = document.getElementById("twist").getBoundingClientRect();
    target.t1 = clamp01((vh - topic.top) / vh);
    target.t2 = clamp01((vh - twist.top) / vh);
    target.t3 = clamp01(-twist.top / (twist.height - vh));
    if (target.t2 < 0.55) setStep(-1);
    else setStep(target.t3 < 0.3 ? 0 : target.t3 < 0.64 ? 1 : 2);
  }

  // hero interaction: drag to rotate (desktop) + gentle parallax
  let dragging = false, lastX = 0;
  addEventListener("pointerdown", (e) => {
    if (state.t1 > 0.5 || e.pointerType !== "mouse" || e.target.closest(".devpanel")) return;
    dragging = true; lastX = e.clientX;
  });
  addEventListener("pointerup", () => (dragging = false));
  addEventListener("pointermove", (e) => {
    state.mx = (e.clientX / innerWidth) * 2 - 1;
    state.my = (e.clientY / innerHeight) * 2 - 1;
    if (dragging) { state.drag += (e.clientX - lastX) * 0.008; lastX = e.clientX; }
  });

  return {
    state,
    data,
    onStep: (fn) => listeners.push(fn),
    // call once per frame: eases scroll progress for smooth 3D motion
    update(dt) {
      measure();
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      for (const key of ["t1", "t2", "t3"]) state[key] += (target[key] - state[key]) * k;
    },
  };
}

// ---------------------------------------------------------------------------
// 3D stage: renderer, camera, bloom
// ---------------------------------------------------------------------------
export function createStage({ bloom = { strength: 0.9, radius: 0.6, threshold: 0.1 } } = {}) {
  const canvas = document.getElementById("gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x07080b, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  function resize() {
    const dpr = Math.min(devicePixelRatio, isMobile() ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setPixelRatio(dpr);
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const clock = new THREE.Clock();
  return {
    renderer, scene, camera, composer, bloomPass,
    loop(fn) {
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05);
        fn(dt, clock.elapsedTime);
        composer.render();
      });
    },
  };
}

// lub-dub: two quick pulses, then rest (~68 bpm)
export function beat(t, period = 0.88) {
  const p = (t % period) / period;
  return Math.exp(-(((p - 0.06) / 0.04) ** 2)) + 0.55 * Math.exp(-(((p - 0.25) / 0.05) ** 2));
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
export const range = (t, a, b) => clamp01((t - a) / (b - a));

// ---------------------------------------------------------------------------
// Heart shape: Taubin's implicit heart surface, sampled along rays from the center.
//   (x² + 9/4·y² + z² − 1)³ − x²·z³ − 9/80·y²·z³ = 0   (z up; mapped to three.js y up)
// ---------------------------------------------------------------------------
function heartF(X, Y, Z) {
  const x = X, y = Z, z = Y;
  const a = x * x + 2.25 * y * y + z * z - 1;
  return a * a * a - x * x * z * z * z - 0.1125 * y * y * z * z * z;
}

export function radiusAlong(dx, dy, dz) {
  let r = 0;
  while (r < 2 && heartF(dx * r, dy * r, dz * r) <= 0) r += 0.02;
  let lo = Math.max(0, r - 0.02), hi = r;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    heartF(dx * mid, dy * mid, dz * mid) <= 0 ? (lo = mid) : (hi = mid);
  }
  return lo;
}

export const HEART_Y_OFFSET = -0.08; // re-centers the shape vertically

export function makeHeartGeometry(detail = 5) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  ico.deleteAttribute("normal");
  ico.deleteAttribute("uv");
  const geo = mergeVertices(ico); // shared vertices, so normals come out smooth
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = radiusAlong(v.x, v.y, v.z);
    pos.setXYZ(i, v.x * r, v.y * r + HEART_Y_OFFSET, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

export function sampleHeartPoints(n, seed = 7) {
  const rand = d3.randomLcg(seed);
  const gauss = d3.randomNormal.source(rand)(0, 1);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = gauss(), y = gauss(), z = gauss();
    const len = Math.hypot(x, y, z);
    x /= len; y /= len; z /= len;
    const r = radiusAlong(x, y, z);
    const shell = rand() < 0.78;
    const k = shell ? 0.93 + 0.07 * rand() : Math.cbrt(rand()) * 0.9;
    out[i * 3] = x * r * k;
    out[i * 3 + 1] = y * r * k + HEART_Y_OFFSET;
    out[i * 3 + 2] = z * r * k;
  }
  return out;
}

// Height (0 = tip, 1 = top) below which `fraction` of the heart's VOLUME sits, so the
// accent-colored tip is honestly 8.6% of the heart rather than 8.6% of its height.
export function volumeCut(fraction, minY, maxY) {
  const rand = d3.randomLcg(11);
  const ys = [];
  while (ys.length < 30000) {
    const x = rand() * 2.6 - 1.3, y = rand() * 2.6 - 1.3, z = rand() * 2.6 - 1.3;
    if (heartF(x, y, z) <= 0) ys.push(y + HEART_Y_OFFSET);
  }
  ys.sort((a, b) => a - b);
  return (ys[Math.floor(fraction * ys.length)] - minY) / (maxY - minY);
}

// Mesh hearts (B, C): recolor the top of the heart to "No" so only the bottom 8.6% stays accent.
export function addSplitShader(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vH;\nuniform float uMinY;\nuniform float uMaxY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvH = (position.y - uMinY) / (uMaxY - uMinY);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vH;\nuniform float uSplit;\nuniform float uCut;\nuniform vec3 uNoColor;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );",
        "float isNo = uSplit * smoothstep(uCut - 0.006, uCut + 0.006, vH);\nvec4 diffuseColor = vec4( mix(diffuse, uNoColor, isNo), opacity );");
  };
}

// Shared choreography for the mesh hearts (B, C): where the heart sits in each scene.
export function driveMeshHeart(group, state, t, split) {
  const m = isMobile();
  const a = ease(state.t1), b = ease(state.t2);
  const P = m
    ? { hero: [0, 0.45, 0.72], topic: [0, 1.45, 0.5], twist: [0, 1.95, 0.32] }
    : { hero: [1.45, 0.05, 0.85], topic: [1.95, 0, 0.78], twist: [-3.05, -1.45, 0.4] };
  const pick = (i) => lerp(lerp(P.hero[i], P.topic[i], a), P.twist[i], b);
  const pulse = 1 + beat(t) * 0.05;
  group.position.set(pick(0), pick(1), 0);
  group.scale.setScalar(pick(2) * pulse);
  group.rotation.y = t * 0.3 * (1 - a * 0.6) + state.drag + state.mx * 0.15 * (1 - a);
  group.rotation.x = state.my * 0.08 * (1 - a);
  if (split) split.uSplit.value = range(state.t3, 0.36, 0.5);
}
