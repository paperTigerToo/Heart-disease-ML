// The particle heart: one dot per ~10 respondents (per ~40 on phones), morphing between
// formations on the GPU as the story scrolls.
import * as THREE from "three";
import { buildFormations, F } from "./formations.js";
import { isMobile } from "./stage.js";
import { reducedMotion } from "../scroll/story.js";

// per formation: dense heart glows, grids stay readable
const ALPHA = [0.26, 0.42, 0.48, 0.34, 0.5, 0.5, 0.48];
const SIZE = [1.0, 0.9, 0.9, 0.75, 0.9, 0.9, 0.9];
const FLIGHT = reducedMotion ? 0.001 : 0.9; // seconds for one person to cross the confusion matrix

export function lubDub(t, period = 0.88) {
  const p = (t % period) / period;
  return Math.exp(-(((p - 0.06) / 0.04) ** 2)) + 0.55 * Math.exp(-(((p - 0.25) / 0.05) ** 2));
}

const ease = (x) => x * x * (3 - 2 * x); // GLSL smoothstep(0, 1, x)
const rates = (cm) => ({ rec: cm.tp / (cm.tp + cm.fn), fpr: cm.fp / (cm.fp + cm.tn), cm });

export function createHeart(stage, ctx) {
  const mobile = isMobile();
  const per = mobile ? 40 : 10;
  const naive = ctx.m["logreg-22"], best = rates(ctx.m["logreg-smoteenn"].cm);
  const keep = ctx.r.methods.find((m) => m.id === "undersampling").counts.No / ctx.r.methods[0].counts.No;
  const built = buildFormations({
    nNo: Math.round(ctx.d.classes.No / per), nYes: Math.round(ctx.d.classes.Yes / per),
    recNaive: naive.metrics.rec, recBest: best.rec, fprBest: best.fpr, keep, mobile,
  });
  const { N, nNo, nYes, meta, confusion: cf } = built;

  // who the model flags (1) or clears (0), per dot: [from, to, start time]. The shader eases each
  // person between the two, so moving the cut-off sends just the people it affects across.
  const flags = new Float32Array(N * 3).fill(1);
  const cut = { tp: Math.round(nYes * best.rec), fp: Math.round(nNo * best.fpr) };
  for (let j = cut.tp; j < nYes; j++) flags[(nNo + j) * 3] = flags[(nNo + j) * 3 + 1] = 0;
  for (let j = cut.fp; j < nNo; j++) flags[j * 3] = flags[j * 3 + 1] = 0;
  for (let i = 0; i < N; i++) flags[i * 3 + 2] = -1e3;

  const geo = new THREE.BufferGeometry();
  const f = built.formations;
  geo.setAttribute("position", new THREE.BufferAttribute(f.heart, 3));
  geo.setAttribute("aF1", new THREE.BufferAttribute(f.cloud, 3));
  geo.setAttribute("aF2", new THREE.BufferAttribute(f.waffle, 3));
  geo.setAttribute("aF3", new THREE.BufferAttribute(f.balanced, 3));
  geo.setAttribute("aFocus", new THREE.BufferAttribute(f.focus, 3));
  geo.setAttribute("aUnder", new THREE.BufferAttribute(f.under, 3));
  geo.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
  const flagAttr = new THREE.BufferAttribute(flags, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aFlag", flagAttr);

  const u = {
    uTime: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 }, uFrom: { value: 0 }, uTo: { value: 0 }, uMix: { value: 0 },
    uOffset: { value: new THREE.Vector3() }, uScale: { value: 1 }, uRotY: { value: 0 },
    uBeat: { value: 0 }, uLoosen: { value: 0 }, uReveal: { value: 0 },
    uMissedNaive: { value: 0 }, uMissedBest: { value: 0 }, uSynth: { value: 0 },
    uUnder: { value: 0 }, uKeep: { value: keep }, uYesBoost: { value: 0 },
    uQuadOn: { value: 0 }, uQuad: { value: new THREE.Vector4(1, 1, 1, 1) }, uDim: { value: 1 },
    uRecNaive: { value: naive.metrics.rec }, uFocusZoom: { value: built.anchors.focus.zoom * 0.72 }, // leave a gap between the magnified dots
    uNYes: { value: nYes }, uNNo: { value: nNo }, uFlight: { value: FLIGHT },
    uCCell: { value: cf.c }, uCCols: { value: cf.cols }, uCGap: { value: cf.g }, uCShift: { value: cf.best.shift }, uCK: { value: 1 },
    uAlpha: { value: new THREE.Vector2(ALPHA[0], ALPHA[0]) }, uSizeK: { value: new THREE.Vector2(1, 1) },
    uSize: { value: mobile ? 30 : 21 }, uPixelRatio: { value: stage.renderer.getPixelRatio() },
    uAccent: { value: new THREE.Color("#e5383b") }, uNo: { value: new THREE.Color("#3f7fd1") },
    uMissed: { value: new THREE.Color("#c98500") },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uMotion, uFrom, uTo, uMix, uScale, uRotY, uBeat, uLoosen, uReveal;
      uniform float uMissedNaive, uMissedBest, uSynth, uUnder, uKeep, uYesBoost, uQuadOn, uDim;
      uniform float uRecNaive, uFocusZoom, uNYes, uNNo, uFlight, uSize, uPixelRatio;
      uniform float uCCell, uCCols, uCGap, uCShift, uCK;
      uniform vec2 uAlpha, uSizeK;
      uniform vec3 uOffset, uAccent, uNo, uMissed;
      uniform vec4 uQuad;
      attribute vec3 aF1, aF2, aF3, aFocus, aUnder;
      attribute vec4 aMeta; // yes, synthetic, random, rank
      attribute vec3 aFlag; // flagged by the model: from, to, start time
      varying vec3 vColor; varying float vAlpha; varying float vSynth;

      vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
      // one cell of the confusion matrix; dx, dy: the direction a block grows from the center lines
      vec2 cell(float k, float dx, float dy) {
        float col = mod(k, uCCols), row = floor(k / uCCols);
        return vec2(dx * (uCGap + (col + 0.5) * uCCell), dy * (uCGap + (row + 0.5) * uCCell) + uCShift);
      }
      vec3 confusion(float yes, float rank, float flag) {
        float n = yes > 0.5 ? uNYes : uNNo, dy = yes > 0.5 ? 1.0 : -1.0;
        float j = floor(rank * n + 0.5);
        vec2 p = mix(cell(n - 1.0 - j, 1.0, dy), cell(j, -1.0, dy), flag) * uCK; // cleared | flagged
        return vec3(p, sin(flag * 3.14159) * 0.6); // people hop toward you as they cross
      }
      vec3 formation(float k, vec3 conf) {
        if (k < 0.5) return position;
        if (k < 1.5) return aF1;
        if (k < 2.5) return aF2;
        if (k < 3.5) return aF3;
        if (k < 4.5) return conf;
        if (k < 5.5) return aFocus;
        return aUnder;
      }
      vec3 animate(float k, vec3 p, float rnd) {
        vec3 drift = vec3(sin(uTime * 0.6 + rnd * 40.0), cos(uTime * 0.5 + rnd * 31.0), sin(uTime * 0.7 + rnd * 17.0));
        drift *= uMotion;
        if (k < 0.5) return rotY(p * (1.0 + uBeat * 0.045), uRotY) + drift * (0.01 + uLoosen * 0.3 * rnd);
        if (k < 1.5) return rotY(p, uTime * 0.05 * uMotion) + drift * 0.03;
        return p;
      }
      float weight(float k, float m) { // how much of formation k this dot shows right now
        return (abs(uFrom - k) < 0.5 ? 1.0 - m : 0.0) + (abs(uTo - k) < 0.5 ? m : 0.0);
      }
      void main() {
        float yes = aMeta.x, synth = aMeta.y, rnd = aMeta.z, rank = aMeta.w;
        float no = 1.0 - yes, real = 1.0 - synth;
        float flag = mix(aFlag.x, aFlag.y, smoothstep(0.0, 1.0, clamp((uTime - aFlag.z) / uFlight, 0.0, 1.0)));
        // reduced motion: no travel; each dot fades out, swaps place and fades back in
        float still = 1.0 - uMotion;
        float m = mix(smoothstep(rnd * 0.45, rnd * 0.45 + 0.55, uMix), step(0.5, uMix), still);
        vec3 conf = confusion(yes, rank, flag);
        vec3 a = animate(uFrom, formation(uFrom, conf), rnd);
        vec3 b = animate(uTo, formation(uTo, conf), rnd);
        float travelling = step(0.5, abs(uTo - uFrom)) * sin(m * 3.14159);
        vec3 swirl = vec3(sin(rnd * 6.283 + uTime), cos(rnd * 9.0), sin(rnd * 12.0)) * 0.7 * travelling * uMotion;

        // undersampling: the No's that weren't picked fall out of the frame
        float dropped = no * real * step(uKeep, rnd);
        vec3 fall = vec3((rnd - 0.5) * 0.4, -(0.8 + fract(rnd * 13.7) * 1.6), 0.0) * dropped * uUnder * uUnder;

        vec3 p = (mix(a, b, m) + fall) * uScale + uOffset + swirl * uScale;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float focus = weight(5.0, m);
        float boost = (1.0 + uYesBoost * yes * real * 0.6) * mix(1.0, uFocusZoom, focus * yes);
        gl_PointSize = uSize * uPixelRatio / -mv.z * mix(uSizeK.x, uSizeK.y, m) * boost * sqrt(uScale);

        // color: everyone is "the heart" until the reveal sorts them into Yes / No
        vec3 col = mix(uAccent, yes > 0.5 ? uAccent : uNo, uReveal);
        float missedN = yes * real * step(uRecNaive, rank);
        float missedB = yes * real * (1.0 - flag);
        col = mix(col, uMissed, max(uMissedNaive * missedN, uMissedBest * missedB));
        vColor = col;

        float quad = dot(vec4(yes * real * flag, missedB, no * flag, no * (1.0 - flag)), uQuad);
        float under = 1.0 - dropped * smoothstep(0.2, 0.9, uUnder);
        float crossing = 1.0 + sin(flag * 3.14159) * 0.8;
        vAlpha = mix(uAlpha.x, uAlpha.y, m) * mix(1.0, quad, uQuadOn) * under * uDim * mix(1.0, uSynth * 0.4, synth)
          * (1.0 - focus * no) // everyone else recedes into the dark
          * crossing * mix(1.0, abs(uMix - 0.5) * 2.0, still * step(0.5, abs(uTo - uFrom)));
        vSynth = synth;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha; varying float vSynth;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float solid = smoothstep(0.5, 0.1, d);
        float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.18, 0.3, d); // synthetic dots are hollow
        gl_FragColor = vec4(vColor, mix(solid, ring, vSynth) * vAlpha);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  stage.scene.add(points);

  // where the formation lives on screen: right of the text column on desktop, top area on phones
  // the hero gets its own spot: beside the headline, never behind it
  const heartR = (() => {
    let r = 0;
    for (let i = 0; i < built.nReal; i++) r = Math.max(r, Math.hypot(f.heart[i * 3], f.heart[i * 3 + 2]));
    return r;
  })();
  const layout = { cx: 0, cy: 0, fit: 1, heroCx: 0, heroK: 1 };
  function measure() {
    const { halfW, halfH } = stage;
    if (isMobile()) {
      layout.cx = 0;
      layout.cy = halfH * 0.42;
      layout.fit = Math.min(1, (1.9 * halfW) / 3.4, (0.9 * halfH) / 2.6);
      return;
    }
    const step = document.querySelector(".chapter .step:not(.plain)");
    const leftPx = (step ? step.getBoundingClientRect().right : innerWidth * 0.45) + 24;
    const areaW = ((innerWidth - leftPx) / innerWidth) * 2 * halfW;
    layout.cx = ((leftPx + innerWidth) / 2 / innerWidth) * 2 * halfW - halfW;
    layout.cy = 0;
    layout.fit = Math.min(1.05, (0.86 * areaW) / 3.4, (1.6 * halfH) / 2.6);
    const h1 = document.querySelector("#hero h1");
    if (h1) {
      const range = document.createRange();
      range.selectNodeContents(h1); // the words, not the full-width block
      const heroLeft = range.getBoundingClientRect().right + 24, heroRight = innerWidth - 64; // clear of the chapter rail
      const roomW = ((heroRight - heroLeft) / innerWidth) * 2 * halfW;
      layout.heroCx = ((heroLeft + heroRight) / 2 / innerWidth) * 2 * halfW - halfW;
      layout.heroK = Math.max(0.7, Math.min(1, (0.46 * roomW) / (heartR * 1.05 * layout.fit)));
    }
  }
  measure();
  addEventListener("resize", measure);
  document.fonts?.ready.then(measure); // the headline's width depends on the display font

  // --- the live confusion matrix -------------------------------------------------
  let now = 0, liveOn = false, live = best, beatPhase = 0;
  const shown = { tp: cut.tp, fp: cut.fp }; // block sizes, eased so the matrix reflows smoothly

  // move the cut-off within one group (base: index of its first dot, n: new count flagged)
  function moveCut(base, from, to) {
    if (from === to) return;
    const lo = Math.min(from, to), hi = Math.max(from, to), up = to > from;
    const spread = reducedMotion ? 0 : Math.min(0.6, (hi - lo) * 0.002);
    for (let j = lo; j < hi; j++) {
      const i = (base + j) * 3;
      flags[i] += (flags[i + 1] - flags[i]) * ease(Math.min(1, Math.max(0, (now - flags[i + 2]) / FLIGHT)));
      flags[i + 1] = up ? 1 : 0;
      const order = up ? j - lo : hi - 1 - j; // whoever stood nearest the old cut-off goes first
      flags[i + 2] = now + (spread * order) / (hi - lo) + (reducedMotion ? 0 : meta[(base + j) * 4 + 2] * 0.08);
    }
    flagAttr.addUpdateRange((base + lo) * 3, (hi - lo) * 3);
    flagAttr.needsUpdate = true;
  }
  function apply() {
    const r = liveOn ? live : best;
    const tp = Math.round(nYes * r.rec), fp = Math.round(nNo * r.fpr);
    moveCut(nNo, cut.tp, tp);
    moveCut(0, cut.fp, fp);
    Object.assign(cut, { tp, fp });
    heart.cm = r.cm;
  }

  const heart = {
    built, layout, uniforms: u, cm: best.cm,
    // the threshold explorer's counts at its current cut-off (a different model from the matrix's default)
    setCutoff(cm) { live = rates(cm); if (liveOn) apply(); },
    // while its step is current, the matrix follows the explorer; otherwise it shows the best model
    setLive(on) { if (on !== liveOn) { liveOn = on; apply(); } },
    // state: blended story state from story.js
    update(state, t, drag) {
      const dt = Math.min(0.05, Math.max(0, t - now));
      now = t;
      u.uTime.value = t;
      u.uFrom.value = state.from;
      u.uTo.value = state.to;
      u.uMix.value = state.mix;
      u.uAlpha.value.set(ALPHA[state.from], ALPHA[state.to]);
      u.uSizeK.value.set(SIZE[state.from], SIZE[state.to]);
      const desk = !isMobile();
      const x = desk ? layout.cx * state.ox + (layout.heroCx - layout.cx * state.ox) * state.hero : 0;
      // phones: a slightly smaller hero heart, lifted so its tip clears the headline
      u.uOffset.value.set(x, layout.cy + state.oy + (desk ? 0 : 0.3 * state.hero), 0);
      u.uScale.value = state.s * layout.fit * (1 + ((desk ? layout.heroK : 0.88) - 1) * state.hero);
      const heartWeight = (state.from === F.HEART ? 1 - state.mix : 0) + (state.to === F.HEART ? state.mix : 0);
      // ~68 bpm while the story runs; it slows to a resting ~45 bpm once everyone is back together
      beatPhase += dt / (0.88 + 0.45 * state.calm);
      u.uBeat.value = reducedMotion ? 0 : lubDub(beatPhase, 1) * state.beat * (1 - 0.3 * state.calm) * Math.min(1, heartWeight);
      // sway around the front view, so it always reads as a heart (a full spin shows it edge-on)
      u.uRotY.value = (reducedMotion ? 0 : Math.sin(t * 0.3) * 0.45) + drag;
      for (const k of ["loosen", "reveal", "missedNaive", "missedBest", "synth", "under", "yesBoost", "quadOn", "dim"]) {
        u[`u${k[0].toUpperCase()}${k.slice(1)}`].value = state[k];
      }
      u.uQuad.value.set(...state.quad);

      // reflow the matrix as its blocks grow and shrink; very tall ones shrink to stay in view
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
      shown.tp += (cut.tp - shown.tp) * k;
      shown.fp += (cut.fp - shown.fp) * k;
      const L = cf.layout(shown.tp, shown.fp), scale = Math.min(1, cf.best.height / L.height);
      u.uCShift.value = L.shift;
      u.uCK.value = scale;
      built.anchors.confusion = cf.anchorsOf(L, scale);
    },
    // false while the dots are faded out entirely (the explainers): the stage skips rendering
    get visible() { return u.uDim.value > 0.002; },
    // formation-local (x, y) -> world, matching the shader's offset and scale
    toWorld(x, y, out) {
      return out.set(x * u.uScale.value + u.uOffset.value.x, y * u.uScale.value + u.uOffset.value.y, 0);
    },
  };
  return heart;
}
