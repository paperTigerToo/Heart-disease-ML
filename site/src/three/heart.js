// The particle heart: one dot per ~10 respondents (per ~40 on phones), morphing between
// formations on the GPU as the story scrolls.
import * as THREE from "three";
import { buildFormations, F } from "./formations.js";
import { isMobile } from "./stage.js";
import { reducedMotion } from "../scroll/story.js";

const ALPHA = [0.26, 0.42, 0.48, 0.34, 0.5];   // per formation: dense heart glows, grids stay readable
const SIZE = [1.0, 0.9, 0.9, 0.75, 0.9];

export function lubDub(t, period = 0.88) {
  const p = (t % period) / period;
  return Math.exp(-(((p - 0.06) / 0.04) ** 2)) + 0.55 * Math.exp(-(((p - 0.25) / 0.05) ** 2));
}

export function createHeart(stage, ctx) {
  const mobile = isMobile();
  const per = mobile ? 40 : 10;
  const naive = ctx.m["logreg-22"], best = ctx.m["logreg-smoteenn"];
  const fprBest = best.cm.fp / (best.cm.fp + best.cm.tn);
  const built = buildFormations({
    nNo: Math.round(ctx.d.classes.No / per), nYes: Math.round(ctx.d.classes.Yes / per),
    recNaive: naive.metrics.rec, recBest: best.metrics.rec, fprBest, mobile,
  });
  const keep = ctx.r.methods.find((m) => m.id === "undersampling").counts.No / ctx.r.methods[0].counts.No;

  const geo = new THREE.BufferGeometry();
  const [f0, f1, f2, f3, f4] = built.formations;
  geo.setAttribute("position", new THREE.BufferAttribute(f0, 3));
  geo.setAttribute("aF1", new THREE.BufferAttribute(f1, 3));
  geo.setAttribute("aF2", new THREE.BufferAttribute(f2, 3));
  geo.setAttribute("aF3", new THREE.BufferAttribute(f3, 3));
  geo.setAttribute("aF4", new THREE.BufferAttribute(f4, 3));
  geo.setAttribute("aMeta", new THREE.BufferAttribute(built.meta, 4));

  const u = {
    uTime: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 }, uFrom: { value: 0 }, uTo: { value: 0 }, uMix: { value: 0 },
    uOffset: { value: new THREE.Vector3() }, uScale: { value: 1 }, uRotY: { value: 0 },
    uBeat: { value: 0 }, uLoosen: { value: 0 }, uReveal: { value: 0 },
    uMissedNaive: { value: 0 }, uMissedBest: { value: 0 }, uSynth: { value: 0 },
    uUnder: { value: 0 }, uKeep: { value: keep }, uYesBoost: { value: 0 },
    uQuadOn: { value: 0 }, uQuad: { value: new THREE.Vector4(1, 1, 1, 1) }, uDim: { value: 1 },
    uRecNaive: { value: naive.metrics.rec }, uRecBest: { value: best.metrics.rec }, uFprBest: { value: fprBest },
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
      uniform float uRecNaive, uRecBest, uFprBest, uSize, uPixelRatio;
      uniform vec2 uAlpha, uSizeK;
      uniform vec3 uOffset, uAccent, uNo, uMissed;
      uniform vec4 uQuad;
      attribute vec3 aF1, aF2, aF3, aF4;
      attribute vec4 aMeta; // yes, synthetic, random, rank
      varying vec3 vColor; varying float vAlpha; varying float vSynth;

      vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
      vec3 formation(float k) {
        if (k < 0.5) return position;
        if (k < 1.5) return aF1;
        if (k < 2.5) return aF2;
        if (k < 3.5) return aF3;
        return aF4;
      }
      vec3 animate(float k, vec3 p, float rnd) {
        vec3 drift = vec3(sin(uTime * 0.6 + rnd * 40.0), cos(uTime * 0.5 + rnd * 31.0), sin(uTime * 0.7 + rnd * 17.0));
        drift *= uMotion;
        if (k < 0.5) return rotY(p * (1.0 + uBeat * 0.045), uRotY) + drift * (0.01 + uLoosen * 0.3 * rnd);
        if (k < 1.5) return rotY(p, uTime * 0.05 * uMotion) + drift * 0.03;
        return p;
      }
      void main() {
        float yes = aMeta.x, synth = aMeta.y, rnd = aMeta.z, rank = aMeta.w;
        float m = smoothstep(rnd * 0.45, rnd * 0.45 + 0.55, uMix);
        vec3 a = animate(uFrom, formation(uFrom), rnd);
        vec3 b = animate(uTo, formation(uTo), rnd);
        float travelling = step(0.5, abs(uTo - uFrom)) * sin(m * 3.14159);
        vec3 swirl = vec3(sin(rnd * 6.283 + uTime), cos(rnd * 9.0), sin(rnd * 12.0)) * 0.7 * travelling * uMotion;
        vec3 p = mix(a, b, m) * uScale + uOffset + swirl * uScale;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float real = 1.0 - synth;
        float boost = 1.0 + uYesBoost * yes * real * 0.6;
        gl_PointSize = uSize * uPixelRatio / -mv.z * mix(uSizeK.x, uSizeK.y, m) * boost * sqrt(uScale);

        // color: everyone is "the heart" until the reveal sorts them into Yes / No
        vec3 col = mix(uAccent, yes > 0.5 ? uAccent : uNo, uReveal);
        float missedN = yes * real * step(uRecNaive, rank);
        float missedB = yes * real * step(uRecBest, rank);
        col = mix(col, uMissed, max(uMissedNaive * missedN, uMissedBest * missedB));
        vColor = col;

        float no = 1.0 - yes;
        float tp = yes * real * (1.0 - step(uRecBest, rank));
        float fp = no * (1.0 - step(uFprBest, rank));
        float tn = no * step(uFprBest, rank);
        float quad = dot(vec4(tp, missedB, fp, tn), uQuad);
        float under = 1.0 - uUnder * no * step(uKeep, rank) * 0.88;
        vAlpha = mix(uAlpha.x, uAlpha.y, m) * mix(1.0, quad, uQuadOn) * under * uDim * mix(1.0, uSynth * 0.4, synth);
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
  const layout = { cx: 0, cy: 0, fit: 1 };
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
  }
  measure();
  addEventListener("resize", measure);

  return {
    built, layout, uniforms: u,
    // state: blended story state from story.js
    update(state, t, drag) {
      u.uTime.value = t;
      u.uFrom.value = state.from;
      u.uTo.value = state.to;
      u.uMix.value = state.mix;
      u.uAlpha.value.set(ALPHA[state.from], ALPHA[state.to]);
      u.uSizeK.value.set(SIZE[state.from], SIZE[state.to]);
      const x = isMobile() ? 0 : layout.cx * state.ox;
      u.uOffset.value.set(x, layout.cy + state.oy, 0);
      u.uScale.value = state.s * layout.fit;
      const heartWeight = (state.from === F.HEART ? 1 - state.mix : 0) + (state.to === F.HEART ? state.mix : 0);
      u.uBeat.value = reducedMotion ? 0 : lubDub(t) * state.beat * Math.min(1, heartWeight);
      u.uRotY.value = (reducedMotion ? 0.35 : t * 0.22) + drag;
      for (const k of ["loosen", "reveal", "missedNaive", "missedBest", "synth", "under", "yesBoost", "quadOn", "dim"]) {
        u[`u${k[0].toUpperCase()}${k.slice(1)}`].value = state[k];
      }
      u.uQuad.value.set(...state.quad);
    },
    // formation-local (x, y) -> world, matching the shader's offset and scale
    toWorld(x, y, out) {
      return out.set(x * u.uScale.value + u.uOffset.value.x, y * u.uScale.value + u.uOffset.value.y, 0);
    },
  };
}
